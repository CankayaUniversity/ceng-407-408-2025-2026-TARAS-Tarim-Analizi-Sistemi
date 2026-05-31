"""Convert the 3-way disease ensemble (ML/models/ensemble_v8/*.pt) to ONNX."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
import timm
import torch

ROOT = Path(__file__).resolve().parent.parent.parent
ML = ROOT / "ML"
CONFIG = json.loads((ML / "inference" / "ensemble_config.json").read_text())
ENSEMBLE_DIR = ML / "models" / "ensemble_v8"

DRIFT_MAX = 0.005


def _load_pt(ckpt_path: Path, arch: str, input_size: int, window_size: int | None) -> torch.nn.Module:
    ckpt = torch.load(ckpt_path, map_location="cpu", weights_only=False)
    extra = {}
    if input_size != 224:
        extra["img_size"] = input_size
    if window_size is not None:
        extra["window_size"] = window_size
    model = timm.create_model(arch, pretrained=False, num_classes=14, **extra)
    model.load_state_dict(ckpt["model_state_dict"], strict=True)
    return model.eval()


def export_member(member: dict) -> Path:
    name = member["name"]
    arch = member["arch"]
    input_size = int(member.get("input_size", 224))
    window_size = member.get("window_size")
    pt_path = ENSEMBLE_DIR / member["checkpoint"]
    onnx_path = pt_path.with_suffix(".onnx")

    print(f"\n[{name}] {arch} input={input_size}" + (f" window={window_size}" if window_size else ""))
    print(f"  loading {pt_path.name}")
    model = _load_pt(pt_path, arch, input_size, window_size)
    dummy = torch.randn(1, 3, input_size, input_size)
    print(f"  exporting -> {onnx_path.name}")
    torch.onnx.export(
        model, dummy, str(onnx_path),
        input_names=["input"], output_names=["logits"],
        opset_version=17,
        do_constant_folding=True,
        dynamo=False,
    )
    size_mb = onnx_path.stat().st_size / (1024 * 1024)
    print(f"  size {size_mb:.2f} MB")

    print(f"  parity vs PT...")
    rng = np.random.default_rng(42 + hash(name) % 1000)
    x = rng.standard_normal((1, 3, input_size, input_size), dtype=np.float32)
    with torch.no_grad():
        pt_out = model(torch.from_numpy(x)).numpy()
    sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    onnx_out = sess.run(["logits"], {"input": x})[0]
    drift = float(np.max(np.abs(_softmax(pt_out) - _softmax(onnx_out))))
    same_top1 = int(pt_out.argmax()) == int(onnx_out.argmax())
    print(f"  max softmax drift {drift:.6f} (gate <= {DRIFT_MAX}), top1 match={same_top1}")
    if drift > DRIFT_MAX:
        raise RuntimeError(f"{name}: parity drift {drift} > {DRIFT_MAX}")
    if not same_top1:
        raise RuntimeError(f"{name}: top1 mismatch")
    return onnx_path


def _softmax(x: np.ndarray) -> np.ndarray:
    x = x - x.max(axis=-1, keepdims=True)
    e = np.exp(x)
    return e / e.sum(axis=-1, keepdims=True)


def main() -> None:
    for m in CONFIG["members"]:
        export_member(m)
    print("\n[ok] all members exported")


if __name__ == "__main__":
    main()
