"""14-class disease-only treatment-distinct label map (v3 — Round 5).

Each class maps to a single distinct treatment in `Backend/Lambda_v5/labels.py`.
Cross-crop merging is applied where pathology + treatment is identical
(bacterial_spot across tomato+pepper+peach, late_blight on tomato+potato, etc.).

Sources merged:
  - PlantVillage (raw/color/) — `Crop___Disease` folder convention
  - PlantDoc (plantdoc_extracted/{train,test}/) — `Crop Disease leaf` convention
  - Teammate Mustafa's merged/train/ — `Crop_Disease` convention (12 classes;
    his Potato_Leaf_blight bundles early+late, disambiguated by filename in
    the v6 pool builder)

CLASS_NAMES is alphabetical (preserves the existing convention so
`Backend/Lambda_v5/labels.py::CLASS_NAMES` order is reproducible).

Excluded from this round (lab-only, no PlantDoc field validation):
  apple_scab, black_rot (apple+grape), cedar_apple_rust, esca, leaf_blight_grape,
  haunglongbing (citrus), leaf_scorch (strawberry). These are scheduled for v7.
"""
from __future__ import annotations

# ============================================================
# PlantVillage (raw/color/) -> 14 disease-only classes.
# ============================================================
LABEL_MAP_PV_TO_14: dict[str, str] = {
    # Cross-crop merges — pathology + treatment identical.
    "Tomato___Early_blight":                                "early_blight",
    "Potato___Early_blight":                                "early_blight",
    "Tomato___Late_blight":                                 "late_blight",
    "Potato___Late_blight":                                 "late_blight",
    "Tomato___Bacterial_spot":                              "bacterial_spot",
    "Pepper,_bell___Bacterial_spot":                        "bacterial_spot",
    "Peach___Bacterial_spot":                               "bacterial_spot",
    "Tomato___healthy":                                     "healthy",
    "Potato___healthy":                                     "healthy",
    "Pepper,_bell___healthy":                               "healthy",
    "Peach___healthy":                                      "healthy",
    "Corn_(maize)___healthy":                               "healthy",
    "Cherry_(including_sour)___healthy":                    "healthy",

    # Tomato-only.
    "Tomato___Leaf_Mold":                                   "leaf_mold",
    "Tomato___Septoria_leaf_spot":                          "septoria_leaf_spot",
    "Tomato___Spider_mites Two-spotted_spider_mite":        "spider_mites",
    "Tomato___Target_Spot":                                 "target_spot",
    "Tomato___Tomato_Yellow_Leaf_Curl_Virus":               "yellow_leaf_curl_virus",
    "Tomato___Tomato_mosaic_virus":                         "mosaic_virus",

    # Corn (3 distinct fungal diseases, each with its own treatment schedule).
    "Corn_(maize)___Common_rust_":                          "corn_common_rust",
    "Corn_(maize)___Northern_Leaf_Blight":                  "corn_northern_leaf_blight",
    "Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot":   "corn_gray_leaf_spot",

    # Powdery mildew is the same Erysiphales-family pathogen with the same
    # sulfur-based treatment across cucurbits + cherries — pool both crops.
    "Squash___Powdery_mildew":                              "powdery_mildew",
    "Cherry_(including_sour)___Powdery_mildew":             "powdery_mildew",
}

# ============================================================
# PlantDoc (plantdoc_extracted/{train,test}/) -> 14 classes.
# ============================================================
PLANTDOC_LABEL_MAP_14: dict[str, str] = {
    "Tomato Early blight leaf":                             "early_blight",
    "Potato leaf early blight":                             "early_blight",
    "Tomato leaf late blight":                              "late_blight",
    "Potato leaf late blight":                              "late_blight",
    "Tomato leaf bacterial spot":                           "bacterial_spot",
    "Bell_pepper leaf spot":                                "bacterial_spot",
    "Tomato leaf yellow virus":                             "yellow_leaf_curl_virus",
    "Tomato leaf mosaic virus":                             "mosaic_virus",
    "Tomato mold leaf":                                     "leaf_mold",
    "Tomato Septoria leaf spot":                            "septoria_leaf_spot",
    "Tomato two spotted spider mites leaf":                 "spider_mites",
    "Tomato leaf":                                          "healthy",
    "Bell_pepper leaf":                                     "healthy",
    "Peach leaf":                                           "healthy",

    # Corn — PlantDoc has all three diseases.
    "Corn rust leaf":                                       "corn_common_rust",
    "Corn leaf blight":                                     "corn_northern_leaf_blight",
    "Corn Gray leaf spot":                                  "corn_gray_leaf_spot",

    # Powdery mildew — squash only in PlantDoc (no cherry).
    "Squash Powdery mildew leaf":                           "powdery_mildew",

    # Excluded from PlantDoc: Apple Scab Leaf, Apple leaf, Apple rust leaf,
    # Blueberry leaf, Cherry leaf, Raspberry leaf, Soyabean leaf, Strawberry leaf,
    # grape leaf, grape leaf black rot — those are out-of-eval-space classes.
    # PlantDoc doesn't have target_spot.
}

