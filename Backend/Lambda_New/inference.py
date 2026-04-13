"""Model lifecycle and inference - runs once at Lambda init, reused on warm invokes.

The model is loaded at MODULE LEVEL (not lazily on the first request). This
takes advantage of Lambda's init phase - up to 10 seconds of free compute
time before the first invocation counts against the billed duration - to
warm up torch, load the 213 MB state dict, and materialize the graph. Every
subsequent call on the same warm container reuses this.

Preprocessing uses standard ImageNet mean/std normalization because the
torchvision efficientnet_v2 family was trained that way upstream. This is
the OPPOSITE of what the old Keras model needed (raw [0, 255]) - do not
mix the two.
"""
from __future__ import annotations

import io
import time
from typing import TypedDict

import torch
import torch.nn as nn
from PIL import Image, UnidentifiedImageError
from torchvision import models, transforms

from config import MODEL_INPUT_SIZE, MODEL_PATH, NUM_CLASSES, logger
from labels import CLASS_NAMES, display_name

# Prevent thread oversubscription - Lambda CPU is shared with platform
# services, and torch's default thread pool can starve them.
torch.set_num_threads(1)


class PredictionResult(TypedDict):
    raw_class: str
    confidence_score: float
    all_scores: dict[str, float]  # display_name -> probability


def _build_model(num_classes: int = NUM_CLASSES) -> nn.Module:
    """EfficientNet V2-M with the classifier head replaced by a Linear->num_classes."""
    model = models.efficientnet_v2_m(weights=None)
    in_features = model.classifier[1].in_features
    model.classifier[1] = nn.Linear(in_features, num_classes)
    return model


_PREPROCESS = transforms.Compose(
    [
        transforms.Resize(MODEL_INPUT_SIZE),
        transforms.ToTensor(),
        transforms.Normalize(
            mean=[0.485, 0.456, 0.406],
            std=[0.229, 0.224, 0.225],
        ),
    ]
)


# --- Module-level init (runs once per cold start) ---
logger.info(f"[INIT] loading model path={MODEL_PATH}")
_init_start = time.monotonic()

_MODEL: nn.Module = _build_model()
_state_dict = torch.load(MODEL_PATH, map_location="cpu", weights_only=True)
_MODEL.load_state_dict(_state_dict)
_MODEL.eval()
del _state_dict  # free memory - the state dict is ~213 MB and we don't need it anymore

_init_ms = int((time.monotonic() - _init_start) * 1000)
logger.info(f"[INIT] model loaded in {_init_ms}ms classes={len(CLASS_NAMES)}")

# Drift sanity check: class count must match the classifier head
_head_out = _MODEL.classifier[1].out_features  # type: ignore[index]
if _head_out != len(CLASS_NAMES):
    raise RuntimeError(
        f"[INIT] class drift: model head outputs {_head_out} but "
        f"CLASS_NAMES has {len(CLASS_NAMES)}"
    )


class ImageDecodeError(ValueError):
    """Raised when the raw image bytes cannot be decoded by PIL."""


def predict(image_bytes: bytes) -> PredictionResult:
    """Run inference on raw image bytes.

    Raises ImageDecodeError if the bytes cannot be decoded. Any other
    exception bubbles up as an internal 500 in the handler.
    """
    try:
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except (UnidentifiedImageError, OSError) as exc:
        raise ImageDecodeError(
            f"Goruntu dosyasi okunamadi: {type(exc).__name__}"
        ) from exc

    tensor = _PREPROCESS(image).unsqueeze(0)

    with torch.no_grad():
        logits = _MODEL(tensor)
        probs = torch.softmax(logits, dim=1)[0]

    class_idx = int(torch.argmax(probs).item())
    raw_class = CLASS_NAMES[class_idx]
    confidence = float(probs[class_idx].item())

    all_scores = {
        display_name(CLASS_NAMES[i]): round(float(probs[i].item()), 6)
        for i in range(len(CLASS_NAMES))
    }

    return {
        "raw_class": raw_class,
        "confidence_score": confidence,
        "all_scores": all_scores,
    }
