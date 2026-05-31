"""Convert ML/models/mobile/disease_model.pt -> TFLite fp16."""
from __future__ import annotations

import os
import shutil
import sys
import tempfile
from pathlib import Path

import numpy as np
import torch

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")

ROOT = Path(__file__).resolve().parent.parent.parent
ML = ROOT / "ML"
MOBILE_PT = ML / "models" / "mobile" / "disease_model.pt"
MOBILE_OUT = ROOT / "Mobil" / "assets" / "models" / "disease_detection" / "disease_model.tflite"

sys.path.insert(0, str(ML / "inference"))
from inference_mobile import load_disease_model, CLASSES  # noqa: E402

INPUT_SHAPE = (1, 3, 224, 224)
DRIFT_MAX = 0.005


def export_onnx(pt_path: Path, onnx_path: Path) -> None:
    print(f"[1/3] PT -> ONNX")
    model = load_disease_model(pt_path, device="cpu")
    dummy = torch.randn(*INPUT_SHAPE)
    torch.onnx.export(
        model, dummy, str(onnx_path),
        input_names=["input"], output_names=["logits"],
        opset_version=17,
        do_constant_folding=True,
        dynamo=False,
    )
    size_mb = onnx_path.stat().st_size / (1024 * 1024)
    print(f"      {onnx_path.name}: {size_mb:.2f} MB")


def export_tflite(onnx_path: Path, out_dir: Path) -> Path:
    print(f"[2/3] ONNX -> TFLite (via onnx2tf, NCHW->NHWC + fp16)")
    # onnx2tf's download_test_image_data() fetches a calibration .npy that
    # 404s in this env; patch with synthetic noise so convert() proceeds.
    import onnx2tf
    from onnx2tf.utils import common_functions as _cf
    def _fake_dl():
        return (np.random.default_rng(0).integers(0, 255, (1, 224, 224, 3))
                .astype(np.uint8))
    _orig_cf = _cf.download_test_image_data
    _orig_ot = onnx2tf.onnx2tf.download_test_image_data
    _cf.download_test_image_data = _fake_dl
    onnx2tf.onnx2tf.download_test_image_data = _fake_dl
    try:
        onnx2tf.convert(
            input_onnx_file_path=str(onnx_path),
            output_folder_path=str(out_dir),
            copy_onnx_input_output_names_to_tflite=False,
            non_verbose=True,
        )
    finally:
        _cf.download_test_image_data = _orig_cf
        onnx2tf.onnx2tf.download_test_image_data = _orig_ot
    fp16 = next(out_dir.glob("*_float16.tflite"), None)
    if fp16 is None:
        raise FileNotFoundError(f"no *_float16.tflite produced in {out_dir}")
    size_mb = fp16.stat().st_size / (1024 * 1024)
    print(f"      {fp16.name}: {size_mb:.2f} MB")
    return fp16


def parity_check(pt_path: Path, tflite_path: Path) -> None:
    print(f"[3/3] PT vs TFLite numerical parity")
    import tensorflow as tf  # noqa
    rng = np.random.default_rng(42)
    nchw = rng.standard_normal(INPUT_SHAPE, dtype=np.float32)
    nhwc = np.transpose(nchw, (0, 2, 3, 1))

    model = load_disease_model(pt_path, device="cpu")
    with torch.no_grad():
        pt_logits = model(torch.from_numpy(nchw)).numpy()
    pt_probs = _softmax(pt_logits)

    interp = tf.lite.Interpreter(model_path=str(tflite_path))
    interp.allocate_tensors()
    inp = interp.get_input_details()[0]
    out = interp.get_output_details()[0]
    interp.set_tensor(inp["index"], nhwc.astype(np.float32))
    interp.invoke()
    tflite_logits = interp.get_tensor(out["index"])
    tflite_probs = _softmax(tflite_logits)

    drift = float(np.max(np.abs(pt_probs - tflite_probs)))
    pt_top = int(pt_probs.argmax())
    tflite_top = int(tflite_probs.argmax())
    same_top1 = pt_top == tflite_top
    print(f"      max softmax drift: {drift:.6f}  (gate <= {DRIFT_MAX})")
    print(f"      top1 PT={CLASSES[pt_top]} TFLite={CLASSES[tflite_top]} match={same_top1}")
    if drift > DRIFT_MAX:
        raise RuntimeError(f"parity check failed: drift {drift} > {DRIFT_MAX}")
    if not same_top1:
        raise RuntimeError("parity check failed: top1 mismatch")


def _softmax(x: np.ndarray) -> np.ndarray:
    x = x - x.max(axis=-1, keepdims=True)
    e = np.exp(x)
    return e / e.sum(axis=-1, keepdims=True)


def main() -> None:
    if not MOBILE_PT.exists():
        print(f"FATAL: {MOBILE_PT} not found", file=sys.stderr)
        sys.exit(1)
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        onnx_path = tmp / "disease_model.onnx"
        export_onnx(MOBILE_PT, onnx_path)
        out_dir = tmp / "tflite_out"
        out_dir.mkdir()
        fp16_tflite = export_tflite(onnx_path, out_dir)
        parity_check(MOBILE_PT, fp16_tflite)
        MOBILE_OUT.parent.mkdir(parents=True, exist_ok=True)
        backup = MOBILE_OUT.with_suffix(".tflite.bak")
        if MOBILE_OUT.exists():
            shutil.copy2(MOBILE_OUT, backup)
            print(f"      backed up old bundle -> {backup.name}")
        shutil.copy2(fp16_tflite, MOBILE_OUT)
        size_mb = MOBILE_OUT.stat().st_size / (1024 * 1024)
        print(f"[ok] {MOBILE_OUT.relative_to(ROOT)}: {size_mb:.2f} MB")


if __name__ == "__main__":
    main()
