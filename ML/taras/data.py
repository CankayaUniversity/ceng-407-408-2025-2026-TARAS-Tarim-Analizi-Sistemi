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
    """Loads (path, class, source) rows from a DataFrame and applies a transform.

    Args:
        df: DataFrame with `path`, `class`, `source` columns.
        transform: Albumentations Compose returning a dict with key `image`.
    """

    def __init__(
        self,
        df: pd.DataFrame,
        transform: Any | None = None,
    ) -> None:
        self.df = df.reset_index(drop=True)
        self.transform = transform

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
        return img, label, source


def load_split(csv_path: str | Path, split: str) -> pd.DataFrame:
    """Return rows whose `split` column equals `split`."""
    df = pd.read_csv(csv_path)
    return df[df["split"] == split].reset_index(drop=True)
