// Fotograf onizleme — full-bleed karanlik arkaplan, alttan kayan aksiyon karti
// Canli taramadan gelen sonuc varsa banner olarak gösterir

import { View, Image, Text, TouchableOpacity, StyleSheet, Dimensions } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PhotoPreviewProps } from "./types";
import { useLanguage } from "../../context/LanguageContext";
import { vs, ms, s } from "../../utils/responsive";

const CLASS_LABELS: Record<string, { tr: string; en: string }> = {
  bacterial_spot:          { tr: "Bakteriyel Leke",     en: "Bacterial Spot" },
  early_blight:            { tr: "Erken Yanıklık",      en: "Early Blight" },
  healthy:                 { tr: "Sağlıklı",            en: "Healthy" },
  late_blight:             { tr: "Geç Yanıklık",        en: "Late Blight" },
  leaf_mold:               { tr: "Yaprak Küfü",         en: "Leaf Mold" },
  mosaic_virus:            { tr: "Mozaik Virüsü",       en: "Mosaic Virus" },
  septoria_leaf_spot:      { tr: "Septoria Lekesi",     en: "Septoria Spot" },
  spider_mites:            { tr: "Kırmızı Örümcek",     en: "Spider Mites" },
  target_spot:             { tr: "Hedef Leke",          en: "Target Spot" },
  yellow_leaf_curl_virus:  { tr: "Sarı Kıvrım Virüsü", en: "Yellow Curl Virus" },
};

export const PhotoPreview = ({ theme, photoUri, onCancel, onSend, localResult }: PhotoPreviewProps) => {
  const { t, language } = useLanguage();
  const insets = useSafeAreaInsets();
  const { width } = Dimensions.get("window");
  const imgSize = width * 0.86;

  const hasLocalResult = localResult?.status === "confident" && !!localResult.className;
  const localLabel = hasLocalResult
    ? (CLASS_LABELS[localResult!.className!] ?? { tr: localResult!.className!, en: localResult!.className! })
    : null;
  const localPct = hasLocalResult ? Math.round((localResult!.confidence ?? 0) * 100) : 0;
  const isHealthy = localResult?.className === "healthy";
  const dotColor = !hasLocalResult ? theme.textSecondary : isHealthy ? (theme.success ?? "#22C55E") : (theme.danger ?? theme.primary);

  return (
    <View style={styles.fill}>
      {/* Üst kapat butonu */}
      <TouchableOpacity
        onPress={onCancel}
        hitSlop={10}
        style={[styles.closeBtn, { top: insets.top + vs(12) }]}
      >
        <Ionicons name="close" size={26} color="#fff" />
      </TouchableOpacity>

      {/* Merkezde fotoğraf */}
      <View style={styles.center}>
        <Image
          source={{ uri: photoUri }}
          style={{ width: imgSize, height: imgSize, borderRadius: 16 }}
          resizeMode="cover"
        />
      </View>

      {/* Alt aksiyon karti */}
      <View
        style={[
          styles.actionCard,
          {
            backgroundColor: theme.surface + "F5",
            paddingBottom: insets.bottom + vs(20),
            borderColor: theme.primary + "25",
          },
        ]}
      >
        {hasLocalResult && localLabel && (
          <View style={styles.resultBanner}>
            <View style={[styles.dot, { backgroundColor: dotColor }]} />
            <Text style={[styles.resultText, { color: theme.textMain }]} numberOfLines={1}>
              <Text style={{ color: theme.textSecondary, fontWeight: "500" }}>
                {language === "tr" ? "Cihaz sonucu: " : "On-device: "}
              </Text>
              <Text style={{ fontWeight: "700" }}>
                {language === "tr" ? localLabel.tr : localLabel.en}
              </Text>
              <Text style={{ color: theme.textSecondary, fontWeight: "500" }}>
                {"  •  "}
              </Text>
              <Text style={{ color: dotColor, fontWeight: "700" }}>
                %{localPct}
              </Text>
            </Text>
          </View>
        )}

        <View style={styles.buttonRow}>
          <TouchableOpacity
            onPress={onCancel}
            style={[styles.button, { borderWidth: 1, borderColor: theme.textSecondary + "50" }]}
          >
            <Text style={{ color: theme.textMain, fontSize: ms(15, 0.3), fontWeight: "600" }}>
              {t.camera.retakeButton}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onSend}
            style={[styles.button, { backgroundColor: theme.primary }]}
          >
            <Text style={{ color: "#fff", fontSize: ms(15, 0.3), fontWeight: "700" }}>
              {t.camera.sendButton}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#000" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: s(180) },
  closeBtn: {
    position: "absolute",
    left: s(16),
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  actionCard: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: vs(14),
    paddingHorizontal: s(16),
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
  },
  resultBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    marginBottom: 10,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  resultText: { fontSize: 13, flex: 1 },
  buttonRow: { flexDirection: "row", gap: 10 },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});
