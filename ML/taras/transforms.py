"""Train / eval augmentation pipelines for the disease-only classifier.

Augment intent (see handoff §6):
  - Orientation-invariant leaves → H- and V-flip both on
  - Lesion colour is diagnostic → hue perturbation kept at 0.02
  - Field-shot realism → blur/noise at low probability, coarse dropout for
    background-bias resistance (Noyan 2022)
"""
from __future__ import annotations

import albumentations as A
import cv2
from albumentations.pytorch import ToTensorV2

IMG_SIZE: int = 224
MEAN: list[float] = [0.485, 0.456, 0.406]
STD: list[float] = [0.229, 0.224, 0.225]


def build_train_transform(img_size: int = IMG_SIZE) -> A.Compose:
    return A.Compose([
        A.SmallestMaxSize(max_size=int(img_size * 256 / 224)),
        A.RandomResizedCrop(size=(img_size, img_size), scale=(0.7, 1.0), ratio=(0.75, 1.33)),
        A.HorizontalFlip(p=0.5),
        A.VerticalFlip(p=0.5),
        A.Rotate(limit=30, p=0.7, border_mode=cv2.BORDER_REFLECT_101),
        A.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.2, hue=0.02, p=0.6),
        A.OneOf([
            A.MotionBlur(blur_limit=5),
            A.GaussianBlur(blur_limit=5),
            A.GaussNoise(var_limit=(10.0, 50.0)),
        ], p=0.3),
        A.CoarseDropout(
            num_holes_range=(1, 4),
            hole_height_range=(16, 32),
            hole_width_range=(16, 32),
            fill_value=0,
            p=0.3,
        ),
        A.Normalize(mean=MEAN, std=STD),
        ToTensorV2(),
    ])


def build_eval_transform(img_size: int = IMG_SIZE) -> A.Compose:
    return A.Compose([
        A.SmallestMaxSize(max_size=int(img_size * 256 / 224)),
        A.CenterCrop(height=img_size, width=img_size),
        A.Normalize(mean=MEAN, std=STD),
        ToTensorV2(),
    ])
