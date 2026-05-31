"""Build cluster-aware splits with balance + min-test constraints.

Input:  dataset_clean/manifest.csv
Output: dataset_clean/splits.csv, dataset_clean/coverage.md

Constraints:
  - Balanced test set: target TEST_CAP_PER_CLASS per class, floor MIN_TEST_PER_CLASS
    (boosted from PV-train if needed).
  - Cluster-aware (pHash exact + dHash exact + within-source pHash≤4) — every
    cluster lives in exactly one split, no near-duplicate train↔test leakage.
  - Stratified per (class, source); test_type tagged for field/lab/realworld slicing.
"""
from __future__ import annotations
import sys
from collections import defaultdict, Counter
from pathlib import Path

import numpy as np
import pandas as pd

DATASET = Path("/mnt/storage/Dev/TARAS/dataset_clean")
MANIFEST = DATASET / "manifest.csv"
OUT_SPLITS = DATASET / "splits.csv"
OUT_COVERAGE = DATASET / "coverage.md"

SPLIT_RATIOS = {
    "plantvillage":   (0.70, 0.15, 0.15),
    "plantdoc":       (0.55, 0.15, 0.30),
    "rw_blend":       (0.55, 0.15, 0.30),
}
SOURCE_TO_TEST_TYPE = {
    "plantvillage":   "lab",
    "plantdoc":       "field",
    "rw_blend":       "realworld",
}

TARGET_TEST_PER_CLASS = 70
MIN_TEST_PER_CLASS    = 30
TEST_CAP_PER_CLASS    = 150
MIN_DATA_FOR_HELD_OUT = 30
HAMMING_THRESH        = 4


def hamming_hex(a: str, b: str) -> int:
    return bin(int(a, 16) ^ int(b, 16)).count("1")


def build_clusters(df: pd.DataFrame) -> pd.DataFrame:
    print(f"[cluster] over {len(df)} imgs...")
    parent = list(range(len(df)))
    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb: parent[rb] = ra

    ph_groups = defaultdict(list)
    for i, ph in enumerate(df["phash"].tolist()):
        if ph and ph != "nan": ph_groups[ph].append(i)
    n_ph = sum(1 for g in ph_groups.values() if len(g) > 1)
    for g in ph_groups.values():
        for i in g[1:]: union(g[0], i)
    print(f"  exact-pHash clusters: {n_ph}")

    dh_groups = defaultdict(list)
    for i, dh in enumerate(df["dhash"].tolist()):
        if dh and dh != "nan": dh_groups[dh].append(i)
    n_dh = sum(1 for g in dh_groups.values() if len(g) > 1)
    for g in dh_groups.values():
        for i in g[1:]: union(g[0], i)
    print(f"  exact-dHash clusters: {n_dh}")

    n_hamming = 0
    for src in df["source"].unique():
        src_idx = np.where(df["source"].values == src)[0]
        phs = df.iloc[src_idx]["phash"].tolist()
        valid = [(i_local, src_idx[i_local], ph) for i_local, ph in enumerate(phs)
                 if ph and ph != "nan"]
        for i in range(len(valid)):
            _, gi_i, ph_i = valid[i]
            for j in range(i + 1, len(valid)):
                _, gi_j, ph_j = valid[j]
                if len(ph_i) != len(ph_j): continue
                if hamming_hex(ph_i, ph_j) <= HAMMING_THRESH:
                    if find(gi_i) != find(gi_j):
                        union(gi_i, gi_j)
                        n_hamming += 1
    print(f"  pHash-Hamming-{HAMMING_THRESH} within-source merges: {n_hamming}")

    df = df.copy()
    df["cluster_id"] = [find(i) for i in range(len(df))]
    print(f"  unique clusters: {df['cluster_id'].nunique()}")
    return df


