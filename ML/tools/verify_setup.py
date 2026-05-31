"""Sanity check: loads all 5 models (3 ensemble + 2 mobile) and times one
forward pass each. Run from the package root: `python tools/verify_setup.py`.
"""
import json
import sys
import time
from pathlib import Path

import torch
import timm

ROOT = Path(__file__).resolve().parent.parent
MODELS = ROOT / "models"
INFER = ROOT / "inference"

print(f"[setup] taras_release at {ROOT}\n")

# 1. Verify required packages
try:
    import torch
    import timm
    import numpy
    import pandas
    import sklearn
    import PIL
except ImportError as e:
    print(f"❌ Missing package: {e}")
    print("   Run: pip install -r requirements.txt")
    sys.exit(1)

print(f"✓ torch {torch.__version__}  ({'cuda' if torch.cuda.is_available() else 'cpu'} available)")
print(f"✓ timm {timm.__version__}")

# 2. Verify weights exist
print(f"\n[weights]")
WEIGHTS = {
    "ensemble v20_convnextv2":  MODELS / "ensemble_v8" / "v20_convnextv2_best.pt",
    "ensemble v26r_swin_s_384": MODELS / "ensemble_v8" / "v26r_swin_s_384_best.pt",
    "ensemble v32_swin_b_field":MODELS / "ensemble_v8" / "v32_swin_b_field_best.pt",
    "mobile (primary)":         MODELS / "mobile" / "disease_model.pt",
    "mobile (field-alt)":       MODELS / "mobile" / "disease_model_field_alt.pt",
    "teacher v19_v17 (for KD)": MODELS / "teachers" / "v19_v17_best.pt",
}
for name, p in WEIGHTS.items():
    if p.exists():
        sz = p.stat().st_size / 1024**2
        print(f"  ✓ {name:<30s}  {sz:>7.1f} MB  {p.relative_to(ROOT)}")
    else:
        print(f"  ✗ MISSING: {name}  →  {p.relative_to(ROOT)}")
        print(f"     (re-train via RECREATE_FROM_SCRATCH.md or copy from production system)")

# 3. Verify inference config
print(f"\n[inference config]")
cfg_path = INFER / "ensemble_config.json"
if not cfg_path.exists():
    print(f"  ✗ MISSING: {cfg_path}")
    sys.exit(1)
cfg = json.loads(cfg_path.read_text())
print(f"  ✓ schema_version={cfg['schema_version']}, {len(cfg['members'])} members")
for m in cfg["members"]:
    print(f"     - {m['name']:<22s}  {m['arch']:<55s}  input={m['input_size']}  weight={cfg['weight_profiles']['default']['weights'][m['name']]:.3f}")
if "calibration" in cfg:
    print(f"  ✓ calibration T={cfg['calibration']['temperature']}")

# 4. Verify dataset symlink
print(f"\n[dataset]")
images = ROOT / "data" / "images"
if images.is_symlink():
    target = images.resolve()
    print(f"  ✓ data/images symlinked to: {target}")
    if not target.exists():
        print(f"     ⚠ symlink target doesn't exist; re-create dataset_clean/images/")
elif images.is_dir():
    n = sum(1 for _ in images.rglob("*.jpg")) + sum(1 for _ in images.rglob("*.JPG"))
    print(f"  ✓ data/images present ({n} JPGs found)")
else:
    print(f"  ⚠ data/images not found — needed only for re-training, not inference")

# 5. Load one of each and time a single forward pass
print(f"\n[inference smoke test]")
device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"  device: {device}")

def load_and_time(ckpt_path: Path, arch: str, img_size: int = 224, window_size: int | None = None):
    if not ckpt_path.exists():
        print(f"  ✗ skipping {ckpt_path.name} (file missing)")
        return
    try:
        extra = {}
        if img_size != 224:
            extra["img_size"] = img_size
        if window_size is not None:
            extra["window_size"] = window_size
        model = timm.create_model(arch, pretrained=False, num_classes=14, **extra)
        ck = torch.load(ckpt_path, map_location=device, weights_only=False)
        model.load_state_dict(ck["model_state_dict"])
        model.to(device).eval()
        n_params = sum(p.numel() for p in model.parameters())

        x = torch.randn(1, 3, img_size, img_size, device=device)
        # Warm-up
        with torch.inference_mode():
            for _ in range(3):
                _ = model(x)
            if device == "cuda":
                torch.cuda.synchronize()
            t0 = time.perf_counter()
            for _ in range(5):
                _ = model(x)
            if device == "cuda":
                torch.cuda.synchronize()
            elapsed_ms = (time.perf_counter() - t0) * 1000 / 5

        print(f"  ✓ {ckpt_path.name:<35s}  params={n_params/1e6:>5.1f}M  inference={elapsed_ms:>6.1f} ms ({device}, b=1)")
        del model
        if device == "cuda":
            torch.cuda.empty_cache()
    except Exception as e:
        print(f"  ✗ {ckpt_path.name}: FAILED to load: {e}")

# Load each member of the ensemble + mobile
for m in cfg["members"]:
    ckpt = MODELS / "ensemble_v8" / m["checkpoint"]
    # Bundle config uses bundle-relative paths; resolve to taras_release layout
    if not ckpt.exists():
        # Try without the directory prefix
        ckpt = MODELS / "ensemble_v8" / (m["name"] + "_" + m["ckpt_source"] + ".pt")
    load_and_time(ckpt, m["arch"], m["input_size"], m.get("window_size"))

# Mobile
mobile_ckpt = MODELS / "mobile" / "disease_model.pt"
load_and_time(mobile_ckpt, "tf_efficientnet_b0.ns_jft_in1k", img_size=224)

print(f"\n[done] If all checks passed, you can run the inference scripts under inference/.")
print(f"       To re-train, follow RECREATE_FROM_SCRATCH.md.")
