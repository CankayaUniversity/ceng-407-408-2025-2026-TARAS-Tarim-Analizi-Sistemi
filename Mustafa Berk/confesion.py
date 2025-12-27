import tensorflow as tf
import numpy as np
from tensorflow.keras.models import load_model
from sklearn.metrics import confusion_matrix, classification_report

model = load_model("best_effnet_leaf_disease.h5")

test_ds = tf.keras.utils.image_dataset_from_directory(
    "dataset/test",
    image_size=(224,224),
    batch_size=32,
    shuffle=False
)

y_true = []
y_pred = []

for images, labels in test_ds:
    preds = model.predict(images)
    y_true.extend(labels.numpy())
    y_pred.extend(np.argmax(preds, axis=1))

print(classification_report(y_true, y_pred, target_names=test_ds.class_names))
