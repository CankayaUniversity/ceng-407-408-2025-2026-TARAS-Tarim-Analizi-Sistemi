"""ONNX Runtime version of the 3-way disease ensemble."""
from __future__ import annotations

import json
import os
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image

ort.set_default_logger_severity(3)

HERE = Path(__file__).resolve().parent
SHARED = HERE.parent / "shared"
LABELS = json.loads((SHARED / "labels.json").read_text())
ENSEMBLE = json.loads((HERE / "ensemble_config.json").read_text())
CLASSES = LABELS["classes"]
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32).reshape(3, 1, 1)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32).reshape(3, 1, 1)

_SESSIONS: list[tuple[str, ort.InferenceSession, float, int]] | None = None


def _resolve_weights(profile_name: str | None = None) -> dict[str, float]:
    if "weight_profiles" in ENSEMBLE:
        profile = profile_name or ENSEMBLE.get("default_profile", "default")
        return dict(ENSEMBLE["weight_profiles"][profile]["weights"])
    return {m["name"]: float(m.get("weight", 0.0)) for m in ENSEMBLE["members"]}


def get_sessions(weight_profile: str | None = None
                 ) -> list[tuple[str, ort.InferenceSession, float, int]]:
    global _SESSIONS
    if _SESSIONS is None:
        sess_opts = ort.SessionOptions()
        sess_opts.inter_op_num_threads = 1
        sess_opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

        weights = _resolve_weights(weight_profile)
        sessions = []
        for m in ENSEMBLE["members"]:
            stem = Path(m["checkpoint"]).stem
            ort_path = HERE / f"{stem}.ort"
            model_path = ort_path if ort_path.exists() else HERE / f"{stem}.onnx"
            sess = ort.InferenceSession(
                str(model_path),
                sess_options=sess_opts,
                providers=["CPUExecutionProvider"],
            )
            input_size = int(m.get("input_size", 224))
            w = float(weights.get(m["name"], 0.0))
            sessions.append((m["name"], sess, w, input_size))
        _SESSIONS = sessions
    return _SESSIONS


def preprocess_pil(pil_img: Image.Image, input_size: int = 224) -> np.ndarray:
    if pil_img.mode != "RGB":
        pil_img = pil_img.convert("RGB")
    resize_short = int(round(input_size * 256 / 224))
    w, h = pil_img.size
    if w < h:
        new_w, new_h = resize_short, int(round(h * resize_short / w))
    else:
        new_w, new_h = int(round(w * resize_short / h)), resize_short
    pil_img = pil_img.resize((new_w, new_h), Image.BILINEAR)
    left = (new_w - input_size) // 2
    top = (new_h - input_size) // 2
    pil_img = pil_img.crop((left, top, left + input_size, top + input_size))
    arr = np.asarray(pil_img, dtype=np.float32) / 255.0
    arr = arr.transpose(2, 0, 1)
    arr = (arr - MEAN) / STD
    return arr[np.newaxis, ...]


def _softmax(logits: np.ndarray) -> np.ndarray:
    x = logits - logits.max(axis=-1, keepdims=True)
    e = np.exp(x)
    return e / e.sum(axis=-1, keepdims=True)


def predict(pil_img: Image.Image, use_tta: bool = False) -> dict:
    import time
    sessions = get_sessions()
    ensemble_probs = np.zeros((1, 14), dtype=np.float32)
    timings = {}
    for name, sess, weight, input_size in sessions:
        t0 = time.time()
        img = preprocess_pil(pil_img, input_size=input_size)
        img_pair = [img]
        if use_tta:
            img_pair.append(img[:, :, :, ::-1].copy())
        prep_ms = int((time.time() - t0) * 1000)
        t0 = time.time()
        member_probs = np.zeros((1, 14), dtype=np.float32)
        for x in img_pair:
            logits = sess.run(["logits"], {"input": x})[0]
            member_probs = member_probs + _softmax(logits)
        infer_ms = int((time.time() - t0) * 1000)
        member_probs = member_probs / len(img_pair)
        ensemble_probs = ensemble_probs + weight * member_probs
        timings[name] = {"prep_ms": prep_ms, "infer_ms": infer_ms}

    p = ensemble_probs[0]
    top1 = int(p.argmax())
    top3_idx = p.argsort()[::-1][:3]
    return {
        "top1_class": CLASSES[top1],
        "top1_index": top1,
        "top1_confidence": float(p[top1]),
        "all_probs": {CLASSES[i]: float(p[i]) for i in range(len(CLASSES))},
        "top3": [
            {"class": CLASSES[int(i)], "confidence": float(p[int(i)])}
            for i in top3_idx
        ],
        "tta_applied": use_tta,
        "ensemble_members": [s[0] for s in sessions],
        "input_sizes": [s[3] for s in sessions],
        "timings_ms": timings,
    }


def lambda_handler(event, context):
    import base64
    import io
    img_bytes = base64.b64decode(event["image_base64"])
    pil_img = Image.open(io.BytesIO(img_bytes))
    use_tta = event.get("tta", False)
    result = predict(pil_img, use_tta=use_tta)
    return {"statusCode": 200, "body": json.dumps(result)}


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python inference_lambda_onnx.py <image_path> [--tta]")
        sys.exit(1)
    use_tta = "--tta" in sys.argv
    out = predict(Image.open(sys.argv[1]), use_tta=use_tta)
    print(json.dumps(out, indent=2))
