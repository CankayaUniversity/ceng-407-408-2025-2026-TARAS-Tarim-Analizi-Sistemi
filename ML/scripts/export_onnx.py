"""Export a trained checkpoint to ONNX (opset 17) with a parity gate.

Mirrors the Backend/Lambda/tools/export_onnx.py workflow - same pattern of
(1) torch forward on a fixed dummy, (2) ORT forward on the same numpy dummy,
(3) assert |torch - ort| < 1e-3 before writing the file.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import onnx
import torch
from onnxsim import simplify

from taras.model import build_model

PARITY_TOL = 1e-3


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--ckpt", type=Path, default=Path("checkpoints/convnext_small_disease10/best.pt"))
    p.add_argument("--out",  type=Path, default=Path("outputs/taras_disease10.onnx"))
    p.add_argument("--opset", type=int, default=17)
    args = p.parse_args(argv)

    args.out.parent.mkdir(parents=True, exist_ok=True)

    ckpt = torch.load(args.ckpt, map_location="cpu", weights_only=False)
    arch = ckpt.get("arch", "convnext_small.fb_in22k_ft_in1k")
    num_classes = ckpt.get("num_classes", 10)
    model = build_model(arch=arch, pretrained=False, num_classes=num_classes)
    model.load_state_dict(ckpt["model_state_dict"])
    model.eval()

    dummy = torch.randn(1, 3, 224, 224)
    with torch.no_grad():
        torch_logits = model(dummy).cpu().numpy()

    torch.onnx.export(
        model, dummy, str(args.out),
        input_names=["input"], output_names=["logits"],
        dynamic_axes={"input": {0: "batch"}, "logits": {0: "batch"}},
        opset_version=args.opset,
        do_constant_folding=True,
    )
    onnx_model = onnx.load(str(args.out))
    onnx_model, ok = simplify(onnx_model)
    if not ok:
        raise RuntimeError("onnxsim simplification failed")
    onnx.save(onnx_model, str(args.out))

    import onnxruntime as ort
    sess = ort.InferenceSession(str(args.out), providers=["CPUExecutionProvider"])
    ort_logits = sess.run(None, {"input": dummy.numpy().astype(np.float32)})[0]
    delta = float(np.abs(torch_logits - ort_logits).max())
    print(f"[parity] max|torch - ort| = {delta:.6f}  tol={PARITY_TOL}")
    if delta >= PARITY_TOL:
        raise RuntimeError(f"ONNX parity gate failed: {delta:.6f} >= {PARITY_TOL}")

    size_mb = args.out.stat().st_size / 1e6
    print(f"[ok] wrote {args.out} ({size_mb:.1f} MB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
