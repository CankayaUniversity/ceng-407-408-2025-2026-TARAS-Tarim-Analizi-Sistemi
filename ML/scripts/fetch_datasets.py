"""Print + attempt dataset acquisition steps for PlantVillage, PlantDoc, and realworld.

Doesn't try to auto-download gigabytes without user intent - it looks for the
expected folders under `data/raw/`, reports what's missing, and attempts the
download only when a matching tool (`kaggle`, `git`) is present on PATH.
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

PV_DIR = Path("data/raw/plantvillage")
PD_DIR = Path("data/raw/plantdoc")
RW_DIR = Path("data/raw/realworld_blend")

PV_KAGGLE_ID = "emmarex/plantdisease"
PD_GIT_URL = "https://github.com/pratikkayal/PlantDoc-Dataset.git"


def _run(cmd: list[str], cwd: Path | None = None) -> int:
    print(f"  $ {' '.join(cmd)}")
    return subprocess.run(cmd, cwd=cwd, check=False).returncode


def fetch_plantvillage() -> None:
    if PV_DIR.exists() and any(PV_DIR.iterdir()):
        print(f"[skip] PlantVillage already at {PV_DIR}")
        return
    PV_DIR.parent.mkdir(parents=True, exist_ok=True)
    if shutil.which("kaggle"):
        print(f"[kaggle] downloading {PV_KAGGLE_ID} ...")
        tmp = Path("data/raw/_kaggle_pv")
        tmp.mkdir(parents=True, exist_ok=True)
        if _run(["kaggle", "datasets", "download", "-d", PV_KAGGLE_ID, "-p", str(tmp), "--unzip"]) != 0:
            print("[warn] kaggle download failed - do it manually, then rerun.")
            return
        inner = next((p for p in tmp.iterdir() if p.is_dir()), tmp)
        inner.rename(PV_DIR)
        shutil.rmtree(tmp, ignore_errors=True)
        print(f"[ok] PlantVillage -> {PV_DIR}")
    else:
        print(
            "[manual] Install kaggle CLI (`pip install kaggle`, configure ~/.kaggle/kaggle.json),\n"
            f"         then: kaggle datasets download -d {PV_KAGGLE_ID} -p data/raw/ --unzip\n"
            f"         and rename the extracted folder to `{PV_DIR.name}/`.\n"
            "         Alt source: https://github.com/spMohanty/PlantVillage-Dataset (raw)."
        )


def fetch_plantdoc() -> None:
    if PD_DIR.exists() and any(PD_DIR.iterdir()):
        print(f"[skip] PlantDoc already at {PD_DIR}")
        return
    PD_DIR.parent.mkdir(parents=True, exist_ok=True)
    if shutil.which("git"):
        if _run(["git", "clone", "--depth", "1", PD_GIT_URL, str(PD_DIR)]) == 0:
            print(f"[ok] PlantDoc -> {PD_DIR}")
            return
        print("[warn] git clone failed - populate manually.")
    else:
        print(f"[manual] git clone {PD_GIT_URL} {PD_DIR}")


def fetch_realworld() -> None:
    if RW_DIR.exists() and any(RW_DIR.iterdir()):
        print(f"[skip] realworld_blend already at {RW_DIR}")
        return
    RW_DIR.mkdir(parents=True, exist_ok=True)
    print(
        f"[manual] Populate `{RW_DIR}/<disease_class>/*.jpg` from your private field collection.\n"
        "         Folder names MUST match the 10 disease-only classes in configs/label_map.py.\n"
        "         See ML/TARAS_Context_Handoff.md section 2 for the known real-world failure modes."
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-pv", action="store_true")
    parser.add_argument("--skip-pd", action="store_true")
    parser.add_argument("--skip-rw", action="store_true")
    args = parser.parse_args(argv)
    if not args.skip_pv:
        fetch_plantvillage()
    if not args.skip_pd:
        fetch_plantdoc()
    if not args.skip_rw:
        fetch_realworld()
    return 0


if __name__ == "__main__":
    sys.exit(main())
