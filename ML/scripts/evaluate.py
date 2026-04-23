"""Full evaluation suite per plan section 6.

Produces:
  - classification_report on PlantVillage test and PlantDoc field test
  - confusion matrix PNGs under outputs/
  - domain-shift drop (pv_acc - field_acc)
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import matplotlib.pyplot as plt
import seaborn as sns
import torch
from sklearn.metrics import classification_report, confusion_matrix

from configs.label_map import CLASS_NAMES
from taras.engine import evaluate
from taras.loaders import build_loaders
from taras.model import build_model


def _plot_confusion(cm, out_path: Path, title: str) -> None:
    plt.figure(figsize=(10, 8))
    sns.heatmap(cm, annot=True, fmt="d", xticklabels=CLASS_NAMES, yticklabels=CLASS_NAMES, cmap="Blues")
    plt.title(title)
    plt.xlabel("Predicted"); plt.ylabel("True")
    plt.xticks(rotation=45, ha="right"); plt.yticks(rotation=0)
    plt.tight_layout()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(out_path, dpi=150)
    plt.close()


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--ckpt", type=Path, default=Path("checkpoints/convnext_small_disease10/best.pt"))
    p.add_argument("--splits", type=str, default="data/processed/splits.csv")
    p.add_argument("--out-dir", type=Path, default=Path("outputs"))
    p.add_argument("--batch-size", type=int, default=32)
    p.add_argument("--num-workers", type=int, default=4)
    p.add_argument("--device", type=str, default=None)
    args = p.parse_args(argv)

    device = torch.device(args.device or ("cuda" if torch.cuda.is_available() else "cpu"))
    ckpt = torch.load(args.ckpt, map_location=device, weights_only=False)
    arch = ckpt.get("arch", "convnext_small.fb_in22k_ft_in1k")
    model = build_model(arch=arch, pretrained=False).to(device)
    model.load_state_dict(ckpt["model_state_dict"])

    loaders = build_loaders(args.splits, batch_size=args.batch_size, num_workers=args.num_workers)

    results: dict[str, float] = {}
    for split_name, title in [("test_pv", "PlantVillage test"), ("test_field", "PlantDoc field test")]:
        if split_name not in loaders:
            print(f"[skip] {split_name} not present in splits.csv")
            continue
        f1, acc, preds, labels = evaluate(model, loaders[split_name], device, return_preds=True)
        print(f"\n=== {title} ===")
        print(f"accuracy={acc:.4f}  macro_f1={f1:.4f}")
        print(classification_report(labels, preds, target_names=CLASS_NAMES, digits=4, zero_division=0))
        cm = confusion_matrix(labels, preds, labels=list(range(len(CLASS_NAMES))))
        _plot_confusion(cm, args.out_dir / f"confusion_{split_name}.png", title)
        results[f"{split_name}_acc"] = acc
        results[f"{split_name}_f1"] = f1

    if "test_pv_acc" in results and "test_field_acc" in results:
        drop = (results["test_pv_acc"] - results["test_field_acc"]) * 100
        print(f"\ndomain shift drop: {drop:.1f} percentage points")

    return 0


if __name__ == "__main__":
    sys.exit(main())
