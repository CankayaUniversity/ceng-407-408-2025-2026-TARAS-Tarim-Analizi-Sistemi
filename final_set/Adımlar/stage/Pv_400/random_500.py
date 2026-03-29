import os
import random
import shutil

random.seed(42)

samples_per_class = 500

input_folders = [
    r"C:/Users/oykub/OneDrive/Desktop/PlantVillage/Tomato_Target_Spot",
    r"C:/Users/oykub/OneDrive/Desktop/PlantVillage/Tomato_Bacterial_spot",
    r"C:/Users/oykub/OneDrive/Desktop/PlantVillage/Tomato_Early_blight",
    r"C:/Users/oykub/OneDrive/Desktop/PlantVillage/Tomato_healthy",
    r"C:/Users/oykub/OneDrive/Desktop/PlantVillage/Tomato_Late_blight",
    r"C:/Users/oykub/OneDrive/Desktop/PlantVillage/Tomato_Leaf_Mold",
    r"C:/Users/oykub/OneDrive/Desktop/PlantVillage/Tomato_Septoria_leaf_spot",
    r"C:/Users/oykub/OneDrive/Desktop/PlantVillage/Tomato_Spider_mites_Two_spotted_spider_mite"
]

output_base = r"C:/Users/oykub/OneDrive/Desktop/PlantVillage_500"

for input_path in input_folders:
    class_name = os.path.basename(input_path)
    output_path = os.path.join(output_base, class_name)

    os.makedirs(output_path, exist_ok=True)

    images = os.listdir(input_path)

    if len(images) <= samples_per_class:
        selected = images
    else:
        selected = random.sample(images, samples_per_class)

    for img in selected:
        src = os.path.join(input_path, img)
        dst = os.path.join(output_path, img)
        shutil.copy(src, dst)

    print(f"{class_name}: {len(selected)} copied")