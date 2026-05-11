"""Load N trained checkpoints, evaluate each on test_pv + test_field, emit a side-by-side table.

Default models: ConvNeXt-Tiny, ConvNeXt-Small, EfficientNetV2-S.

Writes:
    outputs/benchmark.csv        - machine-readable, one row per model
    outputs/benchmark.md         - human-readable table, winner-bolded
    outputs/confusion_<label>_field.png  - one PNG per model (PlantDoc)
    outputs/confusion_<label>_pv.png     - one PNG per model (PlantVillage)
"""
from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

import matplotlib.pyplot as plt
import seaborn as sns
import torch
from sklearn.metrics import classification_report, confusion_matrix, f1_score

from configs.label_map import CLASS_NAMES
from taras.engine import evaluate
from taras.loaders import build_loaders
from taras.model import build_model, count_parameters

DEFAULT_MODELS: list[tuple[str, str]] = [
    ("convnext_tiny",      "checkpoints/convnext_tiny_disease10/best.pt"),
    ("convnext_small",     "checkpoints/convnext_small_disease10/best.pt"),
    ("efficientnetv2_s",   "checkpoints/efficientnetv2s_disease10/best.pt"),
]

DISPLAY_NAMES: dict[str, str] = {
    "convnext_tiny":    "ConvNeXt-Tiny",
    "convnext_small":   "ConvNeXt-Small",
    "efficientnetv2_s": "EfficientNetV2-S",
    "swin_tiny":        "Swin-Tiny",
}


def _plot_confusion(cm, out_path: Path, title: str) -> None:
    plt.figure(figsize=(10, 8))
    sns.heatmap(cm, annot=True, fmt="d", xticklabels=CLASS_NAMES, yticklabels=CLASS_NAMES, cmap="Blues")
    plt.title(title)
    plt.xlabel("Predicted"); plt.ylabel("True")
    plt.xticks(rotation=45, ha="right"); plt.yticks(rotation=0)
    plt.tight_layout()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(out_path, dpi=150)
    plt.close()


def _parse_models(args_models: list[str] | None) -> list[tuple[str, str]]:
    if not args_models:
        return DEFAULT_MODELS
    out: list[tuple[str, str]] = []
    for spec in args_models:
        if "=" not in spec:
            raise ValueError(f"--models entry must be label=path, got {spec!r}")
        label, path = spec.split("=", 1)
        out.append((label.strip(), path.strip()))
    return out


def _eval_one(label: str, ckpt_path: Path, loaders, device, out_dir: Path) -> dict:
    print(f"\n=== {label} ({ckpt_path}) ===")
    ckpt = torch.load(ckpt_path, map_location=device, weights_only=False)
    arch = ckpt.get("arch", "convnext_small.fb_in22k_ft_in1k")
    model = build_model(arch=arch, pretrained=False).to(device)
    model.load_state_dict(ckpt["model_state_dict"])
    total_params, _ = count_parameters(model)

    row: dict = {
        "label": label,
        "display": DISPLAY_NAMES.get(label, label),
        "arch": arch,
        "params_M": round(total_params / 1e6, 2),
        "ckpt_val_f1": round(float(ckpt.get("val_f1", 0.0)), 4),
        "ckpt_epoch": int(ckpt.get("epoch", -1)),
    }

    for split_name, pretty in [("test_pv", "pv"), ("test_field", "field")]:
        if split_name not in loaders:
            print(f"  [skip] {split_name} not in splits.csv")
            row[f"{pretty}_acc"] = None
            row[f"{pretty}_macro_f1"] = None
            continue
        f1, acc, preds, labels = evaluate(model, loaders[split_name], device,
                                           return_preds=True, progress=False)
        row[f"{pretty}_acc"] = round(acc, 4)
        row[f"{pretty}_macro_f1"] = round(f1, 4)
        print(f"  {pretty}: acc={acc:.4f}  macro_f1={f1:.4f}  n={len(labels)}")
        print(classification_report(
            labels, preds,
            labels=list(range(len(CLASS_NAMES))),
            target_names=CLASS_NAMES,
            digits=4, zero_division=0,
        ))
        cm = confusion_matrix(labels, preds, labels=list(range(len(CLASS_NAMES))))
        _plot_confusion(cm, out_dir / f"confusion_{label}_{pretty}.png",
                        f"{row['display']} - {pretty}")
        per_class_f1 = f1_score(labels, preds, average=None, labels=list(range(len(CLASS_NAMES))), zero_division=0)
        for cls_name, cls_f1 in zip(CLASS_NAMES, per_class_f1):
            row[f"{pretty}_f1_{cls_name}"] = round(float(cls_f1), 4)

    if row.get("pv_acc") is not None and row.get("field_acc") is not None:
        row["domain_shift_drop_pp"] = round((row["pv_acc"] - row["field_acc"]) * 100, 2)
    else:
        row["domain_shift_drop_pp"] = None
    return row


def _write_csv(rows: list[dict], path: Path) -> None:
    if not rows:
        return
    cols: list[str] = []
    for r in rows:
        for k in r:
            if k not in cols:
                cols.append(k)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)


