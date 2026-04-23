"""Find the calibration temperature T that minimizes cross-entropy on the val set.

Uses LBFGS on a single scalar over cached logits - no gradient through the
network itself. Saves T to a sidecar `temperature.txt` in the same directory
as the checkpoint so downstream inference (Lambda handler, ONNX runtime path)
can pick it up.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import torch
import torch.nn.functional as F
from tqdm import tqdm

from taras.loaders import build_loaders
from taras.model import build_model


def find_best_temperature(
    model: torch.nn.Module,
    val_loader,
    device: torch.device,
) -> tuple[float, float, float]:
    """Return (T, nll_before, nll_after) on the val set."""
    model.eval()
    all_logits: list[torch.Tensor] = []
    all_labels: list[torch.Tensor] = []
    with torch.no_grad():
        for x, y, _ in tqdm(val_loader, desc="collect logits", leave=False):
            x = x.to(device, non_blocking=True)
            all_logits.append(model(x).cpu())
            all_labels.append(y)
    logits = torch.cat(all_logits)
    labels = torch.cat(all_labels)

    nll_before = float(F.cross_entropy(logits, labels).item())

    temperature = torch.nn.Parameter(torch.ones(1) * 1.0)
    optimizer = torch.optim.LBFGS([temperature], lr=0.01, max_iter=50)

    def step():
        optimizer.zero_grad()
        loss = F.cross_entropy(logits / temperature.clamp(min=1e-3), labels)
        loss.backward()
        return loss

    optimizer.step(step)
    T = float(temperature.detach().item())
    nll_after = float(F.cross_entropy(logits / T, labels).item())
    return T, nll_before, nll_after


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--ckpt", type=Path,
                   default=Path("checkpoints/SHIPPING_v1_round2/best.pt"))
    p.add_argument("--splits", type=str, default="data/processed/splits.csv")
    p.add_argument("--split", type=str, default="val",
                   help="Which split to calibrate on (never use test_field).")
    p.add_argument("--batch-size", type=int, default=64)
    p.add_argument("--num-workers", type=int, default=4)
    args = p.parse_args(argv)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    ckpt = torch.load(args.ckpt, map_location=device, weights_only=False)
    arch = ckpt.get("arch", "swin_tiny_patch4_window7_224.ms_in22k_ft_in1k")
    model = build_model(arch=arch, pretrained=False).to(device)
    model.load_state_dict(ckpt["model_state_dict"])

    loaders = build_loaders(args.splits, batch_size=args.batch_size, num_workers=args.num_workers)
    if args.split not in loaders:
        print(f"[err] split={args.split!r} not in loaders (have {list(loaders.keys())})")
        return 2

    T, nll_before, nll_after = find_best_temperature(model, loaders[args.split], device)
    print(f"[calibration] split={args.split}  nll_before={nll_before:.4f}  nll_after={nll_after:.4f}  T={T:.4f}")

    out_path = args.ckpt.with_name("temperature.txt")
    out_path.write_text(f"{T:.6f}\n")
    print(f"[ok] wrote {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