def allocate(df: pd.DataFrame, seed: int = 42) -> pd.DataFrame:
    rng = np.random.RandomState(seed)
    df = df.copy()
    cluster_to_idxs = df.groupby("cluster_id").apply(
        lambda g: g.index.tolist(), include_groups=False).to_dict()

    # Cluster canonical (class, crop, source)
    cluster_canon = {}
    for cid, idxs in cluster_to_idxs.items():
        sub = df.loc[idxs]
        keys = list(zip(sub["class"], sub["crop"], sub["source"]))
        cluster_canon[cid] = Counter(keys).most_common(1)[0][0]

    canon_groups = defaultdict(list)
    for cid, canon in cluster_canon.items():
        canon_groups[canon].append(cid)

    print(f"[alloc] {len(canon_groups)} canonical (class, crop, source) groups")
    cluster_to_split = {}
    for (cls, crop, src), cids in canon_groups.items():
        ratios = SPLIT_RATIOS.get(src, (0.70, 0.15, 0.15))
        train_r, val_r, _ = ratios
        sizes = [len(cluster_to_idxs[c]) for c in cids]
        n_imgs = sum(sizes)

        order = rng.permutation(len(cids))
        cids_sh = [cids[i] for i in order]
        sizes_sh = [sizes[i] for i in order]

        if n_imgs < MIN_DATA_FOR_HELD_OUT:
            for cid in cids_sh: cluster_to_split[cid] = "train"
            continue

        target_train = int(round(n_imgs * train_r))
        target_val = int(round(n_imgs * val_r))
        tr_n = va_n = te_n = 0
        for cid, sz in zip(cids_sh, sizes_sh):
            deficits = [target_train - tr_n, target_val - va_n,
                        (n_imgs - target_train - target_val) - te_n]
            b = int(np.argmax(deficits))
            sn = ["train", "val", "test"][b]
            cluster_to_split[cid] = sn
            if   sn == "train": tr_n += sz
            elif sn == "val":   va_n += sz
            else:               te_n += sz

    df["split"] = df["cluster_id"].map(cluster_to_split)

    # cap oversize classes: trim PV-test → train
    for cls in df["class"].unique():
        n_test = ((df["class"] == cls) & (df["split"] == "test")).sum()
        if n_test <= TEST_CAP_PER_CLASS: continue
        excess = n_test - TEST_CAP_PER_CLASS
        pv_test_clusters = df[(df["class"] == cls) & (df["split"] == "test")
                              & (df["source"] == "plantvillage")]\
                              .groupby("cluster_id").size()
        cids_consider = list(pv_test_clusters.index)
        rng.shuffle(cids_consider)
        moved = 0
        for cid in cids_consider:
            if moved >= excess: break
            df.loc[df["cluster_id"] == cid, "split"] = "train"
            moved += pv_test_clusters[cid]
        if moved:
            print(f"  cap {cls}: -{moved} test→train")

    # boost undersize classes: move PV-train clusters → test
    for cls in df["class"].unique():
        n_test = ((df["class"] == cls) & (df["split"] == "test")).sum()
        if n_test >= MIN_TEST_PER_CLASS: continue
        if (df["class"] == cls).sum() < MIN_DATA_FOR_HELD_OUT: continue
        needed = MIN_TEST_PER_CLASS - n_test
        pv_train_clusters = df[(df["class"] == cls) & (df["split"] == "train")
                               & (df["source"] == "plantvillage")]\
                               .groupby("cluster_id").size()
        cids_consider = list(pv_train_clusters.index)
        rng.shuffle(cids_consider)
        moved = 0
        for cid in cids_consider:
            if moved >= needed: break
            df.loc[df["cluster_id"] == cid, "split"] = "test"
            moved += pv_train_clusters[cid]
        if moved:
            print(f"  boost {cls}: +{moved} train→test")

    return df


def main():
    print(f"[load] {MANIFEST}")
    df = pd.read_csv(MANIFEST)
    print(f"  {len(df)} rows")

    df = build_clusters(df)
    df = allocate(df, seed=42)

    # repair any cluster that spans splits (shouldn't happen)
    cs_count = df.groupby("cluster_id")["split"].nunique()
    n_leak = int((cs_count > 1).sum())
    if n_leak:
        for cid in cs_count[cs_count > 1].index:
            mask = df["cluster_id"] == cid
            majority = Counter(df.loc[mask, "split"]).most_common(1)[0][0]
            df.loc[mask, "split"] = majority
        print(f"  repaired {n_leak} cross-split clusters")
    cs_count = df.groupby("cluster_id")["split"].nunique()
    assert (cs_count > 1).sum() == 0, "LEAKAGE: cluster spans splits"

    df["test_type"] = df.apply(
        lambda r: SOURCE_TO_TEST_TYPE.get(r["source"], "unknown") if r["split"] == "test" else "",
        axis=1,
    )

    out = df[["path", "class", "crop", "source", "pool", "split", "test_type",
              "cluster_id", "sha256", "phash", "dhash"]]
    out.to_csv(OUT_SPLITS, index=False)
    print(f"[save] {OUT_SPLITS}")

    print(f"\n=== Split sizes ===")
    print(df.groupby("split").size().to_string())
    print(f"\n=== Per-class test totals ===")
    print(df[df["split"] == "test"].groupby("class").size().sort_values(ascending=False).to_string())
    print(f"\n=== Per-class test_type breakdown ===")
    print(df[df["split"] == "test"].groupby(["class", "test_type"]).size().unstack(fill_value=0).to_string())

    write_coverage_report(df)


def write_coverage_report(df: pd.DataFrame):
    classes = sorted(df["class"].unique())
    crops = ["tomato", "potato", "pepper", "corn", "cherry", "peach", "squash", "unknown"]
    lines = [
        "# dataset_clean — Coverage Report",
        "",
        f"Total rows: {len(df)}",
        f"Splits: train={int((df['split']=='train').sum())}, val={int((df['split']=='val').sum())}, test={int((df['split']=='test').sum())}",
        "",
        "## Per-(class, crop) train / val / test counts",
        "",
        "| class | " + " | ".join(crops) + " |",
        "|---|" + "|".join(["---"] * len(crops)) + "|",
    ]
    for cls in classes:
        cells = []
        for crop in crops:
            sub = df[(df["class"] == cls) & (df["crop"] == crop)]
            if len(sub) == 0:
                cells.append("—")
                continue
            tr = (sub["split"] == "train").sum()
            va = (sub["split"] == "val").sum()
            te = (sub["split"] == "test").sum()
            cells.append(f"{tr}/{va}/{te}")
        lines.append(f"| {cls} | " + " | ".join(cells) + " |")

    lines.extend([
        "",
        "## Per-class test_type breakdown",
        "",
        "| class | field (PD) | lab (PV) | realworld (RW) | **total test** |",
        "|---|---|---|---|---|",
    ])
    test = df[df["split"] == "test"]
    for cls in classes:
        c = test[test["class"] == cls]
        nf = int((c["test_type"] == "field").sum())
        nl = int((c["test_type"] == "lab").sum())
        nr = int((c["test_type"] == "realworld").sum())
        lines.append(f"| {cls} | {nf} | {nl} | {nr} | **{len(c)}** |")
    OUT_COVERAGE.write_text("\n".join(lines))
    print(f"[save] {OUT_COVERAGE}")


if __name__ == "__main__":
    sys.exit(main() or 0)
