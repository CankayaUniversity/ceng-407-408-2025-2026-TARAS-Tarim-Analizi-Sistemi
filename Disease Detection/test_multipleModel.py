import tensorflow as tf
import numpy as np
import time
from tensorflow.keras.models import load_model
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score
)
import pandas as pd

# ------------------------
# AYARLAR
# ------------------------
IMG_SIZE = 256
BATCH_SIZE = 32
TEST_DIR = "dataset/test"

# ------------------------
# TEST DATASET
# ------------------------
test_ds = tf.keras.utils.image_dataset_from_directory(
    TEST_DIR,
    image_size=(IMG_SIZE, IMG_SIZE),
    batch_size=BATCH_SIZE,
    shuffle=False
)

class_names = test_ds.class_names
y_true = np.concatenate([y.numpy() for _, y in test_ds], axis=0)

# ------------------------
# TEST EDİLECEK MODELLER
# ------------------------
models_to_test = {
    "MobileNetV3Small": "models/best_MobileNetV3Small.keras",
    "EfficientNetB0": "models/best_EfficientNetB0.keras",
    "EfficientNetV2-S": "models/best_v2s.keras",
    "EfficientNetB7": "models/best_EfficientNetB7.keras",
    "EfficientNetB7 (Fine-tuned)": "models/best_EfficientNetB7_finetuned.keras",
}

results = []

# ------------------------
# TEST LOOP
# ------------------------
for model_name, model_path in models_to_test.items():
    print(f"\n🔍 Testing {model_name}")

    model = load_model(model_path)

    start = time.time()
    y_pred_probs = model.predict(test_ds, verbose=0)
    y_pred = np.argmax(y_pred_probs, axis=1)
    elapsed = time.time() - start

    results.append({
        "Model": model_name,
        "Accuracy": accuracy_score(y_true, y_pred),
        "Precision (Macro)": precision_score(y_true, y_pred, average="macro"),
        "Recall (Macro)": recall_score(y_true, y_pred, average="macro"),
        "F1 (Macro)": f1_score(y_true, y_pred, average="macro"),
        "Precision (Weighted)": precision_score(y_true, y_pred, average="weighted"),
        "Recall (Weighted)": recall_score(y_true, y_pred, average="weighted"),
        "F1 (Weighted)": f1_score(y_true, y_pred, average="weighted"),
        "Inference Time (s)": elapsed
    })

# ------------------------
# TABLO
# ------------------------
df = pd.DataFrame(results)
print("\n📊 TEST SET KARŞILAŞTIRMA TABLOSU")
print(df)

df.to_csv("model_test_comparison.csv", index=False)
print("\n📁 Kaydedildi: model_test_comparison.csv")
