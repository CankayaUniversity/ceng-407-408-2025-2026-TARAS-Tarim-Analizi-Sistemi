"""Generate field-test confusion matrices for the v8 ensemble and the mobile model.

Run on the ML box (has dataset_clean/splits.csv, the checkpoints, timm + GPU):
    cd /mnt/storage/Dev/TARAS/ML
    python make_confusion_matrices.py

Outputs (next to this script):
    ensemble_field_confusion_matrix.png
    mobile_field_confusion_matrix.png

Uses inference/predict.py verbatim, so preprocessing / weights / TTA / temperature
match production exactly. Override paths with --splits / --img-root if needed.
"""
from __future__ import annotations
import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from sklearn.metrics import confusion_matrix, f1_score

ML = Path(__file__).resolve().parent
sys.path.insert(0, str(ML))
from inference.predict import predict_ensemble, predict_mobile, CLASSES  # noqa: E402


def resolve(p, img_root: Path) -> Path:
    p = Path(p)
    return p if p.is_absolute() else (img_root / p)


def run_model(field: pd.DataFrame, img_root: Path, cls_to_idx: dict, kind: str):
    y_true, y_pred = [], []
    n = len(field)
    for i, row in field.iterrows():
        path = resolve(row["path"], img_root)
        if kind == "ensemble":
            probs = predict_ensemble(path)[0]
        else:
            probs = predict_mobile(path)
        y_true.append(cls_to_idx[row["class"]])
        y_pred.append(int(np.argmax(probs)))
        if (i + 1) % 25 == 0 or (i + 1) == n:
            print(f"  [{kind}] {i + 1}/{n}", flush=True)
    return np.array(y_true), np.array(y_pred)


def plot_cm(y_true: np.ndarray, y_pred: np.ndarray, title: str, out: Path):
    labels = sorted(set(y_true.tolist()) | set(y_pred.tolist()))
    names = [CLASSES[i] for i in labels]
    cm = confusion_matrix(y_true, y_pred, labels=labels)
    macro = f1_score(y_true, y_pred, labels=sorted(set(y_true.tolist())), average="macro")

    fig, ax = plt.subplots(figsize=(10, 8.5))
    im = ax.imshow(cm, cmap="Blues")
    ax.set_xticks(range(len(names)))
    ax.set_xticklabels(names, rotation=45, ha="right", fontsize=8)
    ax.set_yticks(range(len(names)))
    ax.set_yticklabels(names, fontsize=8)
    ax.set_xlabel("Predicted")
    ax.set_ylabel("True")
    ax.set_title(f"{title}\nfield macro F1 = {macro:.4f}  (n={len(y_true)})")
    thresh = cm.max() / 2 if cm.max() else 1
    for r in range(cm.shape[0]):
        for c in range(cm.shape[1]):
            if cm[r, c]:
                ax.text(c, r, int(cm[r, c]), ha="center", va="center",
                        color="white" if cm[r, c] > thresh else "black", fontsize=8)
    fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
    fig.tight_layout()
    fig.savefig(out, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"saved {out}  (macro F1 {macro:.4f})", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--splits", type=Path,
                    default=Path("/mnt/storage/Dev/TARAS/dataset_clean/splits.csv"))
    ap.add_argument("--img-root", type=Path,
                    default=Path("/mnt/storage/Dev/TARAS/dataset_clean"),
                    help="root that relative paths in splits.csv resolve against")
    ap.add_argument("--out-dir", type=Path, default=ML)
    args = ap.parse_args()

    df = pd.read_csv(args.splits)
    field = df[(df["split"] == "test") & (df["test_type"] == "field")].reset_index(drop=True)
    print(f"field test images: {len(field)} (expected 332)")
    print(field.groupby("class").size().to_string())

    cls_to_idx = {c: i for i, c in enumerate(CLASSES)}

    yt, yp = run_model(field, args.img_root, cls_to_idx, "ensemble")
    plot_cm(yt, yp, "v8 Ensemble (ConvNeXt-V2 + Swin-S@384 + Swin-B@224) - Field test (PlantDoc)",
            args.out_dir / "ensemble_field_confusion_matrix.png")

    yt, yp = run_model(field, args.img_root, cls_to_idx, "mobile")
    plot_cm(yt, yp, "Mobile EfficientNet-B0 (distilled) - Field test (PlantDoc)",
            args.out_dir / "mobile_field_confusion_matrix.png")


if __name__ == "__main__":
    main()
