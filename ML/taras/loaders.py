"""DataLoader construction. Reads `data/processed/splits.csv`."""
from __future__ import annotations

from pathlib import Path

import pandas as pd
from torch.utils.data import DataLoader

from taras.data import DiseaseDataset
from taras.sampler import make_balanced_sampler, make_source_weighted_sampler
from taras.transforms import build_eval_transform, build_train_transform


def build_loaders(
    splits_csv: str | Path = "data/processed/splits.csv",
    batch_size: int = 16,
    num_workers: int = 4,
    eval_batch_multiplier: int = 2,
    pin_memory: bool = True,
    source_weights: dict[str, float] | None = None,
    persistent_workers: bool | None = None,
) -> dict[str, DataLoader]:
    df = pd.read_csv(splits_csv)
    train_df = df[df["split"] == "train"].reset_index(drop=True)
    val_df = df[df["split"] == "val"].reset_index(drop=True)
    test_pv_df = df[df["split"] == "test_pv"].reset_index(drop=True)
    test_field_df = df[df["split"] == "test_field"].reset_index(drop=True)

    train_tf = build_train_transform()
    eval_tf = build_eval_transform()

    train_ds = DiseaseDataset(train_df, transform=train_tf)
    val_ds = DiseaseDataset(val_df, transform=eval_tf)
    test_pv_ds = DiseaseDataset(test_pv_df, transform=eval_tf)
    test_field_ds = DiseaseDataset(test_field_df, transform=eval_tf)

    if len(train_df) == 0:
        sampler = None
    elif source_weights:
        sampler = make_source_weighted_sampler(train_df, source_weights)
    else:
        sampler = make_balanced_sampler(train_df)

    persist = (num_workers > 0) if persistent_workers is None else persistent_workers

    loaders: dict[str, DataLoader] = {
        "train": DataLoader(
            train_ds,
            batch_size=batch_size,
            sampler=sampler,
            shuffle=sampler is None,
            num_workers=num_workers,
            pin_memory=pin_memory,
            drop_last=True,
            persistent_workers=persist,
        ),
    }
    for name, ds in [("val", val_ds), ("test_pv", test_pv_ds), ("test_field", test_field_ds)]:
        if len(ds) == 0:
            continue
        loaders[name] = DataLoader(
            ds,
            batch_size=batch_size * eval_batch_multiplier,
            shuffle=False,
            num_workers=num_workers,
            pin_memory=pin_memory,
            persistent_workers=persist,
        )
    return loaders
