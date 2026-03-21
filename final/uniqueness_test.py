import os
import hashlib

def get_image_hash(file_path):
    """Generate MD5 hash of an image file"""
    hash_md5 = hashlib.md5()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            hash_md5.update(chunk)
    return hash_md5.hexdigest()

def get_image_hashes(folder):
    """Get all image hashes in a folder"""
    image_files = [f for f in os.listdir(folder) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.bmp'))]
    hashes = {}
    
    for img_file in image_files:
        file_path = os.path.join(folder, img_file)
        try:
            img_hash = get_image_hash(file_path)
            hashes[img_hash] = img_file
        except Exception as e:
            print(f"Error hashing {img_file}: {e}")
    
    return hashes

def find_non_unique(folder1, folder2):
    """Find non-unique images (present in both folders)"""
    print(f"Scanning folder 1: {folder1}")
    hashes1 = get_image_hashes(folder1)
    print(f"Found {len(hashes1)} unique images in folder 1")
    
    print(f"\nScanning folder 2: {folder2}")
    hashes2 = get_image_hashes(folder2)
    print(f"Found {len(hashes2)} unique images in folder 2")
    
    # Find common hashes
    common_hashes = set(hashes1.keys()) & set(hashes2.keys())
    
    print(f"\n--- Non-unique images in folder 1 ---")
    print(f"Found {len(common_hashes)} duplicate images:")
    for hash_val in common_hashes:
        print(f"  {hashes1[hash_val]}")
    
    return common_hashes, hashes1, hashes2

if __name__ == "__main__":
    folder1 = input("Folder 1 yolunu girin: ").strip().strip('"').strip("'")
    folder2 = input("Folder 2 yolunu girin: ").strip().strip('"').strip("'")
    
    # Normalize paths
    folder1 = os.path.normpath(folder1)
    folder2 = os.path.normpath(folder2)
    
    print(f"\nFolder 1: {folder1}")
    print(f"Var mı?: {os.path.exists(folder1)}")
    print(f"\nFolder 2: {folder2}")
    print(f"Var mı?: {os.path.exists(folder2)}\n")
    
    if not os.path.exists(folder1):
        print(f"Hata: Folder 1 bulunamadı: {folder1}")
        exit(1)
    
    if not os.path.exists(folder2):
        print(f"Hata: Folder 2 bulunamadı: {folder2}")
        exit(1)
    
    if not os.path.isdir(folder1):
        print(f"Hata: Folder 1 bir klasör değil: {folder1}")
        exit(1)
    
    if not os.path.isdir(folder2):
        print(f"Hata: Folder 2 bir klasör değil: {folder2}")
        exit(1)
    
    find_non_unique(folder1, folder2)
