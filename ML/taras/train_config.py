"""Dataclass for all training hyper-parameters.

Defaults target an 8 GB RTX 4060 (batch=16 + grad_accum=2 → effective batch 32).
For a ≥16 GB GPU, set BATCH_SIZE=32 and GRAD_ACCUM=1 via CLI.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class TrainConfig:
    # Stage 1 (head-only warmup)
    stage1_epochs: int = 3
    stage1_lr: float = 1e-3

    # Stage 2 (full fine-tune)
    stage2_epochs: int = 35
    backbone_lr: float = 1e-4
    head_lr: float = 1e-3
    weight_decay: float = 1e-4
    warmup_epochs: int = 2

    # Batching / throughput
    batch_size: int = 16
    grad_accum: int = 2           # effective batch = batch_size * grad_accum
    num_workers: int = 4
    use_amp: bool = True
    grad_clip_norm: float = 1.0

    # Regularization
    label_smoothing: float = 0.1
    drop_path_rate: float = 0.1
    use_cutmix: bool = True
    cutmix_alpha: float = 1.0
    cutmix_prob: float = 0.5
    use_mixup: bool = True            # v7: enabled by default, complements CutMix
    mixup_alpha: float = 0.2
    field_domain_rand: bool = True    # v7: heavier aug for lab→field domain shift
    class_weight_cap: float = 3.0     # v7: cap inverse-freq class weights at 3×
    ema_decay: float = 0.9999         # v7: EMA model decay (0.0 disables EMA)

    # Training control
    patience: int = 20                # v7: was 7; longer to absorb field-f1 plateaus
    seed: int = 42

    # IO
    splits_csv: str = "data/processed/splits.csv"
    ckpt_dir: str = "checkpoints/convnext_small_disease10"
    arch: str = "convnext_small.fb_in22k_ft_in1k"
