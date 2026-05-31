"""Exponential Moving Average of model weights.

Tracks a separate copy of model weights that updates as a slow EMA after each
optimizer.step(). At eval time, the EMA model often generalizes better than
the live model (smooths out training noise). Save EMA weights to ema-best.pt
alongside the regular best.pt and pick whichever scored higher at deploy time.

Usage:
    ema = ModelEma(model, decay=0.9999)
    ...
    optimizer.step()
    ema.update(model)
    ...
    val_f1, _ = evaluate(ema.module, val_loader, device)
"""
from __future__ import annotations

from copy import deepcopy

import torch
from torch import nn


class ModelEma:
    """Exponential moving average wrapper. `self.module` is the EMA copy."""

    def __init__(self, model: nn.Module, decay: float = 0.9999) -> None:
        self.module = deepcopy(model)
        self.module.eval()
        for p in self.module.parameters():
            p.requires_grad = False
        self.decay = decay

    @torch.no_grad()
    def update(self, model: nn.Module) -> None:
        """Apply EMA step against the live model's current weights."""
        msd = model.state_dict()
        for k, v in self.module.state_dict().items():
            if v.dtype.is_floating_point:
                v.mul_(self.decay).add_(msd[k].detach(), alpha=1.0 - self.decay)
            else:
                # Non-float buffers (e.g., BN num_batches_tracked) — copy directly.
                v.copy_(msd[k])

    def state_dict(self) -> dict:
        return self.module.state_dict()

    def load_state_dict(self, state_dict: dict) -> None:
        self.module.load_state_dict(state_dict)
