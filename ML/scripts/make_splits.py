"""Build `data/processed/splits.csv` - one row per image, columns (path, class, source, split).

Strategy (plan section 1.4):
  - PlantVillage: stratified 70/15/15 (train / val / test_pv)
  - realworld_blend: 80/20 (train / val) - blended into main train/val sets
  - PlantDoc: held out entirely as `test_field`
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd
from sklearn.model_selection import train_test_split

IMG_EXTS = {".jpg", ".jpeg", ".png"}


def build_index(root: Path, source_tag: str) -> pd.DataFrame:
    rows: list[dict] = []
    if not root.exists():
        return pd.DataFrame(rows, columns=["path", "class", "source"])
    for class_dir in sorted(root.iterdir()):
        if not class_dir.is_dir():
            continue
        for img in class_dir.iterdir():
            if img.suffix.lower() in IMG_EXTS:
                rows.append({"path": str(img.resolve()), "class": class_dir.name, "source": source_tag})
    return pd.DataFrame(rows)


def _stratified_split(df: pd.DataFrame, val_frac: float, test_frac: float, seed: int) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    if df.empty:
        empty = df.copy()
        return empty, empty, empty
    tmp_frac = val_frac + test_frac
    train, temp = train_test_split(df, test_size=tmp_frac, stratify=df["class"], random_state=seed)
    val_ratio = val_frac / tmp_frac
    val, test = train_test_split(temp, test_size=1 - val_ratio, stratify=temp["class"], random_state=seed)
    return train, val, test


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pv",  type=Path, default=Path("data/processed/plantvillage_disease_only"))
    parser.add_argument("--rw",  type=Path, default=Path("data/processed/realworld_blend"))
    parser.add_argument("--pd",  type=Path, default=Path("data/processed/plantdoc_subset"))
    parser.add_argument("--out", type=Path, default=Path("data/processed/splits.csv"))
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args(argv)

    pv = build_index(args.pv, "plantvillage")
    rw = build_index(args.rw, "realworld")
    pd_ = build_index(args.pd, "plantdoc")
    print(f"[index] plantvillage={len(pv)}  realworld={len(rw)}  plantdoc={len(pd_)}")

    pv_train, pv_val, pv_test = _stratified_split(pv, val_frac=0.15, test_frac=0.15, seed=args.seed)

    if not rw.empty:
        rw_train, rw_val = train_test_split(rw, test_size=0.20, stratify=rw["class"], random_state=args.seed)
    else:
        rw_train = rw_val = rw

    pv_train = pv_train.assign(split="train")
    pv_val = pv_val.assign(split="val")
    pv_test = pv_test.assign(split="test_pv")
    rw_train = rw_train.assign(split="train")
    rw_val = rw_val.assign(split="val")
    pd_test = pd_.assign(split="test_field")

    all_splits = pd.concat([pv_train, pv_val, pv_test, rw_train, rw_val, pd_test], ignore_index=True)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    all_splits.to_csv(args.out, index=False)

    print(f"\n[splits] wrote {len(all_splits)} rows -> {args.out}")
    if not all_splits.empty:
        print("\n[distribution]")
        print(all_splits.groupby(["split", "class"]).size().unstack(fill_value=0))
    return 0


if __name__ == "__main__":
    sys.exit(main())
