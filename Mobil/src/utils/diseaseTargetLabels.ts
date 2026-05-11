// DiseaseTarget enum -> tr/en goruntuleme etiketleri
// Schema: ML/configs/label_map.py::CLASS_NAMES (14 sinif) + UNCERTAIN + OTHER = 16
// Backend'in user_correction ve folder.target_disease alanlari bu enum'u kullaniyor

import type { DiseaseTarget } from "./api";

export const DISEASE_TARGET_LABELS: Record<DiseaseTarget, { tr: string; en: string }> = {
  UNCERTAIN:                 { tr: "Belirsiz",            en: "Uncertain" },
  BACTERIAL_SPOT:            { tr: "Bakteriyel Leke",     en: "Bacterial Spot" },
  CORN_COMMON_RUST:          { tr: "Mısır Pası",          en: "Corn Common Rust" },
  CORN_GRAY_LEAF_SPOT:       { tr: "Mısır Gri Leke",      en: "Corn Gray Leaf Spot" },
  CORN_NORTHERN_LEAF_BLIGHT: { tr: "Mısır Kuzey Yanıklığı", en: "Corn N. Leaf Blight" },
  EARLY_BLIGHT:              { tr: "Erken Yanıklık",      en: "Early Blight" },
  HEALTHY:                   { tr: "Sağlıklı",            en: "Healthy" },
  LATE_BLIGHT:               { tr: "Geç Yanıklık",        en: "Late Blight" },
  LEAF_MOLD:                 { tr: "Yaprak Küfü",         en: "Leaf Mold" },
  MOSAIC_VIRUS:              { tr: "Mozaik Virüsü",       en: "Mosaic Virus" },
  POWDERY_MILDEW:            { tr: "Külleme",             en: "Powdery Mildew" },
  SEPTORIA_LEAF_SPOT:        { tr: "Septoria Lekesi",     en: "Septoria Spot" },
  SPIDER_MITES:              { tr: "Kırmızı Örümcek",     en: "Spider Mites" },
  TARGET_SPOT:               { tr: "Hedef Leke",          en: "Target Spot" },
  YELLOW_LEAF_CURL_VIRUS:    { tr: "Sarı Kıvrım Virüsü",  en: "Yellow Curl Virus" },
  OTHER:                     { tr: "Diğer",               en: "Other" },
};

/**
 * Lambda detected_disease string'ini (lowercase snake) DiseaseTarget enum'a cevir.
 * Bilinmeyen string'ler icin null doner — caller ne yapacagina karar verir.
 */
export function detectedDiseaseToTarget(s: string | null | undefined): DiseaseTarget | null {
  if (!s) return null;
  const upper = s.toUpperCase();
  const labels = DISEASE_TARGET_LABELS as Record<string, unknown>;
  if (upper in labels) return upper as DiseaseTarget;
  return null;
}

/** Get language-aware display string for a DiseaseTarget enum value. */
export function getDiseaseTargetLabel(target: DiseaseTarget, language: "tr" | "en"): string {
  const entry = DISEASE_TARGET_LABELS[target];
  return language === "tr" ? entry.tr : entry.en;
}
