import splitfolders
import os
import shutil

# Ana dizinler
base_dirs = ['Pv_400', 'rw']
stages = ['stage1', 'stage2']

def finalize_splits():
    for base in base_dirs:
        if not os.path.exists(base):
            continue
            
        print(f"\n--- {base} ana klasörü işleniyor ---")
        
        # Sınıfları listele (Tomato_Bacterial_spot, Tomato_healthy vb.)
        classes = [d for d in os.listdir(base) if os.path.isdir(os.path.join(base, d))]
        
        for cls in classes:
            for stage in stages:
                # Kaynak yol: örn. rw/Tomato_healthy/stage1
                input_path = os.path.join(base, cls, stage)
                
                if os.path.exists(input_path):
                    print(f"Bölünüyor: {base} -> {cls} -> {stage}")
                    
                    # split-folders bir 'input' klasörü bekler ve onun içindeki 
                    # klasörleri 'sınıf' olarak görür. Bizim yapımızda 'stage'in 
                    # içinde doğrudan resimler olduğu için geçici bir düzenleme yapıyoruz.
                    
                    # Çıktı yolu: geçici bir klasör
                    temp_output = os.path.join(base, cls, f"{stage}_temp")
                    
                    # splitfolders.fixed veya .ratio doğrudan klasör içindeki 
                    # dosyaları sınıf klasörü varmış gibi bölemez. 
                    # Bu yüzden 'stage' klasörünü bir üst dizin gibi gösterip bölüyoruz.
                    splitfolders.ratio(input_path, 
                                       output=temp_output, 
                                       seed=42, 
                                       ratio=(.8, .15, .05), 
                                       move=True)
                    
                    # Bölme bittikten sonra dosyaları 'stage' klasörünün içine taşıyıp 
                    # temp klasörünü temizleyelim
                    for split_type in ['train', 'val', 'test']:
                        src = os.path.join(temp_output, split_type)
                        dst = os.path.join(input_path, split_type)
                        if os.path.exists(src):
                            # Eğer hedefte 'train' varsa önce temizle (üst üste binmesin)
                            if os.path.exists(dst):
                                shutil.rmtree(dst)
                            shutil.move(src, dst)
                    
                    # Geçici klasörü sil
                    shutil.rmtree(temp_output)

if __name__ == "__main__":
    finalize_splits()
    print("\nİşlem tamamlandı! Klasör yapısı artık train/val/test şeklinde.")