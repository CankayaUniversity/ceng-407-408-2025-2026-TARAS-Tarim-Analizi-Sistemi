"""Reference inference for the EffNet-B0 mobile student — PyTorch.

Vanilla `tf_efficientnet_b0.ns_jft_in1k` from `timm` with a 14-class head;
reproducible from the checkpoint's `arch` field. For mobile deployment,
export to ONNX (`torch.onnx.export`) or TorchScript (`torch.jit.trace`).

Input:  torch.Tensor [B, 3, 224, 224] float32 (NCHW, ImageNet-normalised)
Output: torch.Tensor [B, 14] float32 logits (apply softmax for probabilities)
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import timm
import torch

HERE = Path(__file__).resolve().parent
LABELS = json.loads((HERE.parent / "shared" / "labels.json").read_text())
CLASSES = LABELS["classes"]
MEAN = torch.tensor([0.485, 0.456, 0.406], dtype=torch.float32).view(3, 1, 1)
STD  = torch.tensor([0.229, 0.224, 0.225], dtype=torch.float32).view(3, 1, 1)

_MODEL = None
_DEVICE = None


def load_disease_model(ckpt_path: str | Path = HERE / "disease_model.pt",
                        device: str = "cpu"):
    """Load the EffNet-B0 student. Returns model in eval() mode."""
    ckpt = torch.load(ckpt_path, map_location=device, weights_only=False)
    arch = ckpt.get("arch", "tf_efficientnet_b0.ns_jft_in1k")
    n = ckpt.get("num_classes", 14)
    model = timm.create_model(arch, pretrained=False, num_classes=n)
    model.load_state_dict(ckpt["model_state_dict"], strict=True)
    return model.to(device).eval()


def get_model(ckpt_path: str | Path = HERE / "disease_model.pt", device: str | None = None):
    global _MODEL, _DEVICE
    if _MODEL is None:
        _DEVICE = device or ("cuda" if torch.cuda.is_available() else "cpu")
        _MODEL = load_disease_model(str(ckpt_path), device=_DEVICE)
    return _MODEL


def preprocess_pil(pil_img) -> torch.Tensor:
    from PIL import Image
    if pil_img.mode != "RGB":
        pil_img = pil_img.convert("RGB")
    w, h = pil_img.size
    if w < h:
        new_w, new_h = 256, int(round(h * 256 / w))
    else:
        new_w, new_h = int(round(w * 256 / h)), 256
    pil_img = pil_img.resize((new_w, new_h), Image.BILINEAR)
    left = (new_w - 224) // 2
    top  = (new_h - 224) // 2
    pil_img = pil_img.crop((left, top, left + 224, top + 224))
    arr = np.asarray(pil_img, dtype=np.float32) / 255.0
    t = torch.from_numpy(arr).permute(2, 0, 1)
    t = (t - MEAN) / STD
    return t.unsqueeze(0)


@torch.no_grad()
def predict(pil_img, use_tta: bool = False) -> dict:
    """Run inference on a single PIL image. Returns top-1 + probabilities.

    use_tta=True adds hflip: 2x latency, ~+0.5pp accuracy.
    """
    model = get_model()
    img = preprocess_pil(pil_img).to(_DEVICE)
    logits = model(img)
    probs = torch.softmax(logits, dim=1)
    if use_tta:
        logits_flip = model(torch.flip(img, dims=[-1]))
        probs = (probs + torch.softmax(logits_flip, dim=1)) / 2.0

    p = probs[0].cpu().numpy()
    top1 = int(p.argmax())
    return {
        "top1_class": CLASSES[top1],
        "top1_index": top1,
        "top1_confidence": float(p[top1]),
        "top3": [
            {"class": CLASSES[int(i)], "confidence": float(p[int(i)])}
            for i in p.argsort()[::-1][:3]
        ],
        "tta_applied": use_tta,
    }


def export_to_onnx(out_path: str = "disease_model.onnx", opset: int = 17):
    """Export the PT checkpoint to ONNX (most mobile runtimes need it)."""
    model = get_model()
    dummy = torch.randn(1, 3, 224, 224, device=_DEVICE)
    torch.onnx.export(
        model, dummy, out_path,
        input_names=["input"], output_names=["logits"],
        dynamic_axes={"input": {0: "batch"}, "logits": {0: "batch"}},
        opset_version=opset,
        do_constant_folding=True,
        dynamo=False,
    )
    print(f"exported {out_path}")


def export_to_torchscript(out_path: str = "disease_model.ptl"):
    """Export to TorchScript Lite (`.ptl`) for PyTorch Mobile."""
    model = get_model()
    dummy = torch.randn(1, 3, 224, 224, device=_DEVICE)
    scripted = torch.jit.trace(model, dummy)
    optimized = torch.utils.mobile_optimizer.optimize_for_mobile(scripted)
    optimized._save_for_lite_interpreter(out_path)
    print(f"exported {out_path}")


if __name__ == "__main__":
    import sys
    from PIL import Image
    if len(sys.argv) < 2:
        print("Usage: python inference_mobile.py <image_path>")
        print("       python inference_mobile.py --export-onnx")
        print("       python inference_mobile.py --export-torchscript")
        sys.exit(1)
    if sys.argv[1] == "--export-onnx":
        export_to_onnx()
    elif sys.argv[1] == "--export-torchscript":
        export_to_torchscript()
    else:
        out = predict(Image.open(sys.argv[1]), use_tta=False)
        print(json.dumps(out, indent=2))
