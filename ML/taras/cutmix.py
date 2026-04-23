"""CutMix regularizer (Yun et al. 2019)."""
from __future__ import annotations

import numpy as np
import torch


def cutmix(x: torch.Tensor, y: torch.Tensor, alpha: float = 1.0):
    """Return (mixed_x, y_a, y_b, lam) with lam = area of preserved region."""
    lam = np.random.beta(alpha, alpha)
    _, _, H, W = x.shape

    cut_rat = np.sqrt(1.0 - lam)
    cut_w, cut_h = int(W * cut_rat), int(H * cut_rat)
    cx, cy = np.random.randint(W), np.random.randint(H)
    x1 = int(np.clip(cx - cut_w // 2, 0, W))
    x2 = int(np.clip(cx + cut_w // 2, 0, W))
    y1 = int(np.clip(cy - cut_h // 2, 0, H))
    y2 = int(np.clip(cy + cut_h // 2, 0, H))

    index = torch.randperm(x.size(0), device=x.device)
    x_mixed = x.clone()
    x_mixed[:, :, y1:y2, x1:x2] = x[index, :, y1:y2, x1:x2]

    lam = 1.0 - ((x2 - x1) * (y2 - y1) / (W * H))
    return x_mixed, y, y[index], float(lam)
