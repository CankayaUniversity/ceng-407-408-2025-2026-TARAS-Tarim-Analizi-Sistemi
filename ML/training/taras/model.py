"""ConvNeXt-Small ImageNet-21k → 1k pretrained, 14-way head.

Switch to `convnext_tiny.fb_in22k_ft_in1k` on 8 GB VRAM; same recipe applies.

Also exports `CropConditionalModel`: a backbone-agnostic wrapper that
concatenates a learned crop embedding into the pooled features before the
classifier head. Targets confused-class lifts (bact across tomato/pepper/peach,
EB/LB across tomato/potato).
"""
from __future__ import annotations

import timm
import torch
import torch.nn as nn

from configs.label_map import NUM_CLASSES

DEFAULT_ARCH: str = "convnext_small.fb_in22k_ft_in1k"
TINY_ARCH: str = "convnext_tiny.fb_in22k_ft_in1k"

# Crop space — must match scripts/_build_crop_column.py CROPS list.
NUM_CROPS: int = 7  # cherry, corn, peach, pepper, potato, squash, tomato
UNKNOWN_CROP_ID: int = NUM_CROPS  # extra slot for "unknown" at inference


def build_model(
    arch: str = DEFAULT_ARCH,
    pretrained: bool = True,
    drop_path_rate: float = 0.1,
    num_classes: int = NUM_CLASSES,
    img_size: int | None = None,
    window_size: int | None = None,
) -> nn.Module:
    extra: dict = {}
    if img_size is not None and img_size != 224:
        extra["img_size"] = img_size
    if window_size is not None:
        extra["window_size"] = window_size
    try:
        return timm.create_model(
            arch,
            pretrained=pretrained,
            num_classes=num_classes,
            drop_path_rate=drop_path_rate,
            **extra,
        )
    except TypeError as e:
        if "drop_path_rate" in str(e):
            return timm.create_model(
                arch, pretrained=pretrained, num_classes=num_classes, **extra,
            )
        raise


class _CCHead(nn.Module):
    """Crop-embedding + linear classifier. Submodules MUST live under 'head'
    so freeze_backbone() catches them during stage-1 warmup.
    """

    def __init__(self, feature_dim: int, num_classes: int,
                 num_crops: int = NUM_CROPS, crop_emb_dim: int = 32) -> None:
        super().__init__()
        self.crop_emb = nn.Embedding(num_crops + 1, crop_emb_dim)
        self.fc = nn.Linear(feature_dim + crop_emb_dim, num_classes)
        nn.init.normal_(self.crop_emb.weight, mean=0.0, std=0.02)

    def forward(self, feats: torch.Tensor, crop_id: torch.Tensor) -> torch.Tensor:
        emb = self.crop_emb(crop_id)
        return self.fc(torch.cat([feats, emb], dim=1))


class CropConditionalModel(nn.Module):
    """timm backbone (`global_pool='avg'`, no head) + crop-conditional head.

    forward(x, crop_id) where crop_id is a LongTensor (B,) in [0, NUM_CROPS].
    Pass NUM_CROPS for the "unknown crop" slot (learned via crop dropout).
    """

    def __init__(self, arch: str, num_classes: int = NUM_CLASSES,
                 num_crops: int = NUM_CROPS, crop_emb_dim: int = 32,
                 pretrained: bool = True, drop_path_rate: float = 0.1) -> None:
        super().__init__()
        self.backbone = timm.create_model(
            arch, pretrained=pretrained, num_classes=0,
            global_pool="avg", drop_path_rate=drop_path_rate,
        )
        self.feature_dim = self.backbone.num_features
        self.num_crops = num_crops
        self.head = _CCHead(self.feature_dim, num_classes, num_crops, crop_emb_dim)

    def forward(self, x: torch.Tensor, crop_id: torch.Tensor | None = None) -> torch.Tensor:
        feats = self.backbone(x)
        if crop_id is None:
            crop_id = torch.full((x.size(0),), UNKNOWN_CROP_ID,
                                 device=x.device, dtype=torch.long)
        else:
            # out-of-range / -1 → "unknown" slot
            crop_id = torch.where(
                (crop_id < 0) | (crop_id > self.num_crops),
                torch.full_like(crop_id, UNKNOWN_CROP_ID),
                crop_id,
            )
        return self.head(feats, crop_id)


def build_cc_model(
    arch: str = DEFAULT_ARCH,
    pretrained: bool = True,
    drop_path_rate: float = 0.1,
    num_classes: int = NUM_CLASSES,
    num_crops: int = NUM_CROPS,
    crop_emb_dim: int = 32,
) -> CropConditionalModel:
    return CropConditionalModel(
        arch=arch, num_classes=num_classes, num_crops=num_crops,
        crop_emb_dim=crop_emb_dim, pretrained=pretrained,
        drop_path_rate=drop_path_rate,
    )


def freeze_backbone(model: nn.Module) -> nn.Module:
    """Freeze everything whose param name isn't 'head' or 'classifier'.

    Matches timm conventions: Swin/ConvNeXt/ViT use 'head.fc';
    MobileNet/EfficientNet use 'classifier'; CC uses 'head.fc' + 'head.crop_emb'.
    """
    for name, param in model.named_parameters():
        param.requires_grad = ("head" in name) or ("classifier" in name)
    return model


def unfreeze_all(model: nn.Module) -> nn.Module:
    for param in model.parameters():
        param.requires_grad = True
    return model


def count_parameters(model: nn.Module) -> tuple[int, int]:
    total = sum(p.numel() for p in model.parameters())
    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    return total, trainable
