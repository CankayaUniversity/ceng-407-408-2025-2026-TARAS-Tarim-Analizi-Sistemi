"""Standalone inference for the v8 3-way ensemble (CPU or GPU).

Usage:
    python inference/predict.py --image path/to/leaf.jpg
    python inference/predict.py --image path/to/leaf.jpg --mobile      # 16 MB mobile model
    python inference/predict.py --image path/to/leaf.jpg --topk 5

Cold start ~5-10 s; warm calls ~3-5 s CPU / ~80 ms GPU.
"""
from __future__ import annotations
import argparse
import json
import sys
import time
from pathlib import Path
from typing import Optional

import numpy as np
import timm
import torch
import torch.nn.functional as F
from PIL import Image
from torchvision import transforms

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
MODELS_DIR = ROOT / "models"
LABELS = json.loads((HERE / "labels.json").read_text())
ENSEMBLE_CFG = json.loads((HERE / "ensemble_config.json").read_text())
CLASSES = LABELS["classes"]
assert len(CLASSES) == 14, f"expected 14 classes, got {len(CLASSES)}"

MEAN = [0.485, 0.456, 0.406]
STD  = [0.229, 0.224, 0.225]

_ENSEMBLE: Optional[list[tuple[str, torch.nn.Module, int, Optional[int], float]]] = None
_MOBILE: Optional[torch.nn.Module] = None
_DEVICE: str = "cuda" if torch.cuda.is_available() else "cpu"


def _load_ensemble() -> list[tuple[str, torch.nn.Module, int, Optional[int], float]]:
    """Returns list of (name, model, input_size, window_size, weight)."""
    global _ENSEMBLE
    if _ENSEMBLE is not None:
        return _ENSEMBLE
    weights = ENSEMBLE_CFG["weight_profiles"]["default"]["weights"]
    members: list[tuple[str, torch.nn.Module, int, Optional[int], float]] = []
    for m in ENSEMBLE_CFG["members"]:
        name = m["name"]
        ckpt_path = MODELS_DIR / "ensemble_v8" / m["checkpoint"]
        if not ckpt_path.exists():
            raise FileNotFoundError(f"Missing checkpoint: {ckpt_path}\n"
                                    f"Re-train via RECREATE_FROM_SCRATCH.md or copy weights into models/ensemble_v8/")
        extra: dict = {}
        if m["input_size"] != 224:
            extra["img_size"] = m["input_size"]
        if "window_size" in m:
            extra["window_size"] = m["window_size"]
        model = timm.create_model(m["arch"], pretrained=False, num_classes=14, **extra)
        ck = torch.load(ckpt_path, map_location=_DEVICE, weights_only=False)
        model.load_state_dict(ck["model_state_dict"])
        model.to(_DEVICE).eval()
        members.append((name, model, m["input_size"], m.get("window_size"), float(weights[name])))
    _ENSEMBLE = members
    return _ENSEMBLE


def _load_mobile() -> torch.nn.Module:
    global _MOBILE
    if _MOBILE is not None:
        return _MOBILE
    ckpt_path = MODELS_DIR / "mobile" / "disease_model.pt"
    if not ckpt_path.exists():
        raise FileNotFoundError(f"Missing checkpoint: {ckpt_path}")
    model = timm.create_model("tf_efficientnet_b0.ns_jft_in1k", pretrained=False, num_classes=14)
    ck = torch.load(ckpt_path, map_location=_DEVICE, weights_only=False)
    model.load_state_dict(ck["model_state_dict"])
    model.to(_DEVICE).eval()
    _MOBILE = model
    return _MOBILE


def _preprocess(image_path: Path, img_size: int) -> torch.Tensor:
    """Load + preprocess one image. Returns NCHW tensor, ImageNet-normalised."""
    img = Image.open(image_path).convert("RGB")
    tfm = transforms.Compose([
        transforms.Resize(int(img_size * 256 / 224)),
        transforms.CenterCrop(img_size),
        transforms.ToTensor(),
        transforms.Normalize(MEAN, STD),
    ])
    return tfm(img).unsqueeze(0).to(_DEVICE)


