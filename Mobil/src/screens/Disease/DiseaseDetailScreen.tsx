// Native stack screen — disease detection detail.
// Receives detection + imageUrl via route.params. Header is the native stack
// header (configured in DiseaseStack). Delete fires the API directly, then
// navigates back; the list refreshes via useFocusEffect.

import { useState, useCallback } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Theme } from "../../utils/theme";
import { diseaseAPI } from "../../utils/api";
import {
  getConfidenceTier,
  FeedbackRating,
} from "./DiseaseResultCard";
import { useLanguage } from "../../context/LanguageContext";
import { usePopupMessage } from "../../context/PopupMessageContext";
import { useTheme } from "../../context/ThemeContext";
import { getDiseaseTargetLabel, detectedDiseaseToTarget } from "../../utils/diseaseTargetLabels";
import { spacing, s } from "../../utils/responsive";
import { CompactStackHeader } from "../../components/CompactStackHeader";
import type { DiseaseDetailScreenProps } from "./DiseaseStack";

export const DiseaseDetailScreen = ({ route, navigation }: DiseaseDetailScreenProps) => {
  const { detection, imageUrl } = route.params;
  const { theme } = useTheme();
  const { t, language } = useLanguage();
  const { showPopup } = usePopupMessage();
  const [heroAspect, setHeroAspect] = useState<number | null>(null);

  const confirmDelete = useCallback(() => {
    Alert.alert(
      t.disease.deleteTitle,
      t.disease.deleteConfirmation,
      [
        { text: t.common.cancel, style: "cancel" },
        {
          text: t.common.delete,
          style: "destructive",
          onPress: async () => {
            const res = await diseaseAPI.deleteDetection(detection.detection_id);
            if (res.success) {
              showPopup(t.disease.deletedSuccessfully);
              navigation.goBack();
            } else {
              showPopup(res.error ?? t.disease.errorDeleting);
            }
          },
        },
      ],
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detection.detection_id, t, showPopup, navigation]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <CompactStackHeader
        title={t.disease.detailTitle}
        rightAction={{
          icon: "trash-outline",
          onPress: confirmDelete,
          accessibilityLabel: "delete",
        }}
      />
      <DetailBody
        detection={detection}
        imageUrl={imageUrl}
        theme={theme}
        t={t}
        language={language}
        heroAspect={heroAspect}
        setHeroAspect={setHeroAspect}
      />
    </View>
  );
};

interface DetailBodyProps {
  detection: DiseaseDetailScreenProps["route"]["params"]["detection"];
  imageUrl?: string;
  theme: Theme;
  t: any;
  language: string;
  heroAspect: number | null;
  setHeroAspect: (v: number) => void;
}

const DetailBody = ({ detection, imageUrl, theme, t, language, heroAspect, setHeroAspect }: DetailBodyProps) => {
  const rawConf = detection.confidence_score ?? detection.confidence;
  const confidencePct =
    rawConf != null ? (rawConf <= 1 ? rawConf * 100 : rawConf) : null;

  const isUncertain =
    detection.confidence_status === "uncertain" ||
    detection.detected_disease === "UNCERTAIN";

  const topTier = confidencePct != null ? getConfidenceTier(confidencePct, theme) : null;

  // Compute hero size so the page contents fit within the screen without
  // scrolling. The image keeps its aspectRatio (clamped >= 1 so portrait
  // crops to square), but on tall content we shrink the square below full
  // width to reserve space for the predictions/recommendations/feedback
  // cards below.
  const { width: winW, height: winH } = useWindowDimensions();
  const aspect = Math.max(heroAspect ?? 1, 1);
  const availableW = winW - spacing.md * 2;
  // Estimate the room the rest of the body needs (status row + cards). ~42%
  // of screen height for the image is a safe ceiling on phones.
  const maxImageH = winH * 0.42;
  const widthFromMaxH = maxImageH * aspect;
  const heroW = Math.min(availableW, widthFromMaxH);
  const heroH = heroW / aspect;

  return (
    <ScrollView
      contentContainerStyle={{
        paddingHorizontal: spacing.md,
        paddingTop: 0,
        paddingBottom: spacing.xl,
        gap: spacing.sm,
      }}
      style={{ flex: 1, backgroundColor: theme.background }}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero box. Aspect-ratio clamped to >= 1 (never narrower than square);
          portrait photos center-crop to square via resizeMode="cover". The
          square then shrinks below full width on shorter screens so the rest
          of the body content stays visible without scrolling. */}
      <View
        style={{
          width: heroW,
          height: heroH,
          alignSelf: "center",
          borderRadius: 10,
          overflow: "hidden",
          backgroundColor: theme.border + "30",
        }}
      >
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={{ width: "100%", height: "100%" }}
            resizeMode="cover"
            onLoad={(e) => {
              const src = e.nativeEvent.source;
              if (src && src.width > 0 && src.height > 0) {
                setHeroAspect(src.width / src.height);
              }
            }}
          />
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="leaf-outline" size={40} color={theme.textSecondary} />
          </View>
        )}
      </View>

      {detection.status === "PROCESSING" && (
        <View className="row" style={{ gap: spacing.sm, justifyContent: "center" }}>
          <ActivityIndicator size="small" color={theme.primary} />
          <Text className="text-secondary text-sm">{t.disease.analyzingLeaf}</Text>
        </View>
      )}

      {(detection.status === "NOT_STARTED" || detection.status === "QUEUED") && (
        <Text className="text-secondary text-sm text-center">{t.disease.waitingInQueue}</Text>
      )}

      {detection.status === "FAILED" && (
        <View
          className="rounded-lg"
          style={{
            padding: spacing.sm,
            backgroundColor: theme.danger + "20",
            borderLeftWidth: 3,
            borderLeftColor: theme.danger,
          }}
        >
          <Text style={{ color: theme.danger, fontWeight: "700" }}>
            {t.disease.statusFailed}
          </Text>
          <Text className="text-secondary text-xs mt-0.5">
            {detection.error_message || t.disease.analysisFailed}
          </Text>
        </View>
      )}

      {detection.status === "COMPLETED" && (
        isUncertain ? (
          <View
            className="rounded-lg"
            style={{
              padding: spacing.sm,
              backgroundColor: theme.warning + "20",
              borderLeftWidth: 3,
              borderLeftColor: theme.warning,
            }}
          >
            <View className="row" style={{ gap: spacing.xs }}>
              <Ionicons name="warning-outline" size={16} color={theme.warning} />
              <Text style={{ color: theme.warning, fontWeight: "700", fontSize: 14 }}>
                {t.disease.uncertainTitle}
              </Text>
            </View>
            <Text className="text-secondary text-xs mt-0.5">
              {detection.message_tr ?? t.disease.uncertainMessage}
            </Text>
            {detection.top_guess ? (
              <Text className="text-secondary text-xs mt-0.5 italic">
                {t.disease.uncertainPossibleGuess}: {detection.top_guess}
                {confidencePct != null ? ` (${confidencePct.toFixed(1)}%)` : ""}
              </Text>
            ) : null}
          </View>
        ) : (
          <View className="flex-row items-center" style={{ gap: spacing.sm }}>
            <Text
              className="text-primary"
              style={{ flex: 1, fontSize: 22, fontWeight: "700" }}
            >
              {getDiseaseTargetLabel(detection.detected_disease!, language as "tr" | "en")}
            </Text>
            {confidencePct != null && topTier && (
              <View
                className="rounded px-2 py-1"
                style={{ backgroundColor: topTier.soft }}
              >
                <Text style={{ color: topTier.color, fontSize: 13, fontWeight: "700" }}>
                  {confidencePct.toFixed(1)}%
                </Text>
              </View>
            )}
          </View>
        )
      )}

      {detection.status === "COMPLETED" &&
        detection.all_predictions &&
        Object.keys(detection.all_predictions).length > 0 && (
          <View className="surface-bg rounded-lg" style={{ padding: spacing.sm }}>
            {Object.entries(detection.all_predictions)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 5)
              .map(([label, score], idx) => {
                const pct = score <= 1 ? score * 100 : score;
                const rowTier = getConfidenceTier(pct, theme);
                const isTop = idx === 0;
                // Lambda emits lowercase keys (e.g. "bacterial_spot"). Convert
                // to DiseaseTarget enum then to the active language label.
                const target = detectedDiseaseToTarget(label);
                const displayLabel = target
                  ? getDiseaseTargetLabel(target, language as "tr" | "en")
                  : label;
                return (
                  <View key={label} style={{ marginBottom: idx === 4 ? 0 : 4 }}>
                    <View className="flex-row items-center" style={{ gap: spacing.xs, marginBottom: 1 }}>
                      <Text
                        className="text-primary text-[11px] flex-1"
                        style={{ fontWeight: isTop ? "700" : "500" }}
                        numberOfLines={1}
                      >
                        {displayLabel}
                      </Text>
                      <Text
                        className="text-[11px]"
                        style={{
                          color: rowTier.color,
                          fontWeight: isTop ? "700" : "600",
                          minWidth: s(46),
                          textAlign: "right",
                        }}
                      >
                        {pct.toFixed(1)}%
                      </Text>
                    </View>
                    <View style={{ height: 2, borderRadius: 1, backgroundColor: rowTier.soft, overflow: "hidden" }}>
                      <View
                        style={{
                          height: "100%",
                          width: `${Math.min(100, Math.max(0, pct))}%`,
                          backgroundColor: rowTier.color,
                          borderRadius: 1,
                        }}
                      />
                    </View>
                  </View>
                );
              })}
          </View>
        )}

      {(() => {
        if (detection.status !== "COMPLETED" || !detection.recommendations) return null;
        const recs =
          (language === "tr" ? detection.recommendations.tr : detection.recommendations.en) ?? [];
        if (recs.length === 0) return null;
        return (
          <View className="surface-bg rounded-lg" style={{ padding: spacing.sm }}>
            <Text className="text-secondary text-[11px] font-semibold mb-1">
              {t.disease.detailRecommendations}
            </Text>
            {recs.map((rec, i) => (
              <Text key={i} className="text-primary text-xs mb-0.5">
                • {rec}
              </Text>
            ))}
          </View>
        );
      })()}

      {detection.status === "COMPLETED" && (
        <View className="surface-bg rounded-lg" style={{ padding: spacing.sm }}>
          <FeedbackRating
            detectionId={detection.detection_id}
            initialFeedback={detection.user_feedback}
            initialCorrection={detection.user_correction}
            theme={theme}
            t={t}
          />
        </View>
      )}
    </ScrollView>
  );
};
