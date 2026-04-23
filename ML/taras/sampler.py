"""Per-sample weights for WeightedRandomSampler.

Two stacking strategies:
  - `make_balanced_sampler`: class weight = 1/sqrt(count). Corrects class imbalance
    without over-emphasizing tiny classes (softer than 1/count).
  - `make_source_weighted_sampler`: final_w = source_w * class_w. Boosts a minority
    source (e.g. real field data) on top of class balance.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from torch.utils.data import WeightedRandomSampler


def make_balanced_sampler(df: pd.DataFrame) -> WeightedRandomSampler:
    class_counts = df["class"].value_counts().to_dict()
    weights = df["class"].map(lambda c: 1.0 / np.sqrt(class_counts[c])).to_numpy()
    return WeightedRandomSampler(weights, num_samples=len(df), replacement=True)


def make_source_weighted_sampler(
    df: pd.DataFrame,
    source_weights: dict[str, float],
    verbose: bool = True,
) -> WeightedRandomSampler:
    """Class-balanced + source-weighted sampler.

    Each sample's weight = source_weights[row.source] * (1/sqrt(class_count)).
    `source_weights['*']` is the fallback for unknown source tags.
    """
    class_counts = df["class"].value_counts().to_dict()
    default = float(source_weights.get("*", 1.0))
    src_w = df["source"].map(lambda s: float(source_weights.get(s, default))).to_numpy()
    cls_w = df["class"].map(lambda c: 1.0 / np.sqrt(class_counts[c])).to_numpy()
    weights = src_w * cls_w

    if verbose:
        totals: dict[str, float] = {}
        for s, w in zip(df["source"].to_numpy(), weights):
            totals[s] = totals.get(s, 0.0) + float(w)
        gt = sum(totals.values()) or 1.0
        fracs = {s: f"{100*t/gt:.1f}%" for s, t in totals.items()}
        print(f"[sampler] expected per-epoch mix (by weight mass): {fracs}")

    return WeightedRandomSampler(weights, num_samples=len(df), replacement=True)
