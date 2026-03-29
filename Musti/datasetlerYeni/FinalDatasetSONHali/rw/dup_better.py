import os
from PIL import Image
import imagehash

def find_similar_images(folder_path, threshold=5):
    image_hashes = []
    similar_groups = []

    valid_extensions = (".jpg", ".jpeg", ".png", ".bmp", ".webp")

    for file_name in os.listdir(folder_path):
        file_path = os.path.join(folder_path, file_name)

        if not os.path.isfile(file_path):
            continue

        if not file_name.lower().endswith(valid_extensions):
            continue

        try:
            img = Image.open(file_path)
            img_hash = imagehash.phash(img)

            found_group = False

            for group in similar_groups:
                representative_hash = group[0][1]

                if img_hash - representative_hash <= threshold:
                    group.append((file_name, img_hash))
                    found_group = True
                    break

            if not found_group:
                similar_groups.append([(file_name, img_hash)])

        except Exception as e:
            print("Hata:", file_name, "->", e)

    print("\nBenzer / duplicate görsel grupları:\n")
    group_no = 1
    found_any = False

    for group in similar_groups:
        if len(group) > 1:
            found_any = True
            print("Grup", group_no)
            for item in group:
                print("-", item[0])
            print()
            group_no += 1

    if not found_any:
        print("Benzer görsel bulunamadı.")

folder_path = input("Image klasör path'ini gir: ")
find_similar_images(folder_path, threshold=5)