def _winner_bold(rows: list[dict], key: str, higher_is_better: bool = True) -> dict[str, str]:
    """Return label -> cell string with bolded winner for `key`."""
    vals = [(r["label"], r.get(key)) for r in rows if r.get(key) is not None]
    if not vals:
        return {r["label"]: "-" for r in rows}
    best = max(vals, key=lambda t: t[1]) if higher_is_better else min(vals, key=lambda t: t[1])
    out: dict[str, str] = {}
    for r in rows:
        v = r.get(key)
        if v is None:
            out[r["label"]] = "-"
        elif r["label"] == best[0]:
            out[r["label"]] = f"**{v:.4f}**" if isinstance(v, float) else f"**{v}**"
        else:
            out[r["label"]] = f"{v:.4f}" if isinstance(v, float) else f"{v}"
    return out


def _write_md(rows: list[dict], path: Path) -> None:
    lines = [
        "# TARAS Disease Detection - Model Benchmark",
        "",
        "10 disease-only classes. PV = held-out PlantVillage test. Field = all of PlantDoc (held out, never seen during training).",
        "Handoff section 7 targets: PV accuracy >= 97%; field macro-F1 >= 0.65 strong, >= 0.55 acceptable, < 0.45 = rethink.",
        "",
        "## Summary",
        "",
        "| Model | Params (M) | PV acc | PV macro F1 | Field acc | Field macro F1 | Domain-shift drop |",
        "|---|---|---|---|---|---|---|",
    ]
    pv_acc_col = _winner_bold(rows, "pv_acc")
    pv_f1_col = _winner_bold(rows, "pv_macro_f1")
    field_acc_col = _winner_bold(rows, "field_acc")
    field_f1_col = _winner_bold(rows, "field_macro_f1")
    ds_drop_col = _winner_bold(rows, "domain_shift_drop_pp", higher_is_better=False)
    for r in rows:
        lines.append(
            f"| {r['display']} | {r['params_M']} | "
            f"{pv_acc_col[r['label']]} | {pv_f1_col[r['label']]} | "
            f"{field_acc_col[r['label']]} | {field_f1_col[r['label']]} | "
            f"{ds_drop_col[r['label']]} pp |"
        )
    lines += ["", "## Per-class field F1 (PlantDoc)", "",
              "| Class | " + " | ".join(DISPLAY_NAMES.get(r["label"], r["label"]) for r in rows) + " |",
              "|---|" + "---|" * len(rows)]
    for cls in CLASS_NAMES:
        key = f"field_f1_{cls}"
        col = _winner_bold(rows, key)
        lines.append(f"| {cls} | " + " | ".join(col[r["label"]] for r in rows) + " |")

    lines += ["", "## Notes", "",
              "- EfficientNetV2-S is trained at 224x224 here for a fair apples-to-apples comparison; its native training resolution is 300x300 / 384x384.",
              "- Artefacts: confusion matrices under `outputs/confusion_<label>_{pv,field}.png`, raw metrics in `outputs/benchmark.csv`.",
              ""]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines), encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--models", nargs="*", help="Zero or more `label=ckpt_path` overrides.")
    p.add_argument("--splits", type=str, default="data/processed/splits.csv")
    p.add_argument("--out-dir", type=Path, default=Path("outputs"))
    p.add_argument("--batch-size", type=int, default=64)
    p.add_argument("--num-workers", type=int, default=4)
    p.add_argument("--device", type=str, default=None)
    args = p.parse_args(argv)

    models = _parse_models(args.models)
    missing = [(label, p) for label, p in models if not Path(p).exists()]
    if missing:
        print("[err] missing checkpoints:")
        for label, path in missing:
            print(f"  - {label}: {path}")
        return 2

    device = torch.device(args.device or ("cuda" if torch.cuda.is_available() else "cpu"))
    loaders = build_loaders(args.splits, batch_size=args.batch_size, num_workers=args.num_workers)

    rows: list[dict] = []
    for label, ckpt_path in models:
        rows.append(_eval_one(label, Path(ckpt_path), loaders, device, args.out_dir))

    _write_csv(rows, args.out_dir / "benchmark.csv")
    _write_md(rows, args.out_dir / "benchmark.md")

    print("\n=== Ranked summary (by field macro F1) ===")
    ranked = sorted(rows, key=lambda r: -(r.get("field_macro_f1") or -1))
    header = f"{'Model':<20} | {'Params':>7} | {'PV F1':>6} | {'Field F1':>8} | {'DS drop':>8}"
    print(header); print("-" * len(header))
    for r in ranked:
        pv_f1 = r.get("pv_macro_f1") or 0.0
        field_f1 = r.get("field_macro_f1") or 0.0
        ds = r.get("domain_shift_drop_pp") or 0.0
        print(f"{r['display']:<20} | {r['params_M']:>5.1f}M | {pv_f1:>6.4f} | {field_f1:>8.4f} | {ds:>6.2f}pp")
    return 0


if __name__ == "__main__":
    sys.exit(main())
