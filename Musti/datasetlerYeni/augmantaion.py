import os
import cv2
import random
import albumentations as A
from tqdm import tqdm

# 1. Augmentation Teknikleri
transform = A.Compose([
    A.HorizontalFlip(p=0.5),
    A.VerticalFlip(p=0.2),
    A.RandomRotate90(p=0.5),
    A.RandomBrightnessContrast(brightness_limit=0.2, contrast_limit=0.2, p=0.3),
    A.ShiftScaleRotate(shift_limit=0.06, scale_limit=0.1, rotate_limit=20, p=0.5),
    A.HueSaturationValue(hue_shift_limit=10, sat_shift_limit=20, val_shift_limit=10, p=0.3),
])

def augment_folder(path, target_count):
    if not os.path.exists(path):
        return
    
    # Mevcut resimleri al
    images = [f for f in os.listdir(path) if f.lower().endswith(('.png', '.jpg', '.jpeg'))]
    current_count = len(images)
    
    if current_count == 0:
        return
    
    if current_count >= target_count:
        return # Hedefe zaten ulaşılmış

    needed = target_count - current_count
    
    # Progress bar için sınıf ismini alalım
    class_name = os.path.basename(os.path.dirname(os.path.dirname(os.path.dirname(path))))
    stage_name = os.path.basename(os.path.dirname(path))
    
    for i in tqdm(range(needed), desc=f"{class_name} | {stage_name}"):
        # Rastgele bir kaynak resim seç
        source_name = random.choice(images)
        image = cv2.imread(os.path.join(path, source_name))
        image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

        # Augmentation uygula
        augmented = transform(image=image)['image']
        augmented = cv2.cvtColor(augmented, cv2.COLOR_RGB2BGR)

        # Yeni isimle kaydet
        new_name = f"aug_{i}_{source_name}"
        cv2.imwrite(os.path.join(path, new_name), augmented)

# --- ANA DÖNGÜ ---
# Hedef tanımlamaları
configs = [
    {'base': 'Pv_400', 'stage': 'stage1', 'target': 267},
    {'base': 'Pv_400', 'stage': 'stage2', 'target': 133},
    {'base': 'rw', 'stage': 'stage1', 'target': 116},
    {'base': 'rw', 'stage': 'stage2', 'target': 200}
]

for config in configs:
    base = config['base']
    if not os.path.exists(base):
        continue
        
    classes = [d for d in os.listdir(base) if os.path.isdir(os.path.join(base, d))]
    
    for cls in classes:
        # Yol: base/sınıf/stage/train
        train_path = os.path.join(base, cls, config['stage'], 'train')
        augment_folder(train_path, config['target'])

print("\nVeri artırma işlemi tamamlandı! Artık her sınıf hedef sayıya ulaştı.")