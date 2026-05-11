"""Train / eval inner loops with AMP + gradient accumulation + grad clip."""
from __future__ import annotations

from typing import Callable

import numpy as np
import torch
from sklearn.metrics import f1_score
from torch import nn
from torch.amp import GradScaler, autocast
from torch.utils.data import DataLoader
from tqdm import tqdm

from taras.cutmix import cutmix, mixup


def train_one_epoch(
    model: nn.Module,
    loader: DataLoader,
    criterion: Callable,
    optimizer: torch.optim.Optimizer,
    scheduler,
    scaler: GradScaler | None,
    config,
    device: torch.device,
    use_cutmix: bool = False,
    use_mixup: bool = False,
    ema_model=None,
    progress: bool = True,
) -> float:
    """Return mean loss over all samples in the loader.

    Augmentation: per batch, with probability `config.cutmix_prob`, applies
    one of {CutMix, Mixup} (random 50/50 if both enabled). When `ema_model` is
    provided, EMA weights are updated after each successful optimizer.step().
    """
    model.train()
    total_loss = 0.0
    total_samples = 0
    grad_accum = max(1, config.grad_accum)
    optimizer.zero_grad(set_to_none=True)
    use_amp = scaler is not None and device.type == "cuda"

    iterator = tqdm(loader, desc="train", leave=False) if progress else loader
    for step, (x, y, _) in enumerate(iterator):
        x = x.to(device, non_blocking=True)
        y = y.to(device, non_blocking=True)

        # Decide augmentation: per-batch coin flip up to cutmix_prob, then
        # 50/50 split between CutMix and Mixup if both are enabled.
        aug = None
        if (use_cutmix or use_mixup) and np.random.rand() < config.cutmix_prob:
            if use_cutmix and use_mixup:
                aug = "cutmix" if np.random.rand() < 0.5 else "mixup"
            elif use_cutmix:
                aug = "cutmix"
            else:
                aug = "mixup"

        with autocast(device_type=device.type, enabled=use_amp):
            if aug == "cutmix":
                x_m, y_a, y_b, lam = cutmix(x, y, alpha=config.cutmix_alpha)
                logits = model(x_m)
                loss = lam * criterion(logits, y_a) + (1 - lam) * criterion(logits, y_b)
            elif aug == "mixup":
                x_m, y_a, y_b, lam = mixup(x, y, alpha=config.mixup_alpha)
                logits = model(x_m)
                loss = lam * criterion(logits, y_a) + (1 - lam) * criterion(logits, y_b)
            else:
                logits = model(x)
                loss = criterion(logits, y)
            loss = loss / grad_accum

        if use_amp:
            scaler.scale(loss).backward()
        else:
            loss.backward()

        if (step + 1) % grad_accum == 0:
            if use_amp:
                scaler.unscale_(optimizer)
                torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=config.grad_clip_norm)
                scaler.step(optimizer)
                scaler.update()
            else:
                torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=config.grad_clip_norm)
                optimizer.step()
            optimizer.zero_grad(set_to_none=True)
            if scheduler is not None:
                scheduler.step()
            if ema_model is not None:
                ema_model.update(model)

        total_loss += loss.item() * grad_accum * x.size(0)
        total_samples += x.size(0)

    if total_samples == 0:
        return 0.0
    return total_loss / total_samples


@torch.no_grad()
def evaluate(
    model: nn.Module,
    loader: DataLoader,
    device: torch.device,
    return_preds: bool = False,
    progress: bool = True,
):
    """Return (macro_f1, accuracy) and optionally (preds, labels)."""
    model.eval()
    all_preds: list[int] = []
    all_labels: list[int] = []

    iterator = tqdm(loader, desc="eval", leave=False) if progress else loader
    for x, y, _ in iterator:
        x = x.to(device, non_blocking=True)
        logits = model(x)
        preds = logits.argmax(dim=1).cpu().numpy()
        all_preds.extend(preds.tolist())
        all_labels.extend(y.numpy().tolist())

    if len(all_labels) == 0:
        return (0.0, 0.0, [], []) if return_preds else (0.0, 0.0)

    macro_f1 = float(f1_score(all_labels, all_preds, average="macro", zero_division=0))
    acc = float((np.array(all_preds) == np.array(all_labels)).mean())
    if return_preds:
        return macro_f1, acc, all_preds, all_labels
    return macro_f1, acc
