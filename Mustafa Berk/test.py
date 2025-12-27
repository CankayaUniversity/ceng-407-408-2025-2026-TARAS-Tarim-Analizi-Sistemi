import tensorflow as tf
import numpy as np
import time
from tensorflow.keras.models import load_model
from sklearn.metrics import classification_report, precision_score, recall_score, f1_score

# ------------------------
# MODELİ YÜKLE
# ------------------------
model = load_model("best_v2s.keras")

# ------------------------
# TEST DATASET
# ------------------------
IMG_SIZE = 256
BATCH_SIZE = 32
TEST_DIR = "dataset/test"

test_ds = tf.keras.utils.image_dataset_from_directory(
    TEST_DIR,
    image_size=(IMG_SIZE, IMG_SIZE),
    batch_size=BATCH_SIZE,
    shuffle=False
)

class_names = test_ds.class_names
num_classes = len(class_names)

# ------------------------
# GERÇEK LABEL'LAR
# ------------------------
y_true = np.concatenate([y.numpy() for _, y in test_ds], axis=0)

# ------------------------
# TEST + ZAMAN ÖLÇÜMÜ
# ------------------------
start_time = time.time()

y_pred_probs = model.predict(test_ds, verbose=1)
y_pred = np.argmax(y_pred_probs, axis=1)

end_time = time.time()

# ------------------------
# METRİKLER
# ------------------------
test_loss, test_acc = model.evaluate(test_ds, verbose=0)

precision_macro = precision_score(y_true, y_pred, average="macro")
recall_macro    = recall_score(y_true, y_pred, average="macro")
f1_macro        = f1_score(y_true, y_pred, average="macro")

precision_weighted = precision_score(y_true, y_pred, average="weighted")
recall_weighted    = recall_score(y_true, y_pred, average="weighted")
f1_weighted        = f1_score(y_true, y_pred, average="weighted")

# ------------------------
# ZAMAN HESAPLARI
# ------------------------
total_time = end_time - start_time
num_images = len(y_true)
time_per_image = total_time / num_images

# ------------------------
# SONUÇLAR
# ------------------------
print("\n===== TEST RESULTS =====")
print(f"Dataset            : {TEST_DIR}")
print(f"Test Accuracy      : {test_acc:.4f}")
print(f"Test Loss          : {test_loss:.4f}")

print("\n--- Precision / Recall / F1 ---")
print(f"Precision (macro)  : {precision_macro:.4f}")
print(f"Recall (macro)     : {recall_macro:.4f}")
print(f"F1-score (macro)   : {f1_macro:.4f}")

print(f"Precision (weighted): {precision_weighted:.4f}")
print(f"Recall (weighted)   : {recall_weighted:.4f}")
print(f"F1-score (weighted) : {f1_weighted:.4f}")

print("\n--- Timing ---")
print(f"Total test time    : {total_time:.2f} seconds")
print(f"Images tested      : {num_images}")
print(f"Time per image     : {time_per_image:.4f} seconds/image")

print("\n--- Classification Report ---")
print(classification_report(y_true, y_pred, target_names=class_names))
