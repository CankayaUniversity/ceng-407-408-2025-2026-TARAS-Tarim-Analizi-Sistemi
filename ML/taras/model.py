"""ConvNeXt-Small ImageNet-21k → 1k pretrained, 10-way head.

Switch to `convnext_tiny.fb_in22k_ft_in1k` on 8 GB VRAM if ConvNeXt-Small
doesn't fit; same recipe applies.
"""
from __future__ import annotations

import timm
import torch.nn as nn

from configs.label_map import NUM_CLASSES

DEFAULT_ARCH: str = "convnext_small.fb_in22k_ft_in1k"
TINY_ARCH: str = "convnext_tiny.fb_in22k_ft_in1k"


def build_model(
    arch: str = DEFAULT_ARCH,
    pretrained: bool = True,
    drop_path_rate: float = 0.1,
    num_classes: int = NUM_CLASSES,
) -> nn.Module:
    return timm.create_model(
        arch,
        pretrained=pretrained,
        num_classes=num_classes,
        drop_path_rate=drop_path_rate,
    )


def freeze_backbone(model: nn.Module) -> nn.Module:
    """Freeze every parameter whose name does not contain `head`."""
    for name, param in model.named_parameters():
        param.requires_grad = "head" in name
    return model


def unfreeze_all(model: nn.Module) -> nn.Module:
    for param in model.parameters():
        param.requires_grad = True
    return model


def count_parameters(model: nn.Module) -> tuple[int, int]:
    total = sum(p.numel() for p in model.parameters())
    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    return total, trainable
