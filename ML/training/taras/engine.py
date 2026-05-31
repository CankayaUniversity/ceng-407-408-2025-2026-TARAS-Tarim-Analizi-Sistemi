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


def _unpack_batch(batch, device):
    """(x, y, crop_id) from a 3-tuple (no CC) or 4-tuple (with CC) batch.
    crop_id is None on the 3-tuple path.
    """
    if len(batch) == 4:
        x, y, crop_id, _ = batch
        crop_id = crop_id.to(device, non_blocking=True)
    else:
        x, y, _ = batch
        crop_id = None
    x = x.to(device, non_blocking=True)
    y = y.to(device, non_blocking=True)
    return x, y, crop_id


def _forward(model, x, crop_id):
    """model(x) or model(x, crop_id) depending on whether the model is CC.

    Vanilla timm models won't accept a second positional arg, so crop_id is
    dropped if present. This lets a CC teacher's cached targets distill into
    a vanilla student trained on a splits CSV that carries crop_id.
    """
    if crop_id is None:
        return model(x)
    inner = getattr(model, "module", model)  # unwrap EMA wrapper if present
    if hasattr(inner, "crop_emb") or hasattr(inner.__class__, "_cc_marker") or \
       inner.__class__.__name__ == "CropConditionalModel" or \
       (hasattr(inner, "head") and hasattr(getattr(inner, "head"), "crop_emb")):
        return model(x, crop_id)
    return model(x)


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

    Per batch, with probability `config.cutmix_prob`, applies CutMix or Mixup
    (random 50/50 if both enabled). EMA weights update after every successful
    optimizer.step() when `ema_model` is provided.

    For CC: 4-tuple batches forward crop_id to the model, and crop dropout
    (per-sample mask to UNKNOWN_CROP_ID at `config.crop_dropout`) keeps the
    model from depending on crop info absolutely.
    """
    model.train()
    total_loss = 0.0
    total_samples = 0
    grad_accum = max(1, config.grad_accum)
    optimizer.zero_grad(set_to_none=True)
    use_amp = scaler is not None and device.type == "cuda"
    crop_dropout = float(getattr(config, "crop_dropout", 0.0))
    unknown_crop = int(getattr(config, "num_crops", 7))  # = UNKNOWN_CROP_ID slot

    iterator = tqdm(loader, desc="train", leave=False) if progress else loader
    for step, batch in enumerate(iterator):
        x, y, crop_id = _unpack_batch(batch, device)
        if crop_id is not None and crop_dropout > 0.0:
            mask = torch.rand(crop_id.shape, device=crop_id.device) < crop_dropout
            crop_id = torch.where(mask, torch.full_like(crop_id, unknown_crop), crop_id)

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
                logits = _forward(model, x_m, crop_id)
                loss = lam * criterion(logits, y_a) + (1 - lam) * criterion(logits, y_b)
            elif aug == "mixup":
                x_m, y_a, y_b, lam = mixup(x, y, alpha=config.mixup_alpha)
                logits = _forward(model, x_m, crop_id)
                loss = lam * criterion(logits, y_a) + (1 - lam) * criterion(logits, y_b)
            else:
                logits = _forward(model, x, crop_id)
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
    """Return (macro_f1, accuracy), or (..., preds, labels) if return_preds=True.

    Handles both 3- and 4-tuple batches; CC models receive crop_id when present.
    """
    model.eval()
    all_preds: list[int] = []
    all_labels: list[int] = []

    iterator = tqdm(loader, desc="eval", leave=False) if progress else loader
    for batch in iterator:
        x, y, crop_id = _unpack_batch(batch, device)
        logits = _forward(model, x, crop_id)
        preds = logits.argmax(dim=1).cpu().numpy()
        all_preds.extend(preds.tolist())
        all_labels.extend(y.cpu().numpy().tolist())

    if len(all_labels) == 0:
        return (0.0, 0.0, [], []) if return_preds else (0.0, 0.0)

    macro_f1 = float(f1_score(all_labels, all_preds, average="macro", zero_division=0))
    acc = float((np.array(all_preds) == np.array(all_labels)).mean())
    if return_preds:
        return macro_f1, acc, all_preds, all_labels
    return macro_f1, acc
