"""Dataset reading from the `splits.csv` manifest produced by make_splits.py."""
from __future__ import annotations

from pathlib import Path
from typing import Any

import cv2
import numpy as np
import pandas as pd
from torch.utils.data import Dataset

from configs.label_map import CLASS_TO_IDX


class DiseaseDataset(Dataset):
    """Loads (path, class, source[, crop_id]) rows from a DataFrame and applies a transform.

    Args:
        df: DataFrame with `path`, `class`, `source` columns. Optionally
            `crop_id` (int 0..6 for known crops, -1 / missing for unknown).
        transform: Albumentations Compose returning a dict with key `image`.

    Yields per item:
        (img, label, source)             — when no ``crop_id`` column
        (img, label, crop_id, source)    — when ``crop_id`` column is present
    """

    def __init__(
        self,
        df: pd.DataFrame,
        transform: Any | None = None,
    ) -> None:
        self.df = df.reset_index(drop=True)
        self.transform = transform
        self.with_crop = "crop_id" in self.df.columns

    def __len__(self) -> int:
        return len(self.df)

    def __getitem__(self, idx: int):
        row = self.df.iloc[idx]
        img = cv2.imread(str(row["path"]))
        if img is None:
            raise FileNotFoundError(f"cv2.imread failed for {row['path']}")
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

        if self.transform is not None:
            img = self.transform(image=img)["image"]
        else:
            img = np.transpose(img.astype(np.float32) / 255.0, (2, 0, 1))

        label = CLASS_TO_IDX[row["class"]]
        source = str(row.get("source", "unknown"))
        if self.with_crop:
            crop_raw = row["crop_id"]
            crop_id = int(crop_raw) if pd.notna(crop_raw) else -1
            return img, label, crop_id, source
        return img, label, source


def load_split(csv_path: str | Path, split: str) -> pd.DataFrame:
    """Return rows whose `split` column equals `split`."""
    df = pd.read_csv(csv_path)
    return df[df["split"] == split].reset_index(drop=True)
