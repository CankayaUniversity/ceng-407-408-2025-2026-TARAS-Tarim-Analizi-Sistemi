// Canli tarama sonuc katmani — cam pill, kamera önizlemesi üzerinde
// Daha sade API: dil + metinler iceride çözülür

import { memo, useEffect, useRef } from "react";
import { View, Text, Animated, ActivityIndicator, StyleSheet } from "react-native";
import { BlurView } from "expo-blur";
import { Theme } from "../../utils/theme";
import type { LocalInferenceResult } from "../../utils/diseaseInference";
import { useLanguage } from "../../context/LanguageContext";
import { s, vs, ms } from "../../utils/responsive";

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

interface LiveScanOverlayProps {
  result: LocalInferenceResult | null;
  modelLoading: boolean;
  theme: Theme;
  bottomOffset: number;
}

const LiveScanOverlayBase = ({ result, modelLoading, theme, bottomOffset }: LiveScanOverlayProps) => {
  const { t, language } = useLanguage();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Tek seferlik fade-in — her sonuc guncellemesinde animasyon zamanlamasi tetiklenmesin
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 140,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const isHealthy = result?.className === "healthy";
  const isDisease = result?.status === "confident" && !isHealthy;
  const isAmber = result?.status === "dark" || result?.status === "overexposed" || result?.status === "uncertain";
  const statusColor = modelLoading
    ? theme.textSecondary
    : isAmber
      ? "#F59E0B"
      : isHealthy
        ? (theme.success ?? "#22C55E")
        : isDisease
          ? (theme.danger ?? theme.primary)
          : theme.textSecondary;

  const label = (() => {
    if (modelLoading) return t.camera.liveScanLoading;
    if (!result) return t.camera.liveScanLoading;
    if (result.status === "dark" || result.status === "overexposed") return t.camera.liveScanAdjustLight;
    if (result.status === "uncertain") return t.camera.liveScanUncertain;
    const entry = result.className ? CLASS_LABELS[result.className] : null;
    if (!entry) return t.camera.liveScanUncertain;
    return language === "tr" ? entry.tr : entry.en;
  })();

  const confidence = result?.status === "confident" ? (result.confidence ?? 0) : 0;
  const confPct = Math.round(confidence * 100);
  const showBar = result?.status === "confident" && confidence > 0;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.container,
        { bottom: bottomOffset, opacity: fadeAnim },
      ]}
    >
      <BlurView
        intensity={40}
        tint="dark"
        style={[styles.pill, { borderColor: theme.primary + "35" }]}
      >
        {modelLoading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <View style={[styles.ring, { borderColor: statusColor }]} />
        )}

        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[styles.label, { color: "#fff" }]} numberOfLines={1}>
            {label}
          </Text>
          {showBar && (
            <View style={styles.barRow}>
              <View style={styles.barBg}>
                <View
                  style={{
                    height: "100%",
                    width: `${confPct}%`,
                    backgroundColor: statusColor,
                    borderRadius: 2,
                  }}
                />
              </View>
              <Text style={styles.barPct}>{confPct}%</Text>
            </View>
          )}
        </View>
      </BlurView>
    </Animated.View>
  );
};

export const LiveScanOverlay = memo(LiveScanOverlayBase);

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    alignSelf: "center",
    width: "88%",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: s(14),
    paddingVertical: vs(10),
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
  },
  ring: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 4,
    backgroundColor: "transparent",
  },
  label: { fontSize: ms(14, 0.3), fontWeight: "600" },
  barRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  barBg: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    overflow: "hidden",
  },
  barPct: {
    color: "rgba(255,255,255,0.9)",
    fontSize: ms(11, 0.3),
    fontWeight: "700",
    minWidth: 32,
    textAlign: "right",
  },
});
