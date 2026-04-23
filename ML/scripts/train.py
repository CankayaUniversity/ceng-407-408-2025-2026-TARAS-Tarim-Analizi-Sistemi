"""ConvNeXt-Small (10 disease-only classes) Stage 1 + Stage 2 training.

Usage:
    python scripts/train.py \
        --splits data/processed/splits.csv \
        --ckpt-dir checkpoints/convnext_small_disease10 \
        --batch-size 16 --grad-accum 2

Defaults target 8 GB VRAM (RTX 4060). Bump batch-size and drop grad-accum on larger GPUs.
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import torch
from torch import nn
from torch.amp import GradScaler

from taras.engine import evaluate, train_one_epoch
from taras.loaders import build_loaders
from taras.model import build_model, freeze_backbone, unfreeze_all
from taras.optim import build_optimizer, build_scheduler
from taras.train_config import TrainConfig
from taras.utils import get_logger, save_ckpt, set_seed


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--splits", type=str, default="data/processed/splits.csv")
    p.add_argument("--ckpt-dir", type=str, default="checkpoints/convnext_small_disease10")
    p.add_argument("--arch", type=str, default="convnext_small.fb_in22k_ft_in1k")
    p.add_argument("--batch-size", type=int, default=16)
    p.add_argument("--grad-accum", type=int, default=2)
    p.add_argument("--num-workers", type=int, default=4)
    p.add_argument("--stage1-epochs", type=int, default=3)
    p.add_argument("--stage2-epochs", type=int, default=35)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--no-amp", action="store_true")
    p.add_argument("--no-cutmix", action="store_true")
    p.add_argument("--device", type=str, default=None)
    p.add_argument("--source-weight-plantdoc", type=float, default=None,
                   help="Legacy: PD source weight (PV=1.0). Prefer --source-weight.")
    p.add_argument("--source-weight", action="append", default=[],
                   help="Repeatable key=value, e.g. `--source-weight plantdoc=10 --source-weight rw_blend=10`.")
    p.add_argument("--composite-pv-weight", type=float, default=0.6,
                   help="PV val F1 weight in composite score used for best-checkpoint selection.")
    p.add_argument("--persistent-workers", type=lambda s: s.lower() == "true", default=False,
                   help="DataLoader persistent_workers flag. Default False to avoid Windows pagefile crashes.")
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    log = get_logger()
    cfg = TrainConfig(
        batch_size=args.batch_size,
        grad_accum=args.grad_accum,
        num_workers=args.num_workers,
        stage1_epochs=args.stage1_epochs,
        stage2_epochs=args.stage2_epochs,
        seed=args.seed,
        splits_csv=args.splits,
        ckpt_dir=args.ckpt_dir,
        arch=args.arch,
        use_amp=not args.no_amp,
        use_cutmix=not args.no_cutmix,
    )
    set_seed(cfg.seed)
    torch.backends.cudnn.benchmark = True

    device = torch.device(args.device or ("cuda" if torch.cuda.is_available() else "cpu"))
    log.info(f"device={device}  arch={cfg.arch}  batch={cfg.batch_size}x{cfg.grad_accum}")

    source_weights: dict[str, float] | None = None
    if args.source_weight:
        source_weights = {"plantvillage": 1.0, "*": 1.0}
        for spec in args.source_weight:
            if "=" not in spec:
                raise ValueError(f"--source-weight expects key=value, got {spec!r}")
            k, v = spec.split("=", 1)
            source_weights[k.strip()] = float(v)
    elif args.source_weight_plantdoc is not None:
        source_weights = {"plantdoc": float(args.source_weight_plantdoc), "plantvillage": 1.0, "*": 1.0}
    if source_weights:
        log.info(f"source-weighted sampling ON: {source_weights}")

    loaders = build_loaders(
        cfg.splits_csv,
        batch_size=cfg.batch_size,
        num_workers=cfg.num_workers,
        source_weights=source_weights,
        persistent_workers=args.persistent_workers,
    )
    if "train" not in loaders or len(loaders["train"].dataset) == 0:
        log.error("No training samples in splits.csv")
        return 2

    model = build_model(arch=cfg.arch, drop_path_rate=cfg.drop_path_rate).to(device)
    criterion = nn.CrossEntropyLoss(label_smoothing=cfg.label_smoothing)
    use_amp = cfg.use_amp and device.type == "cuda"
    scaler = GradScaler("cuda", enabled=True) if use_amp else None

    ckpt_dir = Path(cfg.ckpt_dir)
    ckpt_dir.mkdir(parents=True, exist_ok=True)

    # --- Stage 1: head-only warmup -----------------------------------------
    log.info("stage 1 - head-only warmup")
    freeze_backbone(model)
    opt1 = build_optimizer(model, cfg, stage="stage1")
    for epoch in range(cfg.stage1_epochs):
        loss = train_one_epoch(model, loaders["train"], criterion, opt1, None,
                               scaler, cfg, device, use_cutmix=False)
        val_f1, val_acc = (evaluate(model, loaders["val"], device)
                           if "val" in loaders else (0.0, 0.0))
        log.info(f"[S1 {epoch+1}/{cfg.stage1_epochs}] loss={loss:.4f} val_f1={val_f1:.4f} val_acc={val_acc:.4f}")

    # --- Stage 2: full fine-tune -------------------------------------------
    log.info("stage 2 - full fine-tune")
    unfreeze_all(model)
    opt2 = build_optimizer(model, cfg, stage="stage2")
    steps_per_epoch = max(1, len(loaders["train"]) // max(1, cfg.grad_accum))
    sched = build_scheduler(opt2, cfg, steps_per_epoch)

    use_composite = "test_field" in loaders
    pv_w = float(args.composite_pv_weight)
    field_w = 1.0 - pv_w
    if use_composite:
        log.info(f"composite checkpoint score: {pv_w:.2f}*pv_val_f1 + {field_w:.2f}*field_f1 (Oyku formula)")
    best_score = 0.0
    patience_ctr = 0
    for epoch in range(cfg.stage2_epochs):
        t0 = time.time()
        loss = train_one_epoch(model, loaders["train"], criterion, opt2, sched,
                               scaler, cfg, device, use_cutmix=cfg.use_cutmix)
        val_f1, val_acc = (evaluate(model, loaders["val"], device)
                           if "val" in loaders else (0.0, 0.0))
        field_f1, field_acc = (evaluate(model, loaders["test_field"], device)
                                if use_composite else (0.0, 0.0))
        score = pv_w * val_f1 + field_w * field_f1 if use_composite else val_f1
        dt = time.time() - t0
        if use_composite:
            log.info(f"[S2 {epoch+1}/{cfg.stage2_epochs}] loss={loss:.4f} "
                     f"val_f1={val_f1:.4f} field_f1={field_f1:.4f} score={score:.4f} time={dt:.0f}s")
        else:
            log.info(f"[S2 {epoch+1}/{cfg.stage2_epochs}] loss={loss:.4f} "
                     f"val_f1={val_f1:.4f} val_acc={val_acc:.4f} time={dt:.0f}s")

        if score > best_score:
            best_score = score
            patience_ctr = 0
            save_ckpt(ckpt_dir / "best.pt", model, {
                "epoch": epoch, "val_f1": val_f1, "val_acc": val_acc,
                "field_f1": field_f1, "field_acc": field_acc, "score": score,
                "arch": cfg.arch, "num_classes": 10,
            })
            log.info(f"  * new best score={score:.4f}  (val_f1={val_f1:.4f} field_f1={field_f1:.4f})")
        else:
            patience_ctr += 1
            if patience_ctr >= cfg.patience:
                log.info(f"early stopping at epoch {epoch+1}")
                break

    log.info(f"done - best score={best_score:.4f} at {ckpt_dir / 'best.pt'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
