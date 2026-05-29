"""Generate field-test confusion matrices for the v8 ensemble (ONNX) and mobile (TFLite).
Runs without timm/torchvision. Replicates inference/predict.py preprocessing + hflip TTA.
Outputs PNGs into ML/.
"""
import json, sys, time
from pathlib import Path
import numpy as np
import pandas as pd
from PIL import Image
import onnxruntime as ort
import tensorflow as tf
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from sklearn.metrics import confusion_matrix, f1_score

ROOT = Path("C:/Dev/TARAS")
SPLITS = ROOT / "ML/dataset_clean/splits.csv"
IMG_LOCAL_ROOT = ROOT / "ML/data/images"        # split paths -> .../images/<tail>
ENS_DIR = ROOT / "ML/models/ensemble_v8"
TFLITE = ROOT / "Mobil/assets/models/disease_detection/disease_model.tflite"
OUT = ROOT / "ML"
CLASSES = json.loads((ROOT / "ML/inference/labels.json").read_text())["classes"]
assert len(CLASSES) == 14
MEAN = np.array([0.485, 0.456, 0.406], np.float32)
STD = np.array([0.229, 0.224, 0.225], np.float32)
MEMBERS = [("v20_convnextv2_best.onnx", 224), ("v26r_swin_s_384_best.onnx", 384), ("v32_swin_b_field_best.onnx", 224)]

def local_path(p):
    i = p.replace("\\", "/").find("/images/")
    return IMG_LOCAL_ROOT / p.replace("\\", "/")[i + len("/images/"):]

def preprocess(path, size):
    img = Image.open(path).convert("RGB")
    rs = int(size * 256 / 224)
    w, h = img.size
    if w <= h: nw, nh = rs, int(round(h * rs / w))
    else:      nw, nh = int(round(w * rs / h)), rs
    img = img.resize((nw, nh), Image.BILINEAR)
    l, t = (nw - size) // 2, (nh - size) // 2
    img = img.crop((l, t, l + size, t + size))
    a = (np.asarray(img, np.float32) / 255.0 - MEAN) / STD   # HWC
    return a

def softmax(x):
    e = np.exp(x - x.max()); return e / e.sum()

def field_df():
    df = pd.read_csv(SPLITS)
    f = df[(df["split"] == "test") & (df["test_type"] == "field")].reset_index(drop=True)
    miss = [str(local_path(p)) for p in f["path"] if not local_path(p).exists()]
    print(f"field rows {len(f)} | missing local images: {len(miss)}", flush=True)
    if miss[:3]: print("  e.g.", miss[:3], flush=True)
    return f

def run_ensemble(f):
    sess = [(ort.InferenceSession(str(ENS_DIR / m), providers=["CPUExecutionProvider"]), s) for m, s in MEMBERS]
    inq = [(se.get_inputs()[0].name, se.get_outputs()[0].name) for se, _ in sess]
    yt, yp = [], []
    t0 = time.time()
    for i, row in f.iterrows():
        p = local_path(row["path"])
        avg = np.zeros(14, np.float32)
        for (se, size), (iname, oname) in zip(sess, inq):
            a = preprocess(p, size).transpose(2, 0, 1)[None]      # NCHW
            for x in (a, a[:, :, :, ::-1].copy()):                # hflip TTA
                avg += softmax(se.run([oname], {iname: x})[0][0])
        yt.append(CLASSES.index(row["class"])); yp.append(int(avg.argmax()))
        if (i + 1) % 25 == 0: print(f"  [ens] {i+1}/{len(f)}  {time.time()-t0:.0f}s", flush=True)
    return np.array(yt), np.array(yp)

def run_mobile(f):
    it = tf.lite.Interpreter(model_path=str(TFLITE)); it.allocate_tensors()
    ii, oi = it.get_input_details()[0], it.get_output_details()[0]
    yt, yp = [], []
    for i, row in f.iterrows():
        a = preprocess(local_path(row["path"]), 224)[None]        # NHWC
        avg = np.zeros(14, np.float32)
        for x in (a, a[:, :, ::-1, :].copy()):
            it.set_tensor(ii["index"], x.astype(np.float32)); it.invoke()
            avg += softmax(it.get_tensor(oi["index"])[0])
        yt.append(CLASSES.index(row["class"])); yp.append(int(avg.argmax()))
    return np.array(yt), np.array(yp)

def plot(yt, yp, title, out):
    labels = sorted(set(yt.tolist()) | set(yp.tolist()))
    names = [CLASSES[i] for i in labels]
    cm = confusion_matrix(yt, yp, labels=labels)
    macro = f1_score(yt, yp, labels=sorted(set(yt.tolist())), average="macro")
    fig, ax = plt.subplots(figsize=(10, 8.5))
    im = ax.imshow(cm, cmap="Blues")
    ax.set_xticks(range(len(names))); ax.set_xticklabels(names, rotation=45, ha="right", fontsize=8)
    ax.set_yticks(range(len(names))); ax.set_yticklabels(names, fontsize=8)
    ax.set_xlabel("Predicted"); ax.set_ylabel("True")
    ax.set_title(f"{title}\nfield macro F1 = {macro:.4f}  (n={len(yt)})")
    th = cm.max() / 2 if cm.max() else 1
    for r in range(cm.shape[0]):
        for c in range(cm.shape[1]):
            if cm[r, c]: ax.text(c, r, int(cm[r, c]), ha="center", va="center",
                                 color="white" if cm[r, c] > th else "black", fontsize=8)
    fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04); fig.tight_layout()
    fig.savefig(out, dpi=150, bbox_inches="tight"); plt.close(fig)
    print(f"SAVED {out}  macro_f1={macro:.4f}", flush=True)
    return macro

f = field_df()
print("=== mobile ===", flush=True)
yt, yp = run_mobile(f)
plot(yt, yp, "Mobile EfficientNet-B0 (distilled) - Field test (PlantDoc)", OUT / "mobile_field_confusion_matrix.png")
print("=== ensemble (slow on CPU) ===", flush=True)
yt, yp = run_ensemble(f)
plot(yt, yp, "v8 Ensemble (ConvNeXt-V2 + Swin-S@384 + Swin-B@224) - Field test (PlantDoc)", OUT / "ensemble_field_confusion_matrix.png")
print("DONE", flush=True)
