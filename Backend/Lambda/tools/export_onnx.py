"""One-time .bin -> .onnx conversion + golden probability generation.

Run this after the teammate retrains and hands over a new .bin. Produces
two artifacts consumed by the Docker build:

  1. model/taras_v2m_stage2_best.onnx  - the exported graph + weights
  2. tests/golden_probs.json           - PyTorch's output per fixture,
                                         used by the in-container parity test

Prerequisites:
  - model/taras_v2m_stage2_best.bin must exist
  - tests/fixtures/*.jpg must exist (one per class)
  - pip install -r tools/requirements.txt (torch + torchvision + onnxruntime + onnx)

Usage (from Backend/Lambda_V4/):
  python tools/export_onnx.py
"""
from __future__ import annotations

import io
import json
import sys
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
import torch
import torch.nn as nn
from PIL import Image
from torchvision import models, transforms

# --- Paths ---
ROOT = Path(__file__).resolve().parent.parent
BIN_PATH = ROOT / "model" / "taras_v2m_stage2_best.bin"
ONNX_PATH = ROOT / "model" / "taras_v2m_stage2_best.onnx"
FIXTURES_DIR = ROOT / "tests" / "fixtures"
GOLDEN_PATH = ROOT / "tests" / "golden_probs.json"

NUM_CLASSES = 6
INPUT_SIZE = (256, 256)
OPSET = 17
PARITY_TOLERANCE = 1e-3  # End-to-end drift after ONNX export

CLASS_NAMES = [
    "Tomato_Late_blight",
    "Tomato_Leaf_Mold",
    "Tomato_Leaf_blight",
    "Tomato_Septoria_leaf_spot",
    "Tomato_Spider_mites_Two_spotted_spider_mite",
    "Tomato_healthy",
]


def build_torch_model() -> nn.Module:
    model = models.efficientnet_v2_m(weights=None)
    in_features = model.classifier[1].in_features
    model.classifier[1] = nn.Linear(in_features, NUM_CLASSES)
    state_dict = torch.load(BIN_PATH, map_location="cpu", weights_only=True)
    model.load_state_dict(state_dict)
    model.eval()
    return model


def torchvision_preprocess() -> transforms.Compose:
    """Exact preprocessing pipeline the teammate trained with."""
    return transforms.Compose(
        [
            transforms.Resize(INPUT_SIZE),
            transforms.ToTensor(),
            transforms.Normalize(
                mean=[0.485, 0.456, 0.406],
                std=[0.229, 0.224, 0.225],
            ),
        ]
    )


def numpy_preprocess(image_bytes: bytes) -> np.ndarray:
    """Mirror of inference.py's runtime preprocessing - kept here to verify
    the numpy pipeline matches torchvision within tolerance."""
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    image = image.resize(INPUT_SIZE, Image.BILINEAR)
    arr = np.asarray(image, dtype=np.float32) / 255.0
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
    arr = (arr - mean) / std
    arr = arr.transpose(2, 0, 1)[None]  # HWC -> CHW, add batch dim
    return arr


def export_to_onnx(model: nn.Module) -> None:
    print(f"[EXPORT] writing {ONNX_PATH.name} (opset={OPSET})")
    dummy = torch.randn(1, 3, *INPUT_SIZE)
    torch.onnx.export(
        model,
        dummy,
        str(ONNX_PATH),
        input_names=["input"],
        output_names=["logits"],
        dynamic_axes={"input": {0: "batch"}, "logits": {0: "batch"}},
        opset_version=OPSET,
        do_constant_folding=True,
    )

    # Structural sanity check - the onnx package's checker catches malformed graphs.
    onnx_model = onnx.load(str(ONNX_PATH))
    onnx.checker.check_model(onnx_model)
    size_mb = ONNX_PATH.stat().st_size / 1024 / 1024
    print(f"[EXPORT] ok, {size_mb:.1f} MB, checker passed")


def generate_goldens_and_parity_check(model: nn.Module) -> None:
    preprocess = torchvision_preprocess()
    session = ort.InferenceSession(
        str(ONNX_PATH),
        providers=["CPUExecutionProvider"],
    )
    input_name = session.get_inputs()[0].name

    fixtures = sorted(FIXTURES_DIR.glob("*.jpg"))
    if not fixtures:
        print(f"[EXPORT] ERROR: no fixtures in {FIXTURES_DIR}", file=sys.stderr)
        sys.exit(1)

    golden: dict[str, dict] = {}
    max_drift = 0.0

    for fixture in fixtures:
        # Torch ground truth using torchvision preprocessing
        image = Image.open(fixture).convert("RGB")
        tensor = preprocess(image).unsqueeze(0)
        with torch.no_grad():
            logits = model(tensor)
            probs = torch.softmax(logits, dim=1)[0].numpy()

        # ONNX Runtime using numpy preprocessing (the actual runtime path)
        arr = numpy_preprocess(fixture.read_bytes())
        onnx_logits = session.run(None, {input_name: arr})[0]
        shifted = onnx_logits - onnx_logits.max(axis=1, keepdims=True)
        exp = np.exp(shifted)
        onnx_probs = (exp / exp.sum(axis=1, keepdims=True))[0]

        drift = float(np.abs(probs - onnx_probs).max())
        max_drift = max(max_drift, drift)
        status = "OK" if drift < PARITY_TOLERANCE else "WARN"
        print(f"[PARITY] {status} {fixture.name}: max|delta|={drift:.6f}")

        # Golden stores the PyTorch ground truth so the in-container test can
        # verify ONNX output without needing torch.
        golden[fixture.name] = {
            "probs": [round(float(p), 6) for p in probs],
            "argmax": int(probs.argmax()),
            "raw_class": CLASS_NAMES[int(probs.argmax())],
        }

    if max_drift >= PARITY_TOLERANCE:
        print(
            f"[PARITY] FAIL: max drift {max_drift:.6f} >= {PARITY_TOLERANCE} - "
            f"ONNX export or numpy preprocessing has drifted",
            file=sys.stderr,
        )
        sys.exit(2)

    GOLDEN_PATH.write_text(json.dumps(golden, indent=2, sort_keys=True))
    print(f"[EXPORT] wrote {GOLDEN_PATH.name} ({len(golden)} fixtures)")
    print(f"[EXPORT] max overall drift: {max_drift:.6f} (< {PARITY_TOLERANCE})")


def main() -> None:
    if not BIN_PATH.exists():
        print(f"[EXPORT] ERROR: {BIN_PATH} not found", file=sys.stderr)
        print("        copy taras_v2m_stage2_best.bin into model/ first", file=sys.stderr)
        sys.exit(1)

    model = build_torch_model()
    export_to_onnx(model)
    generate_goldens_and_parity_check(model)
    print("\n[EXPORT] done. Safe to run: docker build ...")


if __name__ == "__main__":
    main()
