"""Reorganize a 15-class PlantVillage-style tree into the 10 disease-only classes.

Input tree:
    <src>/<original_class>/*.jpg           (original_class is a LABEL_MAP_15_TO_10 key)

Output tree:
    <dst>/<disease_class>/<original_class>__<filename>.jpg

The original-class prefix prevents filename collisions when multiple crops merge
into the same target class (e.g. Tomato___Early_blight + Potato___Early_blight
-> early_blight/).
"""
from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

from configs.label_map import LABEL_MAP_15_TO_10

IMG_EXTS = {".jpg", ".jpeg", ".png"}


def remap(src: Path, dst: Path, symlink: bool = False) -> dict[str, int]:
    """Copy (or symlink) images from `src/<orig_class>/` to `dst/<disease_class>/`."""
    counts: dict[str, int] = {}
    for orig_class, disease_class in LABEL_MAP_15_TO_10.items():
        src_dir = src / orig_class
        if not src_dir.exists():
            print(f"[skip] {src_dir} not found")
            continue
        dst_dir = dst / disease_class
        dst_dir.mkdir(parents=True, exist_ok=True)
        for img in src_dir.iterdir():
            if img.suffix.lower() not in IMG_EXTS:
                continue
            target = dst_dir / f"{orig_class}__{img.name}"
            if target.exists():
                continue
            if symlink:
                try:
                    target.symlink_to(img.resolve())
                except OSError:
                    shutil.copy2(img, target)
            else:
                shutil.copy2(img, target)
            counts[disease_class] = counts.get(disease_class, 0) + 1
        print(f"  {orig_class} -> {disease_class}")
    return counts


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--src", required=True, type=Path)
    parser.add_argument("--dst", required=True, type=Path)
    parser.add_argument("--symlink", action="store_true",
                        help="Use symlinks instead of copying (saves disk on Linux/macOS; Windows needs admin).")
    args = parser.parse_args(argv)
    counts = remap(args.src, args.dst, symlink=args.symlink)
    print("\n[counts per disease class]")
    for cls, n in sorted(counts.items()):
        print(f"  {cls}: {n}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
