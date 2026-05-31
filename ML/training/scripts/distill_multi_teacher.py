"""Multi-teacher KD: distill MobileNetV3 from a pre-computed teacher ensemble.

Offline, the script runs each teacher over all train+val images and caches
their weighted-average 14-class softmax. Online, the student is trained to
match the cache via temperature-scaled KD + a small hard-label CE term.

R4's 10-class softmax maps to 14 columns with 0 on the 4 v7-exclusive ones,
so the cache average is effectively (v11+v12)/3 there. Equal weights.
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
import timm
import torch
import torch.nn.functional as F
from PIL import Image
from torch import nn
from torch.utils.data import DataLoader, Dataset
from torchvision import transforms
from tqdm import tqdm

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from configs.label_map import NUM_CLASSES
from taras.ema import ModelEma
from taras.engine import evaluate
from taras.loaders import build_loaders
from taras.utils import get_logger, save_ckpt, set_seed

CLASS_NAMES_14 = [
    "bacterial_spot", "corn_common_rust", "corn_gray_leaf_spot",
    "corn_northern_leaf_blight", "early_blight", "healthy", "late_blight",
    "leaf_mold", "mosaic_virus", "powdery_mildew", "septoria_leaf_spot",
    "spider_mites", "target_spot", "yellow_leaf_curl_virus",
]
IDX_14 = {c: i for i, c in enumerate(CLASS_NAMES_14)}
CLASS_NAMES_10 = [
    "bacterial_spot", "early_blight", "healthy", "late_blight",
    "leaf_mold", "mosaic_virus", "septoria_leaf_spot",
    "spider_mites", "target_spot", "yellow_leaf_curl_virus",
]


class _PathDataset(Dataset):
    def __init__(self, paths, transform, hflip=False):
        self.paths = paths
        self.transform = transform
        self.hflip = hflip

    def __len__(self):
        return len(self.paths)

    def __getitem__(self, i):
        img = Image.open(self.paths[i]).convert("RGB")
        if self.hflip:
            img = img.transpose(Image.FLIP_LEFT_RIGHT)
        return self.transform(img), i


class _TrainDataset(Dataset):
    """Yields (img_tensor, target_idx_int, class_name_str) for KD training."""

    def __init__(self, df, transform, target_idx_lookup):
        self.df = df.reset_index(drop=True)
        self.transform = transform
        self.idx_lookup = target_idx_lookup

    def __len__(self):
        return len(self.df)

    def __getitem__(self, i):
        row = self.df.iloc[i]
        img = Image.open(row["path"]).convert("RGB")
        t_arr = self.transform(image=np.array(img))
        tensor = t_arr["image"] if isinstance(t_arr, dict) else t_arr
        return tensor, int(self.idx_lookup[row["path"]]), row["class"]


def standard_transform():
    return transforms.Compose([
        transforms.Resize(256),
        transforms.CenterCrop(224),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406],
                             std=[0.229, 0.224, 0.225]),
    ])


def load_teacher(ckpt_path: Path, device):
    ckpt = torch.load(ckpt_path, map_location=device, weights_only=False)
    arch = ckpt.get("arch")
    n = ckpt.get("num_classes", len(ckpt.get("class_names", [])))
    model = timm.create_model(arch, pretrained=False, num_classes=n)
    model.load_state_dict(ckpt["model_state_dict"], strict=True)
    return model.to(device).eval(), n


@torch.no_grad()
def teacher_softmax(model, loader, device, n_native, with_tta=True):
    out = torch.zeros(len(loader.dataset), n_native, device=device)
    flips = [False, True] if with_tta else [False]
    for flip in flips:
        loader.dataset.hflip = flip
        for x, idx in tqdm(loader, desc=f"hflip={flip}", leave=False):
            x = x.to(device, non_blocking=True)
            out[idx] += F.softmax(model(x), dim=1)
    return (out / len(flips)).cpu().numpy()


def map_to_14(probs, native_classes):
    n = probs.shape[0]
    out = np.zeros((n, 14), dtype=probs.dtype)
    for j, c in enumerate(native_classes):
        if c in IDX_14:
            out[:, IDX_14[c]] = probs[:, j]
    return out


def precompute_targets(args, log) -> np.ndarray:
    """Compute and cache per-image (n, 14) ensemble softmax for splits_v11 train+val rows."""
    cache_path = Path(args.targets_cache)
    if cache_path.exists() and not args.recompute:
        log.info(f"loading cached targets from {cache_path}")
        return np.load(cache_path)

    cache_path.parent.mkdir(parents=True, exist_ok=True)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    splits = pd.read_csv(args.splits)
    train_val = splits[splits["split"].isin(["train", "val"])].reset_index(drop=True)
    paths = train_val["path"].tolist()
    log.info(f"precomputing teacher targets for {len(paths)} train+val images "
             f"(this is a one-time cost)")

    transform = standard_transform()
    ds = _PathDataset(paths, transform)
    loader = DataLoader(ds, batch_size=args.batch_size, shuffle=False,
                        num_workers=args.num_workers, pin_memory=True)

    # v11+v12 only: both 14-class. R4 dropped — its 10-class softmax adds
    # zeros on 4 classes, which hurts gradient signal.
    teachers = [
        ("v16 EMA", "swin_base_disease14_v16_strat_pd/ema-best.pt", CLASS_NAMES_14, 1.0),
        ("v15 EMA", "swin_small_disease14_v15_strat_pd/ema-best.pt", CLASS_NAMES_14, 1.0),
    ]
    aggregate = np.zeros((len(paths), 14), dtype=np.float32)
    total_w = 0.0
    for name, rel, native, w in teachers:
        ckpt_path = Path("checkpoints") / rel
        if not ckpt_path.exists():
            log.warning(f"  [skip] {name}: {ckpt_path} not found")
            continue
        log.info(f"  -> {name}: {ckpt_path.name}")
        model, n_native = load_teacher(ckpt_path, device)
        probs = teacher_softmax(model, loader, device, n_native,
                                 with_tta=not args.no_tta)
        probs_14 = map_to_14(probs, native)
        aggregate += w * probs_14
        total_w += w
        del model
        torch.cuda.empty_cache()
    aggregate = aggregate / max(total_w, 1.0)

    # renormalize rows to sum to 1
    row_sums = aggregate.sum(axis=1, keepdims=True)
    aggregate = aggregate / np.maximum(row_sums, 1e-8)

    np.save(cache_path, aggregate)
    # path order sidecar for sanity checking
    pd.DataFrame({"order": range(len(paths)), "path": paths}).to_csv(
        cache_path.with_suffix(".paths.csv"), index=False)
    log.info(f"saved {cache_path} shape={aggregate.shape}")
    return aggregate


def main(argv=None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--splits", default="data/processed/splits_v11.csv")
    p.add_argument("--targets-cache", default="data/processed/multi_teacher_softmax_v11v12.npy")
    p.add_argument("--out-dir", type=Path, default=Path("checkpoints/mnv3_multi_teacher_v11v12"))
    p.add_argument("--student-arch", default="mobilenetv3_large_100.ra_in1k")
    p.add_argument("--epochs", type=int, default=30)
    p.add_argument("--batch-size", type=int, default=32)
    p.add_argument("--num-workers", type=int, default=4)
    p.add_argument("--temperature", type=float, default=4.0)
    p.add_argument("--alpha", type=float, default=0.7,
                   help="Weight on KD loss (1-alpha on hard-label CE)")
    p.add_argument("--lr", type=float, default=5e-4)
    p.add_argument("--weight-decay", type=float, default=1e-4)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--no-tta", action="store_true")
    p.add_argument("--recompute", action="store_true")
    p.add_argument("--ema-decay", type=float, default=0.9999)
    p.add_argument("--no-amp", action="store_true",
                   help="Disable AMP/autocast (FP32 training) for numerical stability.")
    p.add_argument("--sleep-per-batch", type=float, default=0.0,
                   help="Seconds to sleep between training batches. Throttles GPU for sharing.")
    args = p.parse_args(argv)

    args.out_dir.mkdir(parents=True, exist_ok=True)
    log = get_logger("multi_teacher")
    set_seed(args.seed)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    log.info(f"device={device}  out={args.out_dir}  student={args.student_arch}")
    log.info(f"splits={args.splits}  T={args.temperature}  alpha={args.alpha}")

    targets_full = precompute_targets(args, log)
    targets_full_t = torch.from_numpy(targets_full).float().to(device)

    # map each batch image back to its row in the target cache
    splits = pd.read_csv(args.splits)
    train_val = splits[splits["split"].isin(["train", "val"])].reset_index(drop=True)
    path_to_target_idx = {p: i for i, p in enumerate(train_val["path"])}

    # channels_last + AMP broke gradient flow on RDNA4 (loss=NaN from epoch 1).
    # RDNA4 ROCm 7.x doesn't optimize channels_last for EffNet depthwise convs
    # anyway — empirically the same speed.
    student = timm.create_model(args.student_arch, pretrained=True,
                                 num_classes=NUM_CLASSES).to(device)

    # custom train loader yields (img, label, target_idx); val/test_field reuse build_loaders
    from taras.transforms import build_train_transform, build_eval_transform

    splits_full = pd.read_csv(args.splits)
    train_df = splits_full[splits_full["split"] == "train"].reset_index(drop=True)
    train_ds = _TrainDataset(train_df, build_train_transform(), path_to_target_idx)

    from configs.label_map import CLASS_TO_IDX
    train_loader = DataLoader(
        train_ds, batch_size=args.batch_size, shuffle=True,
        num_workers=args.num_workers, pin_memory=True, drop_last=True,
        persistent_workers=(args.num_workers > 0),
        prefetch_factor=4 if args.num_workers > 0 else None,
    )

    eval_loaders = build_loaders(
        splits_csv=args.splits, batch_size=args.batch_size,
        num_workers=args.num_workers, persistent_workers=(args.num_workers > 0),
    )
    log.info(f"loaders built: train={len(train_ds)} "
             f"val={len(eval_loaders['val'].dataset)} "
             f"test_field={len(eval_loaders.get('test_field', eval_loaders['val']).dataset)}")

    optimizer = torch.optim.AdamW(student.parameters(), lr=args.lr,
                                   weight_decay=args.weight_decay)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)
    use_amp = device.type == "cuda" and not args.no_amp
    scaler = torch.amp.GradScaler() if use_amp else None
    if args.no_amp:
        log.info("[AMP] disabled (--no-amp): training in FP32")
    T = args.temperature

    ema = ModelEma(student, decay=args.ema_decay) if args.ema_decay > 0 else None
    if ema is not None:
        log.info(f"[EMA] tracking student with decay={args.ema_decay}")

    best_score = 0.0
    ema_best_score = 0.0
    for epoch in range(args.epochs):
        student.train()
        total = 0
        t0 = time.time()
        for batch in tqdm(train_loader, desc=f"epoch {epoch+1}/{args.epochs}", leave=False):
            x, target_idx, class_names = batch[0], batch[1], batch[2]
            x = x.to(device, non_blocking=True)
            y = torch.tensor([CLASS_TO_IDX[c] for c in class_names], device=device)

            target_idx_t = target_idx.to(device)
            tgt = targets_full_t[target_idx_t]  # (B, 14)

            optimizer.zero_grad(set_to_none=True)
            with torch.amp.autocast(device_type=device.type, enabled=use_amp):
                logits = student(x)
                # KD loss: T*T * KL(softmax(student/T) || softmax(teacher_logits/T))
                # Cache holds softmax at T=1, so we re-temperature via
                # teacher_logits ≈ log(softmax+eps); softmax_T = softmax(logits/T).
                tgt_logits = torch.log(tgt.clamp(min=1e-8))
                tgt_T = F.softmax(tgt_logits / T, dim=1)
                kd = F.kl_div(F.log_softmax(logits / T, dim=1), tgt_T,
                              reduction="batchmean") * (T * T)
                ce = F.cross_entropy(logits, y, label_smoothing=0.1)
                loss = args.alpha * kd + (1 - args.alpha) * ce

            if use_amp:
                scaler.scale(loss).backward()
                scaler.step(optimizer)
                scaler.update()
            else:
                loss.backward()
                optimizer.step()
            if ema is not None:
                ema.update(student)
            total += float(loss.item()) * x.size(0)
            if args.sleep_per_batch > 0:
                torch.cuda.synchronize()
                time.sleep(args.sleep_per_batch)

        sched.step()
        train_loss = total / len(train_ds)

        val_f1, val_acc = evaluate(student, eval_loaders["val"], device, progress=False)
        if "test_field" in eval_loaders:
            field_f1, field_acc = evaluate(student, eval_loaders["test_field"], device, progress=False)
            score = 0.5 * val_f1 + 0.5 * field_f1
        else:
            field_f1 = field_acc = 0.0
            score = val_f1
        dt = time.time() - t0
        log.info(f"[{epoch+1}/{args.epochs}] loss={train_loss:.4f} "
                 f"val_f1={val_f1:.4f} field_f1={field_f1:.4f} "
                 f"score={score:.4f} time={dt:.0f}s")

        if score > best_score:
            best_score = score
            save_ckpt(args.out_dir / "best.pt", student, {
                "epoch": epoch, "val_f1": val_f1, "field_f1": field_f1,
                "score": score, "arch": args.student_arch,
                "num_classes": NUM_CLASSES, "teacher": "v11+v12 ensemble",
            })
            log.info(f"  * new best score={score:.4f}")

        if ema is not None:
            ema_val_f1, _ = evaluate(ema.module, eval_loaders["val"], device, progress=False)
            ema_field_f1, _ = evaluate(ema.module, eval_loaders["test_field"], device, progress=False)
            ema_score = 0.5 * ema_val_f1 + 0.5 * ema_field_f1
            log.info(f"  EMA val_f1={ema_val_f1:.4f} field_f1={ema_field_f1:.4f} score={ema_score:.4f}")
            if ema_score > ema_best_score:
                ema_best_score = ema_score
                save_ckpt(args.out_dir / "ema-best.pt", ema.module, {
                    "epoch": epoch, "val_f1": ema_val_f1, "field_f1": ema_field_f1,
                    "score": ema_score, "arch": args.student_arch,
                    "num_classes": NUM_CLASSES, "teacher": "v11+v12 ensemble",
                })
                log.info(f"  * new EMA best score={ema_score:.4f}")

    log.info(f"done - best score={best_score:.4f}"
             + (f"; EMA best={ema_best_score:.4f}" if ema is not None else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
