"""Build a multi-teacher KD targets cache.

Computes weighted-average softmax across N teachers over the train+val rows
of the given splits CSV, with hflip TTA, and writes a .npy file.

Usage:
    python scripts/_build_kd_targets_generic.py \
        --teachers ckpt1.pt ckpt2.pt --weights 0.5 0.5 \
        --splits data/processed/splits_v16_for_training.csv \
        --out data/processed/v16proper_v19proper_targets_train_val.npy
"""
from __future__ import annotations
import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import timm
import torch
import torch.nn.functional as F
from PIL import Image
from torch.utils.data import DataLoader, Dataset
from torchvision import transforms
from tqdm import tqdm

ML = Path(__file__).resolve().parent.parent

CLASS_NAMES_14 = [
    "bacterial_spot", "corn_common_rust", "corn_gray_leaf_spot",
    "corn_northern_leaf_blight", "early_blight", "healthy", "late_blight",
    "leaf_mold", "mosaic_virus", "powdery_mildew", "septoria_leaf_spot",
    "spider_mites", "target_spot", "yellow_leaf_curl_virus",
]


class _DS(Dataset):
    def __init__(self, paths, hflip=False, img_size=224):
        self.paths = paths
        self.hflip = hflip
        resize_to = int(img_size * 256 / 224)
        self.tx = transforms.Compose([
            transforms.Resize(resize_to), transforms.CenterCrop(img_size),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ])
    def __len__(self): return len(self.paths)
    def __getitem__(self, i):
        img = Image.open(self.paths[i]).convert("RGB")
        if self.hflip: img = img.transpose(Image.FLIP_LEFT_RIGHT)
        return self.tx(img), i


@torch.no_grad()
def teacher_softmax(ckpt_path: Path, paths: list[str], device: str, batch=64,
                    num_workers=8, sleep_per_batch=0.0) -> np.ndarray:
    import time as _time
    ckpt = torch.load(ckpt_path, map_location=device, weights_only=False)
    arch = ckpt["arch"]
    model = timm.create_model(arch, pretrained=False, num_classes=ckpt.get("num_classes", 14))
    model.load_state_dict(ckpt["model_state_dict"], strict=True)
    model = model.to(device).eval()
    # detect input_size from timm default_cfg (e.g., 384 for swin_base_patch4_window12_384)
    img_size = int(model.default_cfg.get("input_size", (3, 224, 224))[1])
    if img_size != 224:
        print(f"  [info] {arch} uses input_size={img_size}")
    out = torch.zeros(len(paths), 14, device=device)
    for hflip in [False, True]:
        ds = _DS(paths, hflip=hflip, img_size=img_size)
        loader = DataLoader(ds, batch_size=batch, num_workers=num_workers, pin_memory=True)
        for x, idx in tqdm(loader, desc=f"  {ckpt_path.name} hflip={hflip}", leave=False):
            x = x.to(device, non_blocking=True)
            out[idx] += F.softmax(model(x), dim=1)
            if sleep_per_batch > 0:
                torch.cuda.synchronize()
                _time.sleep(sleep_per_batch)
    out = (out / 2).cpu().numpy()
    del model; torch.cuda.empty_cache()
    return out


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--teachers", nargs="+", type=Path, required=True)
    p.add_argument("--weights", nargs="+", type=float, required=True)
    p.add_argument("--splits", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--batch", type=int, default=64,
                   help="Per-teacher inference batch size. Lower = less VRAM (for headroom).")
    p.add_argument("--num-workers", type=int, default=8)
    p.add_argument("--sleep-per-batch", type=float, default=0.0,
                   help="Seconds to sleep between batches. Reduces GPU compute %% for sharing.")
    args = p.parse_args()

    assert len(args.teachers) == len(args.weights), "teachers and weights count mismatch"
    weights = np.array(args.weights) / sum(args.weights)

    splits = pd.read_csv(args.splits)
    train_val = splits[splits["split"].isin(["train", "val"])].reset_index(drop=True)
    paths = [str(ML / p) for p in train_val["path"].tolist()]
    print(f"[load] {len(paths)} train+val rows from {args.splits.name}")

    device = "cuda" if torch.cuda.is_available() else "cpu"

    target = np.zeros((len(paths), 14), dtype=np.float32)
    for ckpt, w in zip(args.teachers, weights):
        print(f"[teacher] {ckpt} (w={w:.4f})")
        sm = teacher_softmax(ckpt, paths, device, batch=args.batch,
                             num_workers=args.num_workers,
                             sleep_per_batch=args.sleep_per_batch)
        target += w * sm

    args.out.parent.mkdir(parents=True, exist_ok=True)
    np.save(args.out, target)
    print(f"[save] {args.out}  shape={target.shape}")
    # path sidecar for reproducibility
    paths_csv = args.out.with_suffix(".paths.csv")
    pd.DataFrame({"path": train_val["path"], "class": train_val["class"]}).to_csv(paths_csv, index=False)
    print(f"[save] {paths_csv}")


if __name__ == "__main__":
    sys.exit(main() or 0)
