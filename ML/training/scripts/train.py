"""ConvNeXt / Swin Stage 1 + Stage 2 training with checkpoint resume + EMA.

Usage:
    python scripts/train.py --splits data/processed/splits.csv \
        --ckpt-dir checkpoints/swin_tiny_disease14_v7_ultimate \
        --arch swin_tiny_patch4_window7_224.ms_in22k_ft_in1k \
        --batch-size 32 --grad-accum 1 --patience 20 \
        --source-weight realworld=5

Resume: `--resume` loads `<ckpt-dir>/latest.pt` (full training state, rewritten
end of every epoch). EMA weights are saved separately as `ema-best.pt`.

Class-weighted CE: weights from train-split inverse frequency, capped at
`--class-weight-cap` (default 3.0×), re-normalized to mean 1.0. Disable with
`--class-weight-cap 1.0`.
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from torch import nn
from torch.amp import GradScaler

from configs.label_map import CLASS_TO_IDX, NUM_CLASSES
from taras.ema import ModelEma
from taras.engine import evaluate, train_one_epoch
from taras.loaders import build_loaders
from taras.model import build_cc_model, build_model, freeze_backbone, unfreeze_all
from taras.optim import build_optimizer, build_scheduler
from taras.train_config import TrainConfig
from taras.utils import get_logger, save_ckpt, set_seed


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--splits", type=str, default="data/processed/splits.csv")
    p.add_argument("--ckpt-dir", type=str, default="checkpoints/swin_tiny_disease14_v7_ultimate")
    p.add_argument("--arch", type=str, default="swin_tiny_patch4_window7_224.ms_in22k_ft_in1k")
    p.add_argument("--batch-size", type=int, default=32)
    p.add_argument("--grad-accum", type=int, default=1)
    p.add_argument("--num-workers", type=int, default=6)
    p.add_argument("--input-size", type=int, default=224,
                   help="Input image resolution (e.g. 224 or 384). Threaded through transforms + model.")
    p.add_argument("--window-size", type=int, default=None,
                   help="Override Swin window size (e.g. 12 for 384 inputs). Default: timm picks from arch.")
    p.add_argument("--stage1-epochs", type=int, default=3)
    p.add_argument("--stage2-epochs", type=int, default=50)
    p.add_argument("--patience", type=int, default=20,
                   help="Early-stop patience: epochs without best-score improvement.")
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--no-amp", action="store_true")
    p.add_argument("--no-cutmix", action="store_true")
    p.add_argument("--no-mixup", action="store_true")
    p.add_argument("--no-field-domain-rand", action="store_true",
                   help="Disable v7 heavier augmentation (revert to v5/v6 baseline aug).")
    p.add_argument("--device", type=str, default=None)
    p.add_argument("--source-weight-plantdoc", type=float, default=None,
                   help="Legacy: PD source weight. Prefer --source-weight.")
    p.add_argument("--source-weight", action="append", default=[],
                   help="Repeatable key=value, e.g. `--source-weight realworld=5`.")
    p.add_argument("--composite-pv-weight", type=float, default=0.5,
                   help="PV val F1 weight in composite score (default v7: 0.5 balanced).")
    p.add_argument("--persistent-workers", type=lambda s: s.lower() == "true", default=False,
                   help="DataLoader persistent_workers flag.")
    p.add_argument("--class-weight-cap", type=float, default=3.0,
                   help="Cap inverse-frequency class weights at this multiple. 1.0 disables weighting.")
    p.add_argument("--class-weight-mode", choices=["sqrt", "invfreq"], default="sqrt",
                   help="Class-weight formula. v7 used invfreq (overshot); v8 uses sqrt.")
    p.add_argument("--class-weight-lower", type=float, default=0.6,
                   help="Lower bound for sqrt-mode class weights (v8 default 0.6).")
    p.add_argument("--no-class-weights", action="store_true",
                   help="Force uniform CE (overrides --class-weight-* flags). Use to "
                        "ablate Round-4-style recipes against weighted baselines.")
    p.add_argument("--ema-decay", type=float, default=0.9999,
                   help="EMA decay (0.0 disables EMA tracking).")
    p.add_argument("--resume", action="store_true",
                   help="Resume from <ckpt-dir>/latest.pt if it exists.")
    p.add_argument("--crop-conditional", action="store_true",
                   help="Use CropConditionalModel — wraps the backbone with a "
                        "learned crop embedding concatenated to pooled features. "
                        "Requires `crop_id` column in the splits CSV.")
    p.add_argument("--crop-dropout", type=float, default=0.1,
                   help="Per-sample probability of replacing crop_id with UNKNOWN "
                        "during training (regularizer; 0 disables). Only used "
                        "when --crop-conditional is set.")
    return p.parse_args(argv)


def _compute_class_weights(splits_csv: str, cap: float, log,
                            mode: str = "sqrt", lower: float = 0.6) -> torch.Tensor:
    """Class weights from train-split rows.

    v8 (mode="sqrt"): sqrt-inverse-frequency, clamped to [lower, cap].
        w = sqrt(mean_count / count); weights[idx] = clamp(w, lower, cap)
        Avoids the v7 overshoot that downweighted abundant classes too aggressively.
    v7 (mode="invfreq"): mean_count / count, capped above only at `cap`,
        re-normalized to mean 1.0. Preserved for ablation/repro.
    """
    df = pd.read_csv(splits_csv)
    train_df = df[df["split"] == "train"]
    counts = train_df["class"].value_counts()
    if counts.empty:
        log.warning("[CLASS_WEIGHTS] no train rows; defaulting to uniform")
        return torch.ones(NUM_CLASSES)
    mean_count = counts.mean()
    weights = torch.ones(NUM_CLASSES)
    for cls_name, count in counts.items():
        idx = CLASS_TO_IDX.get(cls_name)
        if idx is None:
            continue
        ratio = mean_count / max(count, 1)
        if mode == "sqrt":
            w = float(np.sqrt(ratio))
            weights[idx] = max(lower, min(w, cap))
        else:  # invfreq (legacy v7)
            weights[idx] = min(ratio, cap)
    if mode == "invfreq" and cap > 1.0:
        weights = weights * (NUM_CLASSES / float(weights.sum()))
    log.info("[CLASS_WEIGHTS] mode={}  cap={:.2f}  lower={:.2f}  "
             "range=[{:.3f}, {:.3f}]  examples: {}".format(
                 mode, cap, lower if mode == "sqrt" else 0.0,
                 float(weights.min()), float(weights.max()),
                 {k: round(float(weights[CLASS_TO_IDX[k]]), 3)
                  for k in list(counts.index)[:5]},
             ))
    return weights


def _save_latest(ckpt_path: Path, *, model, optimizer, scheduler, scaler, ema,
                 stage: int, epoch: int, best_score: float, ema_best_score: float,
                 patience_ctr: int, arch: str, crop_conditional: bool = False) -> None:
    """Atomic write of the full training state to latest.pt (write tmp, then rename)."""
    state = {
        "model_state_dict": model.state_dict(),
        "opt_state_dict": optimizer.state_dict(),
        "sched_state_dict": scheduler.state_dict() if scheduler is not None else None,
        "scaler_state_dict": scaler.state_dict() if scaler is not None else None,
        "ema_state_dict": ema.state_dict() if ema is not None else None,
        "stage": stage,
        "epoch": epoch,
        "best_score": best_score,
        "ema_best_score": ema_best_score,
        "patience_ctr": patience_ctr,
        "arch": arch,
        "num_classes": NUM_CLASSES,
        "crop_conditional": crop_conditional,
    }
    tmp = ckpt_path.with_suffix(".pt.tmp")
    torch.save(state, tmp)
    tmp.replace(ckpt_path)


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
        use_mixup=not args.no_mixup,
        field_domain_rand=not args.no_field_domain_rand,
        class_weight_cap=args.class_weight_cap,
        ema_decay=args.ema_decay,
        patience=args.patience,
        crop_dropout=args.crop_dropout if args.crop_conditional else 0.0,
    )
    set_seed(cfg.seed)
    torch.backends.cudnn.benchmark = True
    torch.backends.cuda.matmul.allow_tf32 = True
    torch.backends.cudnn.allow_tf32 = True

    device = torch.device(args.device or ("cuda" if torch.cuda.is_available() else "cpu"))
    log.info(
        f"device={device}  arch={cfg.arch}  batch={cfg.batch_size}x{cfg.grad_accum}  "
        f"num_classes={NUM_CLASSES}  tf32=on  cutmix={cfg.use_cutmix}  mixup={cfg.use_mixup}  "
        f"field_domain_rand={cfg.field_domain_rand}  ema_decay={cfg.ema_decay}  "
        f"class_weight_cap={cfg.class_weight_cap}  patience={cfg.patience}"
    )

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
        img_size=args.input_size,
        field_domain_rand=cfg.field_domain_rand,
    )
    if "train" not in loaders or len(loaders["train"].dataset) == 0:
        log.error("No training samples in splits.csv")
        return 2

    if args.crop_conditional:
        log.info(f"[CROP_CONDITIONAL] enabled (dropout={cfg.crop_dropout:.2f})")
        _splits_df = pd.read_csv(cfg.splits_csv)
        if "crop_id" not in _splits_df.columns:
            log.error(f"--crop-conditional requires `crop_id` column in {cfg.splits_csv}. "
                      f"Run scripts/_build_crop_column.py to produce splits_v15_with_crop.csv.")
            return 2
        model = build_cc_model(arch=cfg.arch, drop_path_rate=cfg.drop_path_rate).to(device)
    else:
        model = build_model(
            arch=cfg.arch,
            drop_path_rate=cfg.drop_path_rate,
            img_size=args.input_size,
            window_size=args.window_size,
        ).to(device)

    # class-weighted CE recovers v7 collapse on mosaic_virus / TYLCV / corn_rust
    if args.no_class_weights:
        log.info("[CLASS_WEIGHTS] disabled (uniform CE)")
        class_weights = torch.ones(NUM_CLASSES).to(device)
    else:
        class_weights = _compute_class_weights(
            cfg.splits_csv, cfg.class_weight_cap, log,
            mode=args.class_weight_mode, lower=args.class_weight_lower,
        ).to(device)
    criterion = nn.CrossEntropyLoss(weight=class_weights, label_smoothing=cfg.label_smoothing)

    use_amp = cfg.use_amp and device.type == "cuda"
    scaler = GradScaler("cuda", enabled=True) if use_amp else None

    ema = ModelEma(model, decay=cfg.ema_decay) if cfg.ema_decay > 0.0 else None
    if ema is not None:
        log.info(f"[EMA] tracking with decay={cfg.ema_decay}")

    ckpt_dir = Path(cfg.ckpt_dir)
    ckpt_dir.mkdir(parents=True, exist_ok=True)
    latest_path = ckpt_dir / "latest.pt"

    # resume bookkeeping
    resume_state: dict | None = None
    skip_stage1 = False
    start_s1_epoch = 0
    start_s2_epoch = 0
    best_score = 0.0
    ema_best_score = 0.0
    patience_ctr = 0
    if args.resume:
        if latest_path.exists():
            resume_state = torch.load(latest_path, map_location=device, weights_only=False)
            model.load_state_dict(resume_state["model_state_dict"])
            if ema is not None and resume_state.get("ema_state_dict") is not None:
                ema.load_state_dict(resume_state["ema_state_dict"])
                log.info("[RESUME] restored EMA state")
            log.info(f"[RESUME] loaded {latest_path} stage={resume_state['stage']} "
                     f"epoch={resume_state['epoch']} best={resume_state.get('best_score', 0.0):.4f} "
                     f"ema_best={resume_state.get('ema_best_score', 0.0):.4f}")
            if resume_state["stage"] == 1:
                if resume_state["epoch"] + 1 >= cfg.stage1_epochs:
                    skip_stage1 = True
                    log.info("[RESUME] stage 1 fully complete; advancing to stage 2 from epoch 0")
                else:
                    start_s1_epoch = resume_state["epoch"] + 1
                    log.info(f"[RESUME] resuming stage 1 at epoch {start_s1_epoch}/{cfg.stage1_epochs}")
            elif resume_state["stage"] == 2:
                skip_stage1 = True
                start_s2_epoch = resume_state["epoch"] + 1
                best_score = resume_state.get("best_score", 0.0)
                ema_best_score = resume_state.get("ema_best_score", 0.0)
                patience_ctr = resume_state.get("patience_ctr", 0)
                log.info(f"[RESUME] resuming stage 2 at epoch {start_s2_epoch}/{cfg.stage2_epochs}")
        else:
            log.info(f"[RESUME] no {latest_path}; starting fresh")

    # stage 1: head-only warmup
    if not skip_stage1:
        log.info("stage 1 - head-only warmup")
        freeze_backbone(model)
        opt1 = build_optimizer(model, cfg, stage="stage1")
        if resume_state is not None and resume_state["stage"] == 1:
            opt1.load_state_dict(resume_state["opt_state_dict"])
            log.info("[RESUME] restored stage-1 optimizer state")
        for epoch in range(start_s1_epoch, cfg.stage1_epochs):
            loss = train_one_epoch(model, loaders["train"], criterion, opt1, None,
                                   scaler, cfg, device,
                                   use_cutmix=False, use_mixup=False, ema_model=ema)
            val_f1, val_acc = (evaluate(model, loaders["val"], device)
                               if "val" in loaders else (0.0, 0.0))
            log.info(f"[S1 {epoch+1}/{cfg.stage1_epochs}] loss={loss:.4f} val_f1={val_f1:.4f} val_acc={val_acc:.4f}")
            _save_latest(latest_path, model=model, optimizer=opt1, scheduler=None,
                         scaler=scaler, ema=ema, stage=1, epoch=epoch,
                         best_score=best_score, ema_best_score=ema_best_score,
                         patience_ctr=patience_ctr, arch=cfg.arch,
                         crop_conditional=args.crop_conditional)

    # stage 2: full fine-tune
    log.info("stage 2 - full fine-tune")
    unfreeze_all(model)
    opt2 = build_optimizer(model, cfg, stage="stage2")
    steps_per_epoch = max(1, len(loaders["train"]) // max(1, cfg.grad_accum))
    sched = build_scheduler(opt2, cfg, steps_per_epoch)

    if resume_state is not None and resume_state["stage"] == 2:
        opt2.load_state_dict(resume_state["opt_state_dict"])
        if resume_state.get("sched_state_dict") is not None:
            sched.load_state_dict(resume_state["sched_state_dict"])
        if scaler is not None and resume_state.get("scaler_state_dict") is not None:
            scaler.load_state_dict(resume_state["scaler_state_dict"])
        log.info("[RESUME] restored stage-2 optimizer + scheduler + scaler state")

    use_composite = "test_field" in loaders
    pv_w = float(args.composite_pv_weight)
    field_w = 1.0 - pv_w
    if use_composite:
        log.info(f"composite checkpoint score: {pv_w:.2f}*pv_val_f1 + {field_w:.2f}*field_f1")
    for epoch in range(start_s2_epoch, cfg.stage2_epochs):
        t0 = time.time()
        loss = train_one_epoch(model, loaders["train"], criterion, opt2, sched,
                               scaler, cfg, device,
                               use_cutmix=cfg.use_cutmix, use_mixup=cfg.use_mixup,
                               ema_model=ema)
        val_f1, val_acc = (evaluate(model, loaders["val"], device)
                           if "val" in loaders else (0.0, 0.0))
        field_f1, field_acc = (evaluate(model, loaders["test_field"], device)
                                if use_composite else (0.0, 0.0))
        score = pv_w * val_f1 + field_w * field_f1 if use_composite else val_f1

        ema_val_f1 = ema_field_f1 = ema_score = 0.0
        if ema is not None:
            ema_val_f1, _ = (evaluate(ema.module, loaders["val"], device)
                             if "val" in loaders else (0.0, 0.0))
            ema_field_f1, _ = (evaluate(ema.module, loaders["test_field"], device)
                                if use_composite else (0.0, 0.0))
            ema_score = pv_w * ema_val_f1 + field_w * ema_field_f1 if use_composite else ema_val_f1

        dt = time.time() - t0
        if use_composite:
            log.info(f"[S2 {epoch+1}/{cfg.stage2_epochs}] loss={loss:.4f} "
                     f"val_f1={val_f1:.4f} field_f1={field_f1:.4f} score={score:.4f}"
                     + (f"  EMA val={ema_val_f1:.4f} field={ema_field_f1:.4f} "
                        f"score={ema_score:.4f}" if ema is not None else "")
                     + f" time={dt:.0f}s")
        else:
            log.info(f"[S2 {epoch+1}/{cfg.stage2_epochs}] loss={loss:.4f} "
                     f"val_f1={val_f1:.4f} val_acc={val_acc:.4f} time={dt:.0f}s")

        improved = False
        if score > best_score:
            best_score = score
            patience_ctr = 0
            improved = True
            save_ckpt(ckpt_dir / "best.pt", model, {
                "epoch": epoch, "val_f1": val_f1, "val_acc": val_acc,
                "field_f1": field_f1, "field_acc": field_acc, "score": score,
                "arch": cfg.arch, "num_classes": NUM_CLASSES,
                "crop_conditional": args.crop_conditional,
            })
            log.info(f"  * new best score={score:.4f}  (val_f1={val_f1:.4f} field_f1={field_f1:.4f})")

        if ema is not None and ema_score > ema_best_score:
            ema_best_score = ema_score
            improved = True
            save_ckpt(ckpt_dir / "ema-best.pt", ema.module, {
                "epoch": epoch, "val_f1": ema_val_f1,
                "field_f1": ema_field_f1, "score": ema_score,
                "arch": cfg.arch, "num_classes": NUM_CLASSES,
                "crop_conditional": args.crop_conditional,
            })
            log.info(f"  * new EMA best score={ema_score:.4f}  "
                     f"(val_f1={ema_val_f1:.4f} field_f1={ema_field_f1:.4f})")

        if not improved:
            patience_ctr += 1

        _save_latest(latest_path, model=model, optimizer=opt2, scheduler=sched,
                     scaler=scaler, ema=ema, stage=2, epoch=epoch,
                     best_score=best_score, ema_best_score=ema_best_score,
                     patience_ctr=patience_ctr, arch=cfg.arch,
                     crop_conditional=args.crop_conditional)

        if patience_ctr >= cfg.patience:
            log.info(f"early stopping at epoch {epoch+1}")
            break

    log.info(f"done - best score={best_score:.4f} at {ckpt_dir / 'best.pt'}"
             + (f"; EMA best={ema_best_score:.4f} at {ckpt_dir / 'ema-best.pt'}"
                if ema is not None else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
