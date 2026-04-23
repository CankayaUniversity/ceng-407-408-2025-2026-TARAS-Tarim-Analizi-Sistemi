"""15-class PlantVillage + PlantDoc → 10 disease-only class merge.

Single source of truth. See `ML/TARAS_Disease_Detection_Training_Plan.md`
section 1.2 and `ML/TARAS_Context_Handoff.md` section 5 for pathology
justification for each merge.

PlantVillage keys use the canonical spMohanty folder names
(`Pepper,_bell___` with the comma, `Spider_mites Two-spotted_spider_mite`
with a space). PlantDoc class names are from pratikkayal/PlantDoc-Dataset.
"""
from __future__ import annotations

# Maps original 15-class PlantVillage labels -> 10 disease-only classes.
# Target classes (10): bacterial_spot, early_blight, healthy, late_blight,
#                      leaf_mold, mosaic_virus, septoria_leaf_spot, spider_mites,
#                      target_spot, yellow_leaf_curl_virus.
LABEL_MAP_15_TO_10: dict[str, str] = {
    # Merged - cross-crop pathology confirmed identical
    "Tomato___Early_blight":                           "early_blight",
    "Potato___Early_blight":                           "early_blight",
    "Tomato___Late_blight":                            "late_blight",
    "Potato___Late_blight":                            "late_blight",
    "Tomato___Bacterial_spot":                         "bacterial_spot",
    "Pepper,_bell___Bacterial_spot":                   "bacterial_spot",
    "Tomato___healthy":                                "healthy",
    "Potato___healthy":                                "healthy",
    "Pepper,_bell___healthy":                          "healthy",

    # Tomato-only - no cross-crop analog in the 15-class source
    "Tomato___Leaf_Mold":                              "leaf_mold",
    "Tomato___Septoria_leaf_spot":                     "septoria_leaf_spot",
    "Tomato___Spider_mites Two-spotted_spider_mite":   "spider_mites",
    "Tomato___Target_Spot":                            "target_spot",
    "Tomato___Tomato_Yellow_Leaf_Curl_Virus":          "yellow_leaf_curl_virus",
    "Tomato___Tomato_mosaic_virus":                    "mosaic_virus",
}

# Maps PlantDoc folder names -> the same 10 disease-only target classes.
# PlantDoc lacks `target_spot`; everything else is covered (spider_mites is in
# the train/ subfolder only). We use all PlantDoc images as the held-out
# `test_field` split (see scripts/make_splits.py) so train/test distinction
# inside PlantDoc is irrelevant to us.
PLANTDOC_LABEL_MAP: dict[str, str] = {
    "Tomato Early blight leaf":                        "early_blight",
    "Potato leaf early blight":                        "early_blight",
    "Tomato leaf late blight":                         "late_blight",
    "Potato leaf late blight":                         "late_blight",
    "Tomato leaf bacterial spot":                      "bacterial_spot",
    "Bell_pepper leaf spot":                           "bacterial_spot",
    "Tomato leaf yellow virus":                        "yellow_leaf_curl_virus",
    "Tomato leaf mosaic virus":                        "mosaic_virus",
    "Tomato mold leaf":                                "leaf_mold",
    "Tomato Septoria leaf spot":                       "septoria_leaf_spot",
    "Tomato two spotted spider mites leaf":            "spider_mites",
    "Tomato leaf":                                     "healthy",
    "Bell_pepper leaf":                                "healthy",
}

CLASS_NAMES: list[str] = sorted(set(LABEL_MAP_15_TO_10.values()))
NUM_CLASSES: int = len(CLASS_NAMES)
CLASS_TO_IDX: dict[str, int] = {name: i for i, name in enumerate(CLASS_NAMES)}
IDX_TO_CLASS: dict[int, str] = {i: name for name, i in CLASS_TO_IDX.items()}

assert NUM_CLASSES == 10, f"Expected 10 merged classes, got {NUM_CLASSES}"
assert set(PLANTDOC_LABEL_MAP.values()).issubset(set(CLASS_NAMES)), (
    "PlantDoc map produces classes outside the 10 disease-only set"
)
