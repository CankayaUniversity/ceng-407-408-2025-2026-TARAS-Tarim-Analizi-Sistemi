"""Dry-run the full pipeline on synthetic images. No datasets, no GPU required.

Asserts the graph connects: remap -> splits -> model forward -> 1 train step ->
eval -> ONNX export -> parity gate. Writes everything under a temp dir so repo
state stays clean.
"""
from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from PIL import Image
from torch import nn
from torch.utils.data import DataLoader

from configs.label_map import CLASS_NAMES, LABEL_MAP_15_TO_10
from taras.data import DiseaseDataset
from taras.engine import evaluate, train_one_epoch
from taras.model import build_model, freeze_backbone
from taras.optim import build_optimizer
from taras.train_config import TrainConfig
from taras.transforms import build_eval_transform, build_train_transform

N_PER_CLASS = 3
IMG_SIZE = 224


def _make_fake_tree(root: Path, orig_classes: list[str]) -> None:
    rng = np.random.default_rng(0)
    for i, orig in enumerate(orig_classes):
        cls_dir = root / orig
        cls_dir.mkdir(parents=True, exist_ok=True)
        for j in range(N_PER_CLASS):
            arr = (rng.integers(0, 255, size=(IMG_SIZE, IMG_SIZE, 3), dtype=np.uint8)
                   + i * 3 + j) % 255
            Image.fromarray(arr.astype(np.uint8)).save(cls_dir / f"img_{j}.jpg", quality=80)


def _run(cmd: list[str], cwd: Path) -> None:
    print(f"  $ {' '.join(cmd)}")
    subprocess.run(cmd, cwd=cwd, check=True)


def main() -> int:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        raw = root / "data" / "raw" / "plantvillage"
        dst = root / "data" / "processed" / "plantvillage_disease_only"
        orig_classes = list(LABEL_MAP_15_TO_10.keys())
        print(f"[1/6] seeding {len(orig_classes)} classes x {N_PER_CLASS} fake jpgs")
        _make_fake_tree(raw, orig_classes)

        # 2. remap
        print("[2/6] remap 15 -> 10")
        project_root = Path(__file__).resolve().parents[1]
        _run([sys.executable, str(project_root / "scripts" / "remap_dataset.py"),
              "--src", str(raw), "--dst", str(dst)], cwd=project_root)

        # 3. build splits directly (skip invoking make_splits - saves a subprocess)
        print("[3/6] make splits")
        rows = []
        for class_dir in dst.iterdir():
            for img in class_dir.iterdir():
                if img.suffix.lower() == ".jpg":
                    rows.append({"path": str(img.resolve()), "class": class_dir.name,
                                 "source": "plantvillage", "split": "train"})
        df = pd.DataFrame(rows)
        # Hold out one per class for val
        val_rows = df.groupby("class").head(1).index
        df.loc[val_rows, "split"] = "val"
        splits_csv = root / "splits.csv"
        df.to_csv(splits_csv, index=False)

        # 4. one training step
        print("[4/6] one train step")
        cfg = TrainConfig(
            batch_size=4, grad_accum=1, num_workers=0, use_amp=False,
            stage1_epochs=1, stage2_epochs=1,
        )
        device = torch.device("cpu")
        model = build_model(arch="convnext_tiny.fb_in22k_ft_in1k",
                            pretrained=False, drop_path_rate=0.0).to(device)
        freeze_backbone(model)
        train_df = df[df["split"] == "train"].reset_index(drop=True)
        val_df = df[df["split"] == "val"].reset_index(drop=True)
        train_loader = DataLoader(DiseaseDataset(train_df, transform=build_train_transform()),
                                   batch_size=4, shuffle=True, num_workers=0)
        val_loader = DataLoader(DiseaseDataset(val_df, transform=build_eval_transform()),
                                 batch_size=4, shuffle=False, num_workers=0)
        criterion = nn.CrossEntropyLoss(label_smoothing=0.1)
        opt = build_optimizer(model, cfg, stage="stage1")
        loss = train_one_epoch(model, train_loader, criterion, opt, None,
                               None, cfg, device, use_cutmix=False, progress=False)
        print(f"      train_loss={loss:.4f}")

        # 5. eval
        print("[5/6] eval")
        f1, acc = evaluate(model, val_loader, device, progress=False)
        print(f"      val_f1={f1:.4f}  val_acc={acc:.4f}")

        # 6. ONNX export + parity
        print("[6/6] ONNX export + parity")
        ckpt = root / "best.pt"
        torch.save({"model_state_dict": model.state_dict(),
                    "arch": "convnext_tiny.fb_in22k_ft_in1k",
                    "num_classes": 10}, ckpt)
        onnx_out = root / "smoke.onnx"
        _run([sys.executable, str(project_root / "scripts" / "export_onnx.py"),
              "--ckpt", str(ckpt), "--out", str(onnx_out)], cwd=project_root)
        size_mb = onnx_out.stat().st_size / 1e6

        assert len(CLASS_NAMES) == 10
        assert onnx_out.exists() and size_mb > 0.1
        print(f"\n[OK] smoke test passed - onnx size={size_mb:.1f} MB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
