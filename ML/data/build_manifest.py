"""Build a self-contained manifest for dataset_clean/images/.

Inputs:
  - dataset_clean/images/                                  — the cleaned image pool
  - dataset_clean/_provenance/zip_v6_pool_manifest_AS_SHIPPED.csv  — used ONLY
    for sha256→PV folder lookup to derive crop; source attribution is rebuilt
    from the pool directory.

Schema: class, pool, source, path, sha256, phash, dhash, crop.
`path` is absolute into dataset_clean/images/, so the manifest is only
valid for this dataset.
"""
from __future__ import annotations
import csv
import hashlib
import re
import sys
from multiprocessing import Pool as ProcessPool
from pathlib import Path

import pandas as pd
from PIL import Image
import imagehash
from tqdm import tqdm

DATASET = Path("/mnt/storage/Dev/TARAS/dataset_clean")
IMAGES = DATASET / "images"
OUT_MANIFEST = DATASET / "manifest.csv"
ZIP_MANIFEST = DATASET / "_provenance" / "zip_v6_pool_manifest_AS_SHIPPED.csv"

POOL_TO_SOURCE = {
    "v6_pool_pd": "plantdoc",
    "v6_pool_pv": "plantvillage",
    "v6_pool_rw": "rw_blend",
}

CROPS = ["cherry", "peach", "tomato", "potato", "pepper", "corn", "maize", "squash"]

PD_CLASS_DEFAULT_CROP = {
    "corn_common_rust": "corn",
    "corn_gray_leaf_spot": "corn",
    "corn_northern_leaf_blight": "corn",
    "mosaic_virus": "tomato",
    "leaf_mold": "tomato",
    "septoria_leaf_spot": "tomato",
    "spider_mites": "tomato",
    "target_spot": "tomato",
    "yellow_leaf_curl_virus": "tomato",
    "bacterial_spot": "tomato",
    "early_blight": "tomato",
    "late_blight": "tomato",
    "powdery_mildew": "squash",
}
RW_CLASS_TO_CROP = {"spider_mites": "tomato"}


def derive_crop_from_zip_original_path(orig_path: str) -> str:
    """Pull the PV crop name out of the zip manifest's original_path.
    e.g., '.../color/Tomato___Bacterial_spot/xxx.JPG' → 'tomato'.
    """
    if not isinstance(orig_path, str):
        return "unknown"
    p = orig_path.lower().replace("\\", "/")
    m = re.search(r"/color/([^/]+)___", p)
    if m:
        t = m.group(1)
        for c in CROPS:
            if c in t:
                return "corn" if c == "maize" else c
    if "plantdoc" in p:
        for c in CROPS:
            if c in p:
                return "corn" if c == "maize" else c
    return "unknown"


def derive_crop(pool: str, class_name: str, filename: str, sha_lookup: dict, sha256: str) -> str:
    """Precedence: zip original_path → crop keyword in filename → pool+class fallback."""
    if sha256 in sha_lookup:
        crop = derive_crop_from_zip_original_path(sha_lookup[sha256])
        if crop != "unknown":
            return crop

    fn = filename.lower()
    for c in CROPS:
        if c in fn:
            return "corn" if c == "maize" else c

    if pool == "v6_pool_pd":
        return PD_CLASS_DEFAULT_CROP.get(class_name, "unknown")
    if pool == "v6_pool_rw":
        return RW_CLASS_TO_CROP.get(class_name, "unknown")
    # v6_pool_pv with no zip lookup and no filename hint → mustafa-folded tomato img by default.
    return PD_CLASS_DEFAULT_CROP.get(class_name, "unknown")


def _hash_one(path_str: str) -> dict:
    p = Path(path_str)
    try:
        h = hashlib.sha256()
        with open(p, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                h.update(chunk)
        sha = h.hexdigest()
        with Image.open(p) as im:
            im = im.convert("RGB")
            ph = str(imagehash.phash(im, hash_size=8))
            dh = str(imagehash.dhash(im, hash_size=8))
        return {"path": str(p), "sha256": sha, "phash": ph, "dhash": dh, "error": None}
    except Exception as e:
        return {"path": str(p), "sha256": None, "phash": None, "dhash": None, "error": str(e)}


def main():
    print(f"[walk] Discovering images under {IMAGES}/v6_pool_*")
    images = []
    for pool_dir in sorted(IMAGES.glob("v6_pool_*")):
        if not pool_dir.is_dir():
            continue
        pool_name = pool_dir.name
        for class_dir in sorted(pool_dir.iterdir()):
            if not class_dir.is_dir():
                continue
            cls = class_dir.name
            for img_path in sorted(class_dir.iterdir()):
                if img_path.suffix.lower() not in {".jpg", ".jpeg", ".png"}:
                    continue
                images.append({
                    "path": str(img_path),
                    "class": cls,
                    "pool": pool_name,
                })
    print(f"  {len(images)} images discovered")

    print(f"[hash] Computing sha256 + pHash + dHash...")
    paths = [r["path"] for r in images]
    results = {}
    with ProcessPool(12) as p:
        for r in tqdm(p.imap_unordered(_hash_one, paths, chunksize=64),
                      total=len(paths), desc="hashing"):
            results[r["path"]] = r

    # zip manifest is used only for sha256→original_path crop lookup
    sha_lookup = {}
    if ZIP_MANIFEST.exists():
        zm = pd.read_csv(ZIP_MANIFEST)
        sha_lookup = dict(zip(zm["sha256"], zm["original_path"]))
        print(f"[load] zip manifest: {len(sha_lookup)} sha→original_path entries for crop lookup")
    else:
        print(f"[warn] zip manifest not found at {ZIP_MANIFEST} — crop derivation will be heuristic only")

    rows = []
    n_failed = 0
    for img in images:
        h = results[img["path"]]
        if h["sha256"] is None:
            n_failed += 1
            continue
        rows.append({
            "class":  img["class"],
            "pool":   img["pool"],
            "source": POOL_TO_SOURCE[img["pool"]],
            "path":   img["path"],  # absolute
            "sha256": h["sha256"],
            "phash":  h["phash"],
            "dhash":  h["dhash"],
            "crop":   derive_crop(img["pool"], img["class"], Path(img["path"]).name,
                                  sha_lookup, h["sha256"]),
        })

    if n_failed:
        print(f"  warning: {n_failed} imgs failed to hash and were skipped")

    df = pd.DataFrame(rows)
    df.to_csv(OUT_MANIFEST, index=False)
    print(f"[save] {OUT_MANIFEST}")
    print(f"  {len(df)} rows")

    print(f"\n=== Summary ===")
    print(f"By pool:    {dict(df.groupby('pool').size())}")
    print(f"By source:  {dict(df.groupby('source').size())}")
    print(f"By crop:    {dict(df.groupby('crop').size().sort_values(ascending=False))}")
    print(f"\nUnique classes per pool:")
    for pool, n in df.groupby("pool")["class"].nunique().items():
        print(f"  {pool}: {n}")
    print(f"\nUnique sha256s: {df['sha256'].nunique()}  (should equal {len(df)} if no dup files)")


if __name__ == "__main__":
    sys.exit(main() or 0)
