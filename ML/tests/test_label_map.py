from configs.label_map import (
    CLASS_NAMES,
    CLASS_TO_IDX,
    IDX_TO_CLASS,
    LABEL_MAP_15_TO_10,
    NUM_CLASSES,
)


def test_fifteen_source_keys():
    assert len(LABEL_MAP_15_TO_10) == 15


def test_ten_target_classes():
    assert NUM_CLASSES == 10
    assert len(CLASS_NAMES) == 10
    assert len(set(CLASS_NAMES)) == 10


def test_expected_merges():
    assert LABEL_MAP_15_TO_10["Tomato___Early_blight"] == "early_blight"
    assert LABEL_MAP_15_TO_10["Potato___Early_blight"] == "early_blight"
    assert LABEL_MAP_15_TO_10["Tomato___Late_blight"] == "late_blight"
    assert LABEL_MAP_15_TO_10["Potato___Late_blight"] == "late_blight"
    assert LABEL_MAP_15_TO_10["Tomato___Bacterial_spot"] == "bacterial_spot"
    assert LABEL_MAP_15_TO_10["Pepper,_bell___Bacterial_spot"] == "bacterial_spot"
    for key in ("Tomato___healthy", "Potato___healthy", "Pepper,_bell___healthy"):
        assert LABEL_MAP_15_TO_10[key] == "healthy"


def test_class_index_roundtrip():
    for name, idx in CLASS_TO_IDX.items():
        assert IDX_TO_CLASS[idx] == name
    assert set(CLASS_TO_IDX.values()) == set(range(NUM_CLASSES))


def test_class_names_sorted():
    assert CLASS_NAMES == sorted(CLASS_NAMES)
