"""Class names, display map, and Turkish farming recommendations.

The class order in CLASS_NAMES MUST match the order the model was trained
with — it drives how argmax indices turn into label strings. If the model
is retrained with a different class set, update CLASS_NAMES and the
display map below in lockstep. An init-time assert in inference.py catches
drift between CLASS_NAMES length and the model's classifier output.
"""
from __future__ import annotations

# Yaprak hastaligi siniflari - egitilen modelle birebir ayni sirada olmali.
CLASS_NAMES: list[str] = [
    "Tomato_Late_blight",
    "Tomato_Leaf_Mold",
    "Tomato_Leaf_blight",
    "Tomato_Septoria_leaf_spot",
    "Tomato_Spider_mites_Two_spotted_spider_mite",
    "Tomato_healthy",
]

# Ham etiket -> insan okunabilir Ingilizce isim.
# Kept English because the mobile app surfaces `detected_disease` as-is and
# changing these strings would require a coordinated mobile release.
_DISPLAY_MAP: dict[str, str] = {
    "Tomato_Late_blight": "Tomato - Late Blight",
    "Tomato_Leaf_Mold": "Tomato - Leaf Mold",
    "Tomato_Leaf_blight": "Tomato - Leaf Blight",
    "Tomato_Septoria_leaf_spot": "Tomato - Septoria Leaf Spot",
    "Tomato_Spider_mites_Two_spotted_spider_mite": "Tomato - Spider Mites (Two-Spotted)",
    "Tomato_healthy": "Tomato - Healthy",
}


def display_name(raw_label: str) -> str:
    """Map a raw training label to its display string. Falls through to raw."""
    return _DISPLAY_MAP.get(raw_label, raw_label)


# Turkce ciftcilik onerileri - display name (Ingilizce) -> oneri listesi.
# Onlar mobil uygulamada kullanici ile paylasilir, bu yuzden Turkce.
_RECOMMENDATIONS_TR: dict[str, list[str]] = {
    "Tomato - Late Blight": [
        "ACIL: Sistemik fungisit uygulayin",
        "Etkilenen bitkileri hemen kaldirin",
        "Ustten sulama yapmayin",
        "Havalandirma icin bitki araligini genisletin",
        "Olgun meyveleri hemen hasat edin",
    ],
    "Tomato - Leaf Mold": [
        "Sera veya tunel havalandirmasini artirin",
        "Nemi %85 altina dusurun",
        "Ciddi durumlarda fungisit uygulayin",
        "Enfekte yapraklari kaldirin",
        "Bitki araligini genisletin",
    ],
    "Tomato - Leaf Blight": [
        "Erken belirtilerde mancozeb veya klorotalonil fungisit uygulayin",
        "Etkilenen yapraklari derhal kaldirin",
        "Bitki etrafindaki hava sirkulasyonunu iyilestirin",
        "Yaprak islanma suresini azaltin",
        "Toprak sicramasini onlemek icin malcleyin",
    ],
    "Tomato - Septoria Leaf Spot": [
        "Alt yapraklardaki enfekte kisimlari kaldirin",
        "Bakir bazli veya mancozeb fungisit uygulayin",
        "Hava sirkulasyonunu iyilestirin",
        "Ustten sulama yapmayin",
        "Bitkiler arasi ekipmanlari sterilize edin",
    ],
    "Tomato - Spider Mites (Two-Spotted)": [
        "Akarisit veya insektisit sabun uygulayin",
        "Bitki etrafinda nemi artirin",
        "Yogun enfekte yapraklari kaldirin",
        "Mevcutsa predator akarlari birakin",
        "Su stresinden kacinin - tutarli nem saglayin",
    ],
    "Tomato - Healthy": [
        "Mevcut sulama programini surdurun",
        "Duzenli gozlem yapin",
        "Hava kosullari uygunsa onleyici fungisit uygulayin",
        "Dengeli gubreleme yapin",
    ],
}

_UNCERTAIN_MESSAGE_TR = (
    "Model emin degil - farkli acidan veya daha net bir fotograf ile tekrar deneyin."
)
_UNKNOWN_FALLBACK_TR = [
    "Tespit edilemeyen durum - zirai danismana basvurun",
]


def get_recommendations(display_disease: str) -> list[str]:
    """Turkish recommendations for a display disease name.

    Returns a generic fallback string if the disease is not in the map (this
    should only happen if display_name returned a raw label it didn't have a
    mapping for).
    """
    return _RECOMMENDATIONS_TR.get(display_disease, _UNKNOWN_FALLBACK_TR)


def get_uncertain_recommendations() -> list[str]:
    """Returned when model confidence is below CONF_THRESHOLD."""
    return [_UNCERTAIN_MESSAGE_TR]
