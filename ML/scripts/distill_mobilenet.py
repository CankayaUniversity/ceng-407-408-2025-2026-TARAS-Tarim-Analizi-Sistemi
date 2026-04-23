"""Knowledge distillation: ConvNeXt-Small teacher -> MobileNetV2 student.

Student target size: ~14 MB (MobileNetV2 ~3.4M params) - suitable for mobile.
Recipe: T=4.0 temperature, alpha=0.7 KD weight, + CE on hard labels for the rest.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import timm
import torch
import torch.nn.functional as F
from torch import nn

from configs.label_map import NUM_CLASSES
from taras.engine import evaluate
from taras.loaders import build_loaders
from taras.model import build_model
from taras.utils import get_logger, save_ckpt, set_seed


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--teacher-ckpt", type=Path, default=Path("checkpoints/convnext_small_disease10/best.pt"))
    p.add_argument("--student-arch", type=str, default="mobilenetv2_100.ra_in1k")
    p.add_argument("--out-dir", type=Path, default=Path("checkpoints/mobilenetv2_disease10"))
    p.add_argument("--splits", type=str, default="data/processed/splits.csv")
    p.add_argument("--epochs", type=int, default=25)
    p.add_argument("--batch-size", type=int, default=32)
    p.add_argument("--num-workers", type=int, default=4)
    p.add_argument("--temperature", type=float, default=4.0)
    p.add_argument("--alpha", type=float, default=0.7)
    p.add_argument("--lr", type=float, default=5e-4)
    p.add_argument("--weight-decay", type=float, default=1e-4)
    p.add_argument("--seed", type=int, default=42)
    args = p.parse_args(argv)

    log = get_logger()
    set_seed(args.seed)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    args.out_dir.mkdir(parents=True, exist_ok=True)

    teacher_ckpt = torch.load(args.teacher_ckpt, map_location=device, weights_only=False)
    teacher_arch = teacher_ckpt.get("arch", "convnext_small.fb_in22k_ft_in1k")
    teacher = build_model(arch=teacher_arch, pretrained=False).to(device)
    teacher.load_state_dict(teacher_ckpt["model_state_dict"])
    teacher.eval()

    student = timm.create_model(args.student_arch, pretrained=True, num_classes=NUM_CLASSES).to(device)

    loaders = build_loaders(args.splits, batch_size=args.batch_size, num_workers=args.num_workers)
    if "train" not in loaders:
        log.error("no train split found")
        return 2

    optim = torch.optim.AdamW(student.parameters(), lr=args.lr, weight_decay=args.weight_decay)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(optim, T_max=args.epochs * len(loaders["train"]))

    T, alpha = args.temperature, args.alpha
    ce = nn.CrossEntropyLoss(label_smoothing=0.1)

    best_f1 = 0.0
    for epoch in range(args.epochs):
        student.train()
        for x, y, _ in loaders["train"]:
            x = x.to(device, non_blocking=True)
            y = y.to(device, non_blocking=True)
            with torch.no_grad():
                t_logits = teacher(x)
            s_logits = student(x)

            loss_kd = F.kl_div(
                F.log_softmax(s_logits / T, dim=1),
                F.softmax(t_logits / T, dim=1),
                reduction="batchmean",
            ) * (T * T)
            loss_ce = ce(s_logits, y)
            loss = alpha * loss_kd + (1 - alpha) * loss_ce

            optim.zero_grad(set_to_none=True)
            loss.backward()
            optim.step()
            sched.step()

        val_f1, val_acc = (evaluate(student, loaders["val"], device)
                           if "val" in loaders else (0.0, 0.0))
        log.info(f"[distill {epoch+1}/{args.epochs}] val_f1={val_f1:.4f} val_acc={val_acc:.4f}")
        if val_f1 > best_f1:
            best_f1 = val_f1
            save_ckpt(args.out_dir / "best.pt", student, {
                "epoch": epoch, "val_f1": val_f1, "val_acc": val_acc,
                "arch": args.student_arch, "num_classes": NUM_CLASSES,
                "teacher_ckpt": str(args.teacher_ckpt),
            })
    log.info(f"done - best student val_f1={best_f1:.4f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
