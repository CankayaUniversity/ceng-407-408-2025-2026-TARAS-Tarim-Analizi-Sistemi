import tensorflow as tf
import numpy as np
import os
from tensorflow.keras.models import load_model
from tensorflow.keras.preprocessing import image
from tensorflow.keras.applications.efficientnet import preprocess_input

# ------------------------
# MODEL
# ------------------------
model = load_model("best_v2s.keras")

IMG_SIZE = 256
IMAGE_DIR = "random_leaves"
CONF_THRESHOLD = 0.6

class_names = [
    "Pepper_bell_Bacterial_spot",
    "Pepper_bell_healthy",
    "Potato_Early_blight",
    "Potato_Late_blight",
    "Potato_healthy",
    "Tomato_Bacterial_spot",
    "Tomato_Early_blight",
    "Tomato_Late_blight",
    "Tomato_Leaf_Mold",
    "Tomato_Septoria_leaf_spot",
    "Tomato_Spider_mites_Two_spotted_spider_mite",
    "Tomato_Target_Spot",
    "Tomato_Tomato_YellowLeaf_Curl_Virus",
    "Tomato_Tomato_mosaic_virus",
    "Tomato_healthy"
]

print("\n===== RANDOM LEAF TEST (CORRECT PREPROCESS) =====\n")

for img_name in os.listdir(IMAGE_DIR):
    img_path = os.path.join(IMAGE_DIR, img_name)

    img = image.load_img(img_path, target_size=(IMG_SIZE, IMG_SIZE))
    img_array = image.img_to_array(img)
    img_array = np.expand_dims(img_array, axis=0)

    # 🔥 DOĞRU ADIM
    img_array = preprocess_input(img_array)

    preds = model.predict(img_array, verbose=0)[0]
    idx = np.argmax(preds)
    confidence = preds[idx]

    if confidence < CONF_THRESHOLD:
        print(f"{img_name} -> ❓ Emin değil ({confidence:.2f})")
    else:
        print(f"{img_name} -> {class_names[idx]} ({confidence:.2f})")
