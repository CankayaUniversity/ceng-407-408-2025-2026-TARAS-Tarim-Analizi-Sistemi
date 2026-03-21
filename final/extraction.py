from icrawler.builtin import BingImageCrawler
from PIL import Image
import imagehash
import os
import shutil

base_dir = r"C:\Users\oykub\OneDrive\Desktop\extracted"
target_per_class = 500
tmp_dir = os.path.join(base_dir, "_tmp_downloads")

class_queries = {
    "Tomato_Target_Spot": [
        "tomato target spot leaf disease",
        "tomato target spot symptoms leaf",
        "target spot tomato leaf field",
        "tomato target spot infected leaf",
        "target spot on tomato leaves"
    ],
    "Tomato_Bacterial_spot": [
        "tomato bacterial spot leaf disease",
        "bacterial spot on tomato leaves",
        "tomato bacterial spot symptoms leaf",
        "tomato leaf bacterial spot field",
        "infected tomato leaf bacterial spot"
    ],
    "Tomato_Early_blight": [
        "tomato early blight leaf disease",
        "early blight on tomato leaves",
        "tomato early blight symptoms leaf",
        "tomato early blight infected leaf",
        "early blight tomato leaf field"
    ],
    "Tomato_healthy": [
        "healthy tomato leaf plant",
        "healthy tomato leaves field",
        "tomato healthy leaf natural",
        "tomato plant healthy leaves",
        "healthy tomato leaf close up"
    ],
    "Tomato_Late_blight": [
        "tomato late blight leaf disease",
        "late blight on tomato leaves",
        "tomato late blight symptoms leaf",
        "late blight tomato leaf field",
        "infected tomato leaf late blight"
    ],
    "Tomato_Leaf_Mold": [
        "tomato leaf mold disease leaf",
        "leaf mold on tomato leaves",
        "tomato leaf mold symptoms leaf",
        "tomato leaf mold infected leaf",
        "leaf mold tomato leaf field"
    ],
    "Tomato_Septoria_leaf_spot": [
        "tomato septoria leaf spot disease",
        "septoria leaf spot on tomato leaves",
        "tomato septoria symptoms leaf",
        "septoria tomato leaf field",
        "infected tomato leaf septoria"
    ],
    "Tomato_Spider_mites_Two_spotted_spider_mite": [
        "two spotted spider mite tomato leaf damage",
        "spider mites on tomato leaves",
        "tomato spider mite damage leaf",
        "tomato leaf spider mites infestation",
        "tetranychus urticae tomato leaf"
    ]
}

valid_exts = (".jpg", ".jpeg", ".png", ".webp", ".bmp")

def count_valid_images(folder):
    return len([f for f in os.listdir(folder) if f.lower().endswith(valid_exts)])

def is_image_ok(path, min_w=256, min_h=256):
    try:
        with Image.open(path) as img:
            w, h = img.size
            return w >= min_w and h >= min_h
    except Exception:
        return False

def get_phash(path):
    with Image.open(path) as img:
        return imagehash.phash(img.convert("RGB"))

def copy_unique_from_tmp(tmp_folder, class_folder, seen_hashes, max_hamming=4):
    added = 0
    files = [f for f in os.listdir(tmp_folder) if f.lower().endswith(valid_exts)]

    next_idx = count_valid_images(class_folder) + 1

    for f in files:
        src = os.path.join(tmp_folder, f)

        if not is_image_ok(src):
            try:
                os.remove(src)
            except Exception:
                pass
            continue

        try:
            h = get_phash(src)
        except Exception:
            try:
                os.remove(src)
            except Exception:
                pass
            continue

        duplicate = False
        for old_h in seen_hashes:
            if h - old_h <= max_hamming:
                duplicate = True
                break

        if duplicate:
            try:
                os.remove(src)
            except Exception:
                pass
            continue

        ext = os.path.splitext(f)[1].lower()
        dst = os.path.join(class_folder, f"{next_idx:04d}{ext}")
        shutil.move(src, dst)
        seen_hashes.append(h)
        next_idx += 1
        added += 1

    return added

for class_name, queries in class_queries.items():
    class_folder = os.path.join(base_dir, class_name)
    os.makedirs(class_folder, exist_ok=True)

    seen_hashes = []
    for f in os.listdir(class_folder):
        fp = os.path.join(class_folder, f)
        if f.lower().endswith(valid_exts) and is_image_ok(fp):
            try:
                seen_hashes.append(get_phash(fp))
            except Exception:
                pass

    print(f"\n=== {class_name} ===")
    print(f"Starting unique count: {len(seen_hashes)}")

    for i, query in enumerate(queries, start=1):
        if len(seen_hashes) >= target_per_class:
            break

        if os.path.exists(tmp_dir):
            shutil.rmtree(tmp_dir, ignore_errors=True)
        os.makedirs(tmp_dir, exist_ok=True)

        print(f"Query {i}: {query}")

        crawler = BingImageCrawler(
            feeder_threads=1,
            parser_threads=2,
            downloader_threads=4,
            storage={"root_dir": tmp_dir}
        )

        crawler.crawl(
            keyword=query,
            max_num=250,
            filters={"type": "photo", "size": "large"}
        )

        added = copy_unique_from_tmp(tmp_dir, class_folder, seen_hashes, max_hamming=4)
        print(f"Added unique images: {added}")
        print(f"Current unique count: {len(seen_hashes)}")

    if os.path.exists(tmp_dir):
        shutil.rmtree(tmp_dir, ignore_errors=True)

    print(f"Final unique count for {class_name}: {len(seen_hashes)}")

print("\nDone.")