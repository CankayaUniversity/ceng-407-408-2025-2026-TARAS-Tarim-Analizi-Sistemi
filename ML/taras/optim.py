"""AdamW with discriminative LRs + linear-warmup → cosine-annealing schedule."""
from __future__ import annotations

from torch import nn
from torch.optim import AdamW, Optimizer
from torch.optim.lr_scheduler import (
    CosineAnnealingLR,
    LinearLR,
    LRScheduler,
    SequentialLR,
)


def build_optimizer(model: nn.Module, config, stage: str = "stage2") -> Optimizer:
    if stage == "stage1":
        params = [p for p in model.parameters() if p.requires_grad]
        return AdamW(params, lr=config.stage1_lr, weight_decay=config.weight_decay)

    backbone_params: list = []
    head_params: list = []
    for name, p in model.named_parameters():
        if not p.requires_grad:
            continue
        (head_params if "head" in name else backbone_params).append(p)

    return AdamW(
        [
            {"params": backbone_params, "lr": config.backbone_lr},
            {"params": head_params, "lr": config.head_lr},
        ],
        weight_decay=config.weight_decay,
    )


def build_scheduler(optimizer: Optimizer, config, steps_per_epoch: int) -> LRScheduler:
    total_steps = max(1, config.stage2_epochs * steps_per_epoch)
    warmup_steps = max(1, config.warmup_epochs * steps_per_epoch)
    warmup = LinearLR(optimizer, start_factor=0.01, total_iters=warmup_steps)
    cosine = CosineAnnealingLR(optimizer, T_max=max(1, total_steps - warmup_steps))
    return SequentialLR(optimizer, schedulers=[warmup, cosine], milestones=[warmup_steps])
