// Fotograf onizleme — full-bleed karanlik arkaplan, alttan kayan aksiyon karti
// Folder modunda ust banner, on-device sonuc varsa ring + chip ile ozet gosterir

import { View, Image, Text, StyleSheet, Dimensions } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Svg, { Circle } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PhotoPreviewProps } from "./types";
import { useLanguage } from "../../context/LanguageContext";
import { vs, ms, s } from "../../utils/responsive";
import { PressableDark } from "../../components/PressableDark";

const CLASS_LABELS: Record<string, { tr: string; en: string }> = {
  bacterial_spot:            { tr: "Bakteriyel Leke",     en: "Bacterial Spot" },
  corn_common_rust:          { tr: "Mısır Pası",          en: "Corn Common Rust" },
  corn_gray_leaf_spot:       { tr: "Mısır Gri Leke",      en: "Corn Gray Leaf Spot" },
  corn_northern_leaf_blight: { tr: "Mısır Kuzey Yanıklığı", en: "Corn N. Leaf Blight" },
  early_blight:              { tr: "Erken Yanıklık",      en: "Early Blight" },
  healthy:                   { tr: "Sağlıklı",            en: "Healthy" },
  late_blight:               { tr: "Geç Yanıklık",        en: "Late Blight" },
  leaf_mold:                 { tr: "Yaprak Küfü",         en: "Leaf Mold" },
  mosaic_virus:              { tr: "Mozaik Virüsü",       en: "Mosaic Virus" },
  powdery_mildew:            { tr: "Külleme",             en: "Powdery Mildew" },
  septoria_leaf_spot:        { tr: "Septoria Lekesi",     en: "Septoria Spot" },
  spider_mites:              { tr: "Kırmızı Örümcek",     en: "Spider Mites" },
  target_spot:               { tr: "Hedef Leke",          en: "Target Spot" },
  yellow_leaf_curl_virus:    { tr: "Sarı Kıvrım Virüsü",  en: "Yellow Curl Virus" },
};

export const PhotoPreview = ({
  theme,
  photoUri,
  onCancel,
  onSend,
  localResult,
  folderContext,
}: PhotoPreviewProps) => {
  const { t, language } = useLanguage();
  const insets = useSafeAreaInsets();
  const { width } = Dimensions.get("window");
  const imgSize = width * 0.86;

  const hasLocalResult = localResult?.status === "confident" && !!localResult.className;
  const localLabel = hasLocalResult
    ? (CLASS_LABELS[localResult!.className!] ?? { tr: localResult!.className!, en: localResult!.className! })
    : null;
  const localConfidence = hasLocalResult ? (localResult!.confidence ?? 0) : 0;
  const localPctText = (localConfidence * 100).toFixed(1);
  const isHealthy = localResult?.className === "healthy";
  const statusColor = !hasLocalResult
    ? theme.textSecondary
    : isHealthy
      ? theme.success
      : theme.danger;

  // Confidence ring geometry (matches LiveScanOverlay visual language)
  const RING_SIZE = 52;
  const STROKE = 3;
  const radius = (RING_SIZE - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - localConfidence);

  return (
    <View style={styles.fill}>
      {/* Top bar — close button + optional folder context chip */}
      <View
        style={[
          styles.topBar,
          { top: insets.top + vs(8), paddingHorizontal: s(12) },
        ]}
      >
        <PressableDark
          onPress={onCancel}
          style={styles.closeBtn}
          darkenColor="rgba(255,255,255,0.18)"
        >
          <Ionicons name="close" size={24} color="#fff" />
        </PressableDark>

        {folderContext && (
          <View style={[styles.folderChip, { backgroundColor: theme.primary + "DD" }]}>
            <Ionicons name="folder" size={13} color={theme.textOnPrimary} />
            <Text
              style={[styles.folderChipText, { color: theme.textOnPrimary }]}
              numberOfLines={1}
            >
              {folderContext.folderName}
            </Text>
          </View>
        )}
      </View>

      {/* Photo */}
      <View style={styles.center}>
        <Image
          source={{ uri: photoUri }}
          style={{ width: imgSize, height: imgSize, borderRadius: 18 }}
          resizeMode="cover"
        />
      </View>

      {/* Bottom action card */}
      <View
        style={[
          styles.actionCard,
          {
            backgroundColor: theme.surface,
            paddingBottom: insets.bottom + vs(20),
            borderColor: theme.primary + "20",
          },
        ]}
      >
        {hasLocalResult && localLabel && (
          <View style={styles.resultRow}>
            <View style={styles.ringWrap}>
              <Svg width={RING_SIZE} height={RING_SIZE} style={StyleSheet.absoluteFill}>
                <Circle
                  cx={RING_SIZE / 2}
                  cy={RING_SIZE / 2}
                  r={radius}
                  stroke={theme.border}
                  strokeWidth={STROKE}
                  fill="none"
                />
                <Circle
                  cx={RING_SIZE / 2}
                  cy={RING_SIZE / 2}
                  r={radius}
                  stroke={statusColor}
                  strokeWidth={STROKE}
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={`${circumference} ${circumference}`}
                  strokeDashoffset={dashOffset}
                  transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
                />
              </Svg>
              <Text style={[styles.ringPct, { color: theme.textMain }]}>{localPctText}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: theme.textSecondary,
                  fontSize: 11,
                  fontWeight: "600",
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                }}
              >
                {language === "tr" ? "Cihaz Sonucu" : "On-device"}
              </Text>
              <Text
                style={{
                  color: theme.textMain,
                  fontSize: ms(16, 0.3),
                  fontWeight: "700",
                  marginTop: 2,
                }}
                numberOfLines={1}
              >
                {language === "tr" ? localLabel.tr : localLabel.en}
              </Text>
            </View>
          </View>
        )}

        <View style={styles.buttonRow}>
          <PressableDark
            onPress={onCancel}
            style={[styles.button, styles.retakeBtn, { borderColor: theme.border }]}
          >
            <Ionicons name="camera-reverse-outline" size={18} color={theme.textMain} />
            <Text
              style={{
                color: theme.textMain,
                fontSize: ms(15, 0.3),
                fontWeight: "600",
              }}
            >
              {t.camera.retakeButton}
            </Text>
          </PressableDark>
          <PressableDark
            onPress={onSend}
            style={[styles.button, styles.sendBtn, { backgroundColor: theme.primary }]}
          >
            <Ionicons name="paper-plane" size={16} color={theme.textOnPrimary} />
            <Text
              style={{
                color: theme.textOnPrimary,
                fontSize: ms(15, 0.3),
                fontWeight: "700",
              }}
            >
              {t.camera.sendButton}
            </Text>
          </PressableDark>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#000" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: s(200) },
  topBar: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
    overflow: "hidden",
  },
  folderChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    maxWidth: "75%",
  },
  folderChipText: { fontSize: 12, fontWeight: "700" },
  actionCard: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: vs(16),
    paddingHorizontal: s(16),
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingBottom: vs(14),
    marginBottom: vs(12),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.10)",
  },
  ringWrap: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  ringPct: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: -0.3,
    fontVariant: ["tabular-nums"],
  },
  buttonRow: { flexDirection: "row", gap: 10 },
  button: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
    overflow: "hidden",
  },
  retakeBtn: { borderWidth: 1, backgroundColor: "transparent" },
  sendBtn: {},
});
