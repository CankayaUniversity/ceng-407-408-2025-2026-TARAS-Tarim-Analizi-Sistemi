"""Reference Lambda inference for the 3-way disease classifier ensemble.

Loads three PyTorch checkpoints and averages their softmax with the weights
from `ensemble_config.json`. Cleaned-test macro F1 0.9614, accuracy 0.9647
on the 510-img balanced test_field (see EXP-25 → EXP-31 for the search).

Lambda packaging:
- Container image (zip is too small for ~745 MB of weights)
- Memory: 1024 MB recommended (~700 MB RAM for all 3 models)
- Cold start ~12-18 s; warm ~3-5 s (or ~5-7 s with TTA hflip enabled)
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import numpy as np
import timm
import torch

HERE = Path(__file__).resolve().parent
SHARED = HERE.parent / "shared"
LABELS = json.loads((SHARED / "labels.json").read_text())
ENSEMBLE = json.loads((HERE / "ensemble_config.json").read_text())
CLASSES = LABELS["classes"]
MEAN = torch.tensor([0.485, 0.456, 0.406], dtype=torch.float32).view(3, 1, 1)
STD  = torch.tensor([0.229, 0.224, 0.225], dtype=torch.float32).view(3, 1, 1)

_MODELS: list[tuple[str, torch.nn.Module, float]] | None = None
_DEVICE: str | None = None


def _load_member(ckpt_path: Path, arch: str, num_classes: int, device: str,
                 img_size: int | None = None, window_size: int | None = None) -> torch.nn.Module:
    ckpt = torch.load(ckpt_path, map_location=device, weights_only=False)
    extra = {}
    if img_size is not None and img_size != 224:
        extra["img_size"] = img_size
    if window_size is not None:
        extra["window_size"] = window_size
    model = timm.create_model(arch, pretrained=False, num_classes=num_classes, **extra)
    model.load_state_dict(ckpt["model_state_dict"], strict=True)
    return model.to(device).eval()


def _resolve_weights(profile_name: str | None = None) -> dict[str, float]:
    """Read weights for the given profile from ensemble_config.json.

    Schema 2 uses 'weight_profiles' map; falls back to schema 1 per-member 'weight'.
    """
    if "weight_profiles" in ENSEMBLE:
        profile = profile_name or ENSEMBLE.get("default_profile", "field_optimal")
        if profile not in ENSEMBLE["weight_profiles"]:
            raise ValueError(f"unknown weight profile {profile!r}; "
                             f"options: {list(ENSEMBLE['weight_profiles'])}")
        return dict(ENSEMBLE["weight_profiles"][profile]["weights"])
    return {m["name"]: float(m.get("weight", 0.0)) for m in ENSEMBLE["members"]}


def get_models(device: str | None = None,
               weight_profile: str | None = None
               ) -> list[tuple[str, torch.nn.Module, float, int]]:
    """Load all ensemble members on first call.
    Returns [(name, model, weight, input_size), ...].

    Each member declares its own input_size + optional window_size in
    ensemble_config.json — both must be passed to timm.create_model so the
    state_dict shapes match (v26r_swin_s_384 was trained at 384/window=12,
    not the swin_*_window7_224 baseline the arch name implies).
    """
    global _MODELS, _DEVICE
    if _MODELS is None:
        _DEVICE = device or ("cuda" if torch.cuda.is_available() else "cpu")
        torch.set_num_threads(int(os.environ.get("TORCH_NUM_THREADS") or (os.cpu_count() or 1)))
        weights = _resolve_weights(weight_profile)
        members = []
        for m in ENSEMBLE["members"]:
            ckpt = HERE / m["checkpoint"]
            input_size = int(m.get("input_size", 224))
            window_size = m.get("window_size")
            model = _load_member(
                ckpt, m["arch"], num_classes=14, device=_DEVICE,
                img_size=input_size if input_size != 224 else None,
                window_size=window_size,
            )
            w = float(weights.get(m["name"], 0.0))
            members.append((m["name"], model, w, input_size))
        _MODELS = members
    return _MODELS


def preprocess_pil(pil_img, input_size: int = 224) -> torch.Tensor:
    """PIL.Image -> torch.Tensor (1, 3, input_size, input_size) float32, ImageNet-normalised.

    Resize shorter side to int(input_size * 256/224), then center-crop to
    input_size. Must match training-time preprocessing.
    """
    from PIL import Image
    if pil_img.mode != "RGB":
        pil_img = pil_img.convert("RGB")
    resize_short = int(round(input_size * 256 / 224))
    w, h = pil_img.size
    if w < h:
        new_w, new_h = resize_short, int(round(h * resize_short / w))
    else:
        new_w, new_h = int(round(w * resize_short / h)), resize_short
    pil_img = pil_img.resize((new_w, new_h), Image.BILINEAR)
    left = (new_w - input_size) // 2
    top  = (new_h - input_size) // 2
    pil_img = pil_img.crop((left, top, left + input_size, top + input_size))
    arr = np.asarray(pil_img, dtype=np.float32) / 255.0
    t = torch.from_numpy(arr).permute(2, 0, 1)
    t = (t - MEAN) / STD
    return t.unsqueeze(0)


@torch.no_grad()
def predict(pil_img, use_tta: bool = True) -> dict:
    """Run the 3-way ensemble on a single PIL image. Returns top-1 + probabilities.

    Each member preprocesses at its own input_size (v26r needs 384, others 224).
    use_tta averages softmax over original + hflip per model: ~+0.5pp macro for
    2x forward time.
    """
    members = get_models()
    ensemble_probs = torch.zeros(1, 14, device=_DEVICE)
    for name, model, weight, input_size in members:
        img = preprocess_pil(pil_img, input_size=input_size).to(_DEVICE)
        img_pair = [img]
        if use_tta:
            img_pair.append(torch.flip(img, dims=[-1]))

        member_probs = torch.zeros(1, 14, device=_DEVICE)
        for x in img_pair:
            member_probs = member_probs + torch.softmax(model(x), dim=1)
        member_probs = member_probs / len(img_pair)
        ensemble_probs = ensemble_probs + weight * member_probs

    p = ensemble_probs[0].cpu().numpy()
    top1 = int(p.argmax())
    top3_idx = p.argsort()[::-1][:3]
    return {
        "top1_class": CLASSES[top1],
        "top1_index": top1,
        "top1_confidence": float(p[top1]),
        "all_probs": {CLASSES[i]: float(p[i]) for i in range(len(CLASSES))},
        "top3": [
            {"class": CLASSES[int(i)], "confidence": float(p[int(i)])}
            for i in top3_idx
        ],
        "tta_applied": use_tta,
        "ensemble_members": [m[0] for m in members],
        "input_sizes": [m[3] for m in members],
    }


def lambda_handler(event, context):
    """AWS Lambda entry point. Event: {"image_base64": <str>, "tta": <bool, default True>}.

    No crop_id — the 3-way ensemble handles all 14 classes uniformly
    (only the legacy CC-v16-final used crop_id).
    """
    import base64, io
    from PIL import Image

    img_bytes = base64.b64decode(event["image_base64"])
    pil_img = Image.open(io.BytesIO(img_bytes))
    use_tta = event.get("tta", True)
    result = predict(pil_img, use_tta=use_tta)
    return {"statusCode": 200, "body": json.dumps(result)}


if __name__ == "__main__":
    import sys
    from PIL import Image
    if len(sys.argv) < 2:
        print("Usage: python inference_lambda.py <image_path> [--no-tta]")
        sys.exit(1)
    use_tta = "--no-tta" not in sys.argv
    out = predict(Image.open(sys.argv[1]), use_tta=use_tta)
    print(json.dumps(out, indent=2))
