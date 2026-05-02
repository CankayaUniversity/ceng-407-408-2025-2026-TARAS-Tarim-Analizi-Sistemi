"""Knowledge distillation: generic timm teacher -> mobile student.

Default recipe: T=4.0 temperature, alpha=0.7 KD weight, + CE on hard labels.
Best-ckpt selection uses the composite score `0.6*val_f1 + 0.4*field_f1` when
test_field is available (matches train.py for apples-to-apples comparison).
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import timm
import torch
import torch.nn.functional as F
from torch import nn

from configs.label_map import NUM_CLASSES
from taras.ema import ModelEma
from taras.engine import evaluate
from taras.loaders import build_loaders
from taras.utils import get_logger, save_ckpt, set_seed


def _load_teacher(ckpt_path: Path, device: torch.device) -> nn.Module:
    ckpt = torch.load(ckpt_path, map_location=device, weights_only=False)
    arch = ckpt.get("arch", "convnext_small.fb_in22k_ft_in1k")
    num_classes = ckpt.get("num_classes", NUM_CLASSES)
    teacher = timm.create_model(arch, pretrained=False, num_classes=num_classes).to(device)
    teacher.load_state_dict(ckpt["model_state_dict"], strict=True)
    teacher.eval()
    return teacher


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--teacher-ckpt", type=Path, required=True)
    p.add_argument("--student-arch", type=str, default="mobilenetv3_large_100.ra_in1k")
    p.add_argument("--out-dir", type=Path, default=Path("checkpoints/mobilenetv3_large_distilled"))
    p.add_argument("--splits", type=str, default="data/processed/splits.csv")
    p.add_argument("--epochs", type=int, default=25)
    p.add_argument("--batch-size", type=int, default=32)
    p.add_argument("--num-workers", type=int, default=4)
    p.add_argument("--temperature", type=float, default=4.0,
                   help="KD softening temperature (student<->teacher).")
    p.add_argument("--alpha", type=float, default=0.7,
                   help="KD loss weight vs CE on hard labels.")
    p.add_argument("--lr", type=float, default=5e-4)
    p.add_argument("--weight-decay", type=float, default=1e-4)
    p.add_argument("--composite-pv-weight", type=float, default=0.6,
                   help="Weight on val_f1 in composite score 0.6*val + 0.4*field.")
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--no-amp", action="store_true")
    p.add_argument("--ema-decay", type=float, default=0.0,
                   help="0.0 disables; 0.9999 enables EMA tracking on student")
    args = p.parse_args(argv)

    log = get_logger()
    set_seed(args.seed)
    torch.backends.cudnn.benchmark = True
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    args.out_dir.mkdir(parents=True, exist_ok=True)
    log.info(f"device={device}  teacher={args.teacher_ckpt.name}  student={args.student_arch}")

    teacher = _load_teacher(args.teacher_ckpt, device)
    student = timm.create_model(args.student_arch, pretrained=True, num_classes=NUM_CLASSES).to(device)

    loaders = build_loaders(args.splits, batch_size=args.batch_size, num_workers=args.num_workers)
    if "train" not in loaders:
        log.error("no train split found")
        return 2
    use_composite = "test_field" in loaders
    pv_w = float(args.composite_pv_weight)
    field_w = 1.0 - pv_w
    if use_composite:
        log.info(f"composite score: {pv_w:.2f}*val_f1 + {field_w:.2f}*field_f1 (matches train.py)")
    else:
        log.info("no test_field split — falling back to val_f1 for best ckpt")

    optim = torch.optim.AdamW(student.parameters(), lr=args.lr, weight_decay=args.weight_decay)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(optim, T_max=args.epochs * len(loaders["train"]))
    use_amp = (not args.no_amp) and device.type == "cuda"
    scaler = torch.amp.GradScaler("cuda", enabled=use_amp)

    T, alpha = args.temperature, args.alpha
    ce = nn.CrossEntropyLoss(label_smoothing=0.1)

    ema = ModelEma(student, decay=args.ema_decay) if args.ema_decay > 0 else None
    if ema is not None:
        log.info(f"[EMA] tracking student with decay={args.ema_decay}")

    best_score = 0.0
    ema_best_score = 0.0
    for epoch in range(args.epochs):
        student.train()
        t0 = time.time()
        total_loss = 0.0
        total_samples = 0
        for x, y, _ in loaders["train"]:
            x = x.to(device, non_blocking=True)
            y = y.to(device, non_blocking=True)
            with torch.no_grad():
                t_logits = teacher(x)
            with torch.amp.autocast(device_type=device.type, enabled=use_amp):
                s_logits = student(x)
                loss_kd = F.kl_div(
                    F.log_softmax(s_logits / T, dim=1),
                    F.softmax(t_logits / T, dim=1),
                    reduction="batchmean",
                ) * (T * T)
                loss_ce = ce(s_logits, y)
                loss = alpha * loss_kd + (1 - alpha) * loss_ce

            optim.zero_grad(set_to_none=True)
            if use_amp:
                scaler.scale(loss).backward()
                scaler.step(optim)
                scaler.update()
            else:
                loss.backward()
                optim.step()
            sched.step()
            if ema is not None:
                ema.update(student)
            total_loss += loss.item() * x.size(0)
            total_samples += x.size(0)

        mean_loss = total_loss / max(1, total_samples)
        val_f1, val_acc = (evaluate(student, loaders["val"], device)
                           if "val" in loaders else (0.0, 0.0))
        field_f1, field_acc = (evaluate(student, loaders["test_field"], device)
                               if use_composite else (0.0, 0.0))
        score = pv_w * val_f1 + field_w * field_f1 if use_composite else val_f1
        dt = time.time() - t0
        if use_composite:
            log.info(f"[{epoch+1}/{args.epochs}] loss={mean_loss:.4f} "
                     f"val_f1={val_f1:.4f} field_f1={field_f1:.4f} score={score:.4f} time={dt:.0f}s")
        else:
            log.info(f"[{epoch+1}/{args.epochs}] loss={mean_loss:.4f} "
                     f"val_f1={val_f1:.4f} val_acc={val_acc:.4f} time={dt:.0f}s")

        if score > best_score:
            best_score = score
            save_ckpt(args.out_dir / "best.pt", student, {
                "epoch": epoch,
                "val_f1": val_f1, "val_acc": val_acc,
                "field_f1": field_f1, "field_acc": field_acc,
                "score": score,
                "arch": args.student_arch, "num_classes": NUM_CLASSES,
                "teacher_ckpt": str(args.teacher_ckpt),
                "temperature": T, "alpha": alpha,
            })
            log.info(f"  * new best score={score:.4f}")

        if ema is not None:
            ema_val_f1, _ = evaluate(ema.module, loaders["val"], device, progress=False)
            ema_field_f1 = (evaluate(ema.module, loaders["test_field"], device, progress=False)[0]
                            if use_composite else 0.0)
            ema_score = pv_w * ema_val_f1 + field_w * ema_field_f1 if use_composite else ema_val_f1
            log.info(f"  EMA val_f1={ema_val_f1:.4f} field_f1={ema_field_f1:.4f} score={ema_score:.4f}")
            if ema_score > ema_best_score:
                ema_best_score = ema_score
                save_ckpt(args.out_dir / "ema-best.pt", ema.module, {
                    "epoch": epoch, "val_f1": ema_val_f1, "field_f1": ema_field_f1,
                    "score": ema_score, "arch": args.student_arch,
                    "num_classes": NUM_CLASSES,
                    "teacher_ckpt": str(args.teacher_ckpt),
                    "temperature": T, "alpha": alpha,
                })
                log.info(f"  * new EMA best score={ema_score:.4f}")
    log.info(f"done - best score={best_score:.4f} at {args.out_dir / 'best.pt'}"
             + (f"; EMA best={ema_best_score:.4f}" if ema is not None else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