@torch.inference_mode()
def predict_ensemble(image_path: Path, tta: bool = True) -> tuple[np.ndarray, dict]:
    """Returns (probs_14, debug_dict)."""
    members = _load_ensemble()
    debug: dict = {"per_member": {}}
    avg = torch.zeros(14, device=_DEVICE)
    for name, model, img_size, _window_size, weight in members:
        x = _preprocess(image_path, img_size)
        logits = model(x)
        prob = F.softmax(logits, dim=1).squeeze(0)
        if tta:
            x_flip = torch.flip(x, dims=[3])
            prob = (prob + F.softmax(model(x_flip), dim=1).squeeze(0)) / 2
        debug["per_member"][name] = {
            "weight": weight,
            "top1": CLASSES[int(prob.argmax())],
            "top1_prob": float(prob.max()),
        }
        avg += weight * prob

    if "calibration" in ENSEMBLE_CFG:
        T = float(ENSEMBLE_CFG["calibration"]["temperature"])
        log_p = torch.log(avg.clamp(min=1e-12))
        scaled = log_p / T
        avg = F.softmax(scaled, dim=0)
        debug["calibration_T"] = T

    return avg.cpu().numpy(), debug


@torch.inference_mode()
def predict_mobile(image_path: Path, tta: bool = True) -> np.ndarray:
    """Returns probs_14."""
    model = _load_mobile()
    x = _preprocess(image_path, 224)
    prob = F.softmax(model(x), dim=1).squeeze(0)
    if tta:
        x_flip = torch.flip(x, dims=[3])
        prob = (prob + F.softmax(model(x_flip), dim=1).squeeze(0)) / 2
    return prob.cpu().numpy()


def main():
    p = argparse.ArgumentParser(description="TARAS plant disease inference (v8 ensemble or mobile)")
    p.add_argument("--image", required=True, type=Path, help="Path to leaf image (jpg/png)")
    p.add_argument("--mobile", action="store_true", help="Use mobile (16 MB EffNet-B0) instead of 3-way ensemble")
    p.add_argument("--topk", type=int, default=3, help="Show top-K predictions (default 3)")
    p.add_argument("--no-tta", action="store_true", help="Skip hflip TTA (faster, slightly less accurate)")
    p.add_argument("--debug", action="store_true", help="Show per-member predictions (ensemble only)")
    args = p.parse_args()

    if not args.image.exists():
        print(f"ERROR: image not found: {args.image}", file=sys.stderr)
        sys.exit(1)

    t0 = time.perf_counter()
    if args.mobile:
        probs = predict_mobile(args.image, tta=not args.no_tta)
        debug = None
        which = "mobile (effnet_b0_v19_kd)"
    else:
        probs, debug = predict_ensemble(args.image, tta=not args.no_tta)
        which = "v8 ensemble (3-way: v20+v26r+v32)"
    elapsed = (time.perf_counter() - t0) * 1000

    topk_idx = np.argsort(-probs)[:args.topk]
    print(f"\nImage: {args.image}")
    print(f"Model: {which}")
    print(f"Device: {_DEVICE}, TTA: {'on' if not args.no_tta else 'off'}, latency: {elapsed:.0f} ms")
    print(f"\nTop-{args.topk} predictions:")
    for rank, idx in enumerate(topk_idx, 1):
        print(f"  {rank}. {CLASSES[idx]:<28s}  {probs[idx]*100:>6.2f}%")

    if args.debug and debug is not None:
        print(f"\nPer-member predictions:")
        for name, info in debug["per_member"].items():
            print(f"  {name:<22s} weight={info['weight']:.3f}  top1={info['top1']} ({info['top1_prob']*100:.1f}%)")
        if "calibration_T" in debug:
            print(f"  calibration T = {debug['calibration_T']}")


if __name__ == "__main__":
    main()
