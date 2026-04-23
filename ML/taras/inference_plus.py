"""TTA + temperature calibration + confidence-threshold inference.

Works with both a PyTorch `nn.Module` and an `onnxruntime.InferenceSession`.
Production Lambda code pulls `softmax_with_temperature`, `predict_with_tta`,
and `classify_with_uncertainty` from here.

Shape convention: input is a batched NCHW numpy float32 array of shape
[1, 3, H, W] already normalised with ImageNet mean/std. Output from a model
is logits of shape [1, num_classes].
"""
from __future__ import annotations

from typing import Any, Protocol

import numpy as np


DEFAULT_CONFIDENCE_THRESHOLD: float = 0.50


class _PredictBackend(Protocol):
    """Either a torch nn.Module or an onnxruntime InferenceSession."""

    def __call__(self, x: Any) -> Any: ...


def softmax_with_temperature(logits: np.ndarray, temperature: float = 1.0) -> np.ndarray:
    """Numerically-stable softmax scaled by T."""
    t = max(float(temperature), 1e-3)
    scaled = logits / t
    scaled = scaled - scaled.max()
    e = np.exp(scaled)
    return e / e.sum()


def _forward_torch(model, x_np: np.ndarray) -> np.ndarray:
    import torch
    was_training = model.training
    model.eval()
    device = next(model.parameters()).device
    with torch.no_grad():
        logits = model(torch.from_numpy(x_np).to(device))
    if was_training:
        model.train()
    return logits.cpu().numpy()[0]


def _forward_onnx(session, x_np: np.ndarray) -> np.ndarray:
    # InferenceSession.run returns list of outputs; first is logits
    return session.run(None, {session.get_inputs()[0].name: x_np})[0][0]


def _forward(backend, x_np: np.ndarray) -> np.ndarray:
    """Dispatch to torch or onnxruntime backend."""
    mod_name = type(backend).__module__
    if mod_name.startswith("onnxruntime"):
        return _forward_onnx(backend, x_np)
    return _forward_torch(backend, x_np)


def predict_with_tta(backend, image: np.ndarray, temperature: float = 1.0) -> np.ndarray:
    """Average softmax over 4 flips (identity, hflip, vflip, both).

    Args:
        backend: torch model OR onnxruntime InferenceSession.
        image:   NCHW float32 numpy of shape [1, 3, H, W], already normalised.
        temperature: calibration scalar; applied per-view then averaged.

    Returns:
        Averaged probability vector of shape [num_classes].
    """
    if image.ndim != 4 or image.shape[0] != 1:
        raise ValueError(f"expected NCHW with N=1, got shape {image.shape}")
    views = [
        image,
        np.flip(image, axis=3).copy(),
        np.flip(image, axis=2).copy(),
        np.flip(np.flip(image, axis=2), axis=3).copy(),
    ]
    probs_sum = None
    for v in views:
        logits = _forward(backend, v.astype(np.float32))
        p = softmax_with_temperature(logits, temperature)
        probs_sum = p if probs_sum is None else probs_sum + p
    return probs_sum / len(views)


def classify_with_uncertainty(
    backend,
    image: np.ndarray,
    class_names: list[str],
    temperature: float = 1.0,
    threshold: float = DEFAULT_CONFIDENCE_THRESHOLD,
) -> dict[str, Any]:
    """Full pipeline: TTA -> temperature -> threshold -> structured response."""
    probs = predict_with_tta(backend, image, temperature)
    top_idx = int(np.argmax(probs))
    top_conf = float(probs[top_idx])
    all_probs = {c: float(p) for c, p in zip(class_names, probs)}

    if top_conf < threshold:
        return {
            "status": "uncertain",
            "message_tr": "Emin degilim. Lutfen yapragin daha net bir fotografini cekin.",
            "message_en": "Not confident. Please take a clearer photo of the leaf.",
            "top_guess": class_names[top_idx],
            "top_confidence": top_conf,
            "all_probs": all_probs,
        }
    return {
        "status": "confident",
        "predicted_class": class_names[top_idx],
        "confidence": top_conf,
        "all_probs": all_probs,
    }


def read_temperature(path) -> float:
    """Load the calibrated T from a temperature.txt sidecar. Falls back to 1.0."""
    from pathlib import Path
    p = Path(path)
    if not p.exists():
        return 1.0
    try:
        return float(p.read_text().strip())
    except (ValueError, OSError):
        return 1.0
