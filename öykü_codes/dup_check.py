import os
import hashlib

def get_image_hash(file_path):
    with open(file_path, 'rb') as f:
        file_bytes = f.read()
        return hashlib.md5(file_bytes).hexdigest()

def find_duplicate_images(folder_path):
    hashes = {}
    duplicates = []

    for root, dirs, files in os.walk(folder_path):
        for file in files:
            file_path = os.path.join(root, file)

            try:
                file_hash = get_image_hash(file_path)

                if file_hash in hashes:
                    duplicates.append((file_path, hashes[file_hash]))
                else:
                    hashes[file_hash] = file_path

            except Exception as e:
                print(f"Hata: {file_path} -> {e}")

    return duplicates


# Kullanıcıdan path al
folder_path = input("Image klasör path'ini gir: ")

duplicates = find_duplicate_images(folder_path)

if duplicates:
    print("\nAynı olan fotoğraflar:")
    for dup, original in duplicates:
        print(f"\nDuplicate: {dup}")
        print(f"Original : {original}")
else:
    print("\nDuplicate fotoğraf bulunamadı.")