import os
import shutil
import math
import random

def create_proportional_split(base_folders):
    # Tekrarlanabilirlik için random seed sabitleyelim
    random.seed(42)

    for base in base_folders:
        if not os.path.exists(base):
            print(f"Uyarı: {base} klasörü bulunamadı, atlanıyor.")
            continue
            
        print(f"\n--- {base} orantılı bölünüyor... ---")
        
        # Sınıfları (Tomato_healthy vb.) listele
        classes = [d for d in os.listdir(base) if os.path.isdir(os.path.join(base, d))]
        
        for cls in classes:
            cls_path = os.path.join(base, cls)
            # Sadece fotoğrafları al, mevcut stage klasörlerini atla
            files = [f for f in os.listdir(cls_path) if os.path.isfile(os.path.join(cls_path, f)) and f.lower().endswith(('.png', '.jpg', '.jpeg'))]
            
            # Karıştır (Shuffle) - Aile bazlı isimlendirme varsa bunu yapma!
            # random.shuffle(files) # Eğer fotolar rastgele ise açabilirsin.

            total_files = len(files)
            if total_files == 0:
                continue

            # Oranları hesapla
            if base == 'Pv_400':
                # Pv_400: stage1 (2/3), stage2 (1/3)
                s1_count = math.ceil(total_files * (2/3))
            else: # rw
                # rw: stage1 (1/3), stage2 (2/3)
                s1_count = math.ceil(total_files * (1/3))
            
            stage1_files = files[:s1_count]
            stage2_files = files[s1_count:]
            
            # Hedef klasörleri oluştur
            s1_path = os.path.join(cls_path, 'stage1')
            s2_path = os.path.join(cls_path, 'stage2')
            os.makedirs(s1_path, exist_ok=True)
            os.makedirs(s2_path, exist_ok=True)
            
            # Dosyaları TAŞI (Move)
            for f in stage1_files:
                shutil.move(os.path.join(cls_path, f), os.path.join(s1_path, f))
            for f in stage2_files:
                shutil.move(os.path.join(cls_path, f), os.path.join(s2_path, f))
                
            print(f"{cls}: Toplam {total_files} fotodan {len(stage1_files)} adedi stage1'e, {len(stage2_files)} adedi stage2'ye taşındı.")

# --- ÇALIŞTIR ---
# Klasör isimlerini görsellerdeki gibi yazdım.
target_folders = ['Pv_400', 'rw']
create_proportional_split(target_folders)
print("\nOrantılı bölme işlemi başarıyla tamamlandı!")