# ============================================================
# Teammate Mustafa's merged/train/ -> 14 classes.
# His Potato_Leaf_blight folder bundles early + late blight together; the
# v6 pool builder splits them by filename prefix (Potato_early_blight_* vs
# Potato_late_blight_*) so this map intentionally OMITS that folder.
# ============================================================
MUSTAFA_LABEL_MAP_14: dict[str, str] = {
    "Bell_pepper_bacterial_spot":                           "bacterial_spot",
    "Bell_pepper_healthy":                                  "healthy",
    "Corn_common_rust":                                     "corn_common_rust",
    "Corn_northern_leaf_blight":                            "corn_northern_leaf_blight",
    "Squash_powdery_mildew":                                "powdery_mildew",
    "Tomato_Late_blight":                                   "late_blight",
    "Tomato_Leaf_Mold":                                     "leaf_mold",
    # His "Tomato_Leaf_blight" = tomato early_blight (per v5 unified eval mapping).
    "Tomato_Leaf_blight":                                   "early_blight",
    "Tomato_Septoria_leaf_spot":                            "septoria_leaf_spot",
    "Tomato_Spider_mites_Two_spotted_spider_mite":          "spider_mites",
    "Tomato_healthy":                                       "healthy",
    # NOTE: Potato_Leaf_blight handled by filename-disambiguation in v6 builder,
    # NOT by this dict.
}

# ============================================================
# Canonical ordering — alphabetical, locked.
# ============================================================
CLASS_NAMES: list[str] = sorted(set(LABEL_MAP_PV_TO_14.values()))
NUM_CLASSES: int = len(CLASS_NAMES)
CLASS_TO_IDX: dict[str, int] = {name: i for i, name in enumerate(CLASS_NAMES)}
IDX_TO_CLASS: dict[int, str] = {i: name for name, i in CLASS_TO_IDX.items()}

# Crop coverage per class — used for crop-aware UI / per-crop-balanced eval.
CLASS_CROPS: dict[str, set[str]] = {
    "bacterial_spot":            {"tomato", "pepper", "peach"},
    "corn_common_rust":          {"corn"},
    "corn_gray_leaf_spot":       {"corn"},
    "corn_northern_leaf_blight": {"corn"},
    "early_blight":              {"tomato", "potato"},
    "healthy":                   {"tomato", "potato", "pepper", "corn", "cherry", "peach"},
    "late_blight":               {"tomato", "potato"},
    "leaf_mold":                 {"tomato"},
    "mosaic_virus":              {"tomato"},
    "powdery_mildew":            {"squash", "cherry"},
    "septoria_leaf_spot":        {"tomato"},
    "spider_mites":              {"tomato"},
    "target_spot":               {"tomato"},
    "yellow_leaf_curl_virus":    {"tomato"},
}

# ============================================================
# Sanity invariants.
# ============================================================
assert NUM_CLASSES == 14, f"Expected 14 classes, got {NUM_CLASSES}"
assert set(PLANTDOC_LABEL_MAP_14.values()).issubset(set(CLASS_NAMES)), (
    "PlantDoc map produces classes outside the 14-class set"
)
assert set(MUSTAFA_LABEL_MAP_14.values()).issubset(set(CLASS_NAMES)), (
    "Mustafa map produces classes outside the 14-class set"
)
assert set(CLASS_CROPS.keys()) == set(CLASS_NAMES), (
    "CLASS_CROPS keys must match CLASS_NAMES exactly"
)
