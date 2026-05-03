// Hastalik sonuc karti - tespit durumu ve onerileri gosterir

import { useState } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  ScrollView,
  Pressable,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Theme } from "../../utils/theme";
import {
  DiseaseDetection,
  DetectionStatus,
  UserFeedback,
  DiseaseCorrection,
  diseaseAPI,
} from "../../utils/api";
import { spacing } from "../../utils/responsive";
import { useLanguage } from "../../context/LanguageContext";

interface DiseaseResultCardProps {
  detection: DiseaseDetection;
  theme: Theme;
  imageUrl?: string;
  onPress?: () => void;
  onDelete?: () => void;
}

// 5'li puan olcegi — soldan saga: kesinlikle yanlis ... kesinlikle dogru
const FEEDBACK_SCALE: ReadonlyArray<{
  value: UserFeedback;
  icon: string;
  color: (theme: Theme) => string;
  labelKey:
    | "feedbackDefinitelyWrong"
    | "feedbackLikelyWrong"
    | "feedbackUnsure"
    | "feedbackLikelyCorrect"
    | "feedbackDefinitelyCorrect";
}> = [
  {
    value: "DEFINITELY_WRONG",
    icon: "close-circle",
    color: (theme) => theme.danger,
    labelKey: "feedbackDefinitelyWrong",
  },
  {
    value: "LIKELY_WRONG",
    icon: "close-circle-outline",
    color: (theme) => theme.danger,
    labelKey: "feedbackLikelyWrong",
  },
  {
    value: "UNSURE",
    icon: "help-circle-outline",
    color: (theme) => theme.textSecondary,
    labelKey: "feedbackUnsure",
  },
  {
    value: "LIKELY_CORRECT",
    icon: "checkmark-circle-outline",
    color: (theme) => theme.success,
    labelKey: "feedbackLikelyCorrect",
  },
  {
    value: "DEFINITELY_CORRECT",
    icon: "checkmark-circle",
    color: (theme) => theme.success,
    labelKey: "feedbackDefinitelyCorrect",
  },
];

// "Definitely wrong" sonrasi gosterilen duzeltme dropdown'u — gercek hastalik
// Sirayla: tum hastalik siniflari, sonra "Bilmiyorum" (UNCERTAIN) + "Diger"
const CORRECTION_LABEL_KEYS = {
  UNCERTAIN: "correctionDontKnow",
  BACTERIAL_SPOT: "correctionBacterialSpot",
  CORN_COMMON_RUST: "correctionCornCommonRust",
  CORN_GRAY_LEAF_SPOT: "correctionCornGrayLeafSpot",
  CORN_NORTHERN_LEAF_BLIGHT: "correctionCornNorthernLeafBlight",
  EARLY_BLIGHT: "correctionEarlyBlight",
  HEALTHY: "correctionHealthy",
  LATE_BLIGHT: "correctionLateBlight",
  LEAF_MOLD: "correctionLeafMold",
  MOSAIC_VIRUS: "correctionMosaicVirus",
  POWDERY_MILDEW: "correctionPowderyMildew",
  SEPTORIA_LEAF_SPOT: "correctionSeptoriaLeafSpot",
  SPIDER_MITES: "correctionSpiderMites",
  TARGET_SPOT: "correctionTargetSpot",
  YELLOW_LEAF_CURL_VIRUS: "correctionYellowLeafCurlVirus",
  OTHER: "correctionOther",
} as const;

const CORRECTION_OPTIONS: ReadonlyArray<{
  value: DiseaseCorrection;
  labelKey: keyof typeof CORRECTION_LABEL_KEYS;
}> = [
  { value: "BACTERIAL_SPOT", labelKey: "BACTERIAL_SPOT" },
  { value: "CORN_COMMON_RUST", labelKey: "CORN_COMMON_RUST" },
  { value: "CORN_GRAY_LEAF_SPOT", labelKey: "CORN_GRAY_LEAF_SPOT" },
  { value: "CORN_NORTHERN_LEAF_BLIGHT", labelKey: "CORN_NORTHERN_LEAF_BLIGHT" },
  { value: "EARLY_BLIGHT", labelKey: "EARLY_BLIGHT" },
  { value: "HEALTHY", labelKey: "HEALTHY" },
  { value: "LATE_BLIGHT", labelKey: "LATE_BLIGHT" },
  { value: "LEAF_MOLD", labelKey: "LEAF_MOLD" },
  { value: "MOSAIC_VIRUS", labelKey: "MOSAIC_VIRUS" },
  { value: "POWDERY_MILDEW", labelKey: "POWDERY_MILDEW" },
  { value: "SEPTORIA_LEAF_SPOT", labelKey: "SEPTORIA_LEAF_SPOT" },
  { value: "SPIDER_MITES", labelKey: "SPIDER_MITES" },
  { value: "TARGET_SPOT", labelKey: "TARGET_SPOT" },
  { value: "YELLOW_LEAF_CURL_VIRUS", labelKey: "YELLOW_LEAF_CURL_VIRUS" },
  { value: "UNCERTAIN", labelKey: "UNCERTAIN" },
  { value: "OTHER", labelKey: "OTHER" },
];

export type ConfidenceTone = "high" | "moderate" | "low";
export interface ConfidenceTier {
  tone: ConfidenceTone;
  color: string;
  soft: string;
}
export const getConfidenceTier = (pct: number, theme: Theme): ConfidenceTier => {
  if (pct >= 85) return { tone: "high", color: theme.success, soft: theme.success + "20" };
  if (pct >= 70) return { tone: "moderate", color: theme.warning, soft: theme.warning + "20" };
  return { tone: "low", color: theme.textSecondary, soft: theme.textSecondary + "15" };
};

interface FeedbackRatingProps {
  detectionId: string;
  initialFeedback: UserFeedback | null | undefined;
  initialCorrection: DiseaseCorrection | null | undefined;
  theme: Theme;
  t: any;
}

export const FeedbackRating = ({
  detectionId,
  initialFeedback,
  initialCorrection,
  theme,
  t,
}: FeedbackRatingProps) => {
  const [selected, setSelected] = useState<UserFeedback | null>(
    initialFeedback ?? null,
  );
  const [correction, setCorrection] = useState<DiseaseCorrection | null>(
    initialCorrection ?? null,
  );
  const [submitting, setSubmitting] = useState<UserFeedback | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const submit = async (
    rating: UserFeedback,
    correctionValue: DiseaseCorrection | null,
  ) => {
    setSubmitting(rating);
    setErrorMsg(null);
    const res = await diseaseAPI.submitFeedback(
      detectionId,
      rating,
      correctionValue,
    );
    setSubmitting(null);
    return res.success;
  };

  const handleSelect = async (value: UserFeedback) => {
    if (submitting) return;

    if (value === "DEFINITELY_WRONG") {
      // Once secimi gor, sonra picker'i ac — kayit picker'da yapilacak
      setSelected(value);
      setPickerOpen(true);
      return;
    }

    const previous = { feedback: selected, correction };
    setSelected(value);
    setCorrection(null);

    const ok = await submit(value, null);
    if (!ok) {
      setSelected(previous.feedback);
      setCorrection(previous.correction);
      setErrorMsg(t.disease.feedbackError);
    }
  };

  const handleCorrectionPick = async (value: DiseaseCorrection) => {
    if (submitting) return;
    const previous = { feedback: selected, correction };
    setCorrection(value);
    setPickerOpen(false);

    const ok = await submit("DEFINITELY_WRONG", value);
    if (!ok) {
      setSelected(previous.feedback);
      setCorrection(previous.correction);
      setErrorMsg(t.disease.feedbackError);
    }
  };

  const handlePickerClose = () => {
    if (submitting) return;
    setPickerOpen(false);
    // Picker kapatildiginda secim onaylanmadiysa, daha onceki durumu geri yukle
    if (selected === "DEFINITELY_WRONG" && !correction) {
      setSelected(initialFeedback ?? null);
    }
  };

  const selectedLabel = selected
    ? t.disease[FEEDBACK_SCALE.find((s) => s.value === selected)!.labelKey]
    : null;

  const correctionLabel = correction
    ? t.disease[CORRECTION_LABEL_KEYS[correction]]
    : null;

  return (
    <View>
      <Text
        className="text-secondary text-[11px]"
        style={{ marginBottom: spacing.xs }}
      >
        {t.disease.feedbackPrompt}
      </Text>
      <View
        className="row"
        style={{ gap: spacing.xs, justifyContent: "space-between" }}
      >
        {FEEDBACK_SCALE.map((item) => {
          const isSelected = selected === item.value;
          const isLoading = submitting === item.value;
          const tint = item.color(theme);
          return (
            <TouchableOpacity
              key={item.value}
              onPress={() => handleSelect(item.value)}
              disabled={!!submitting}
              activeOpacity={0.6}
              style={{
                flex: 1,
                alignItems: "center",
                paddingVertical: spacing.xs,
                borderRadius: 8,
                backgroundColor: isSelected ? tint + "20" : "transparent",
                borderWidth: 1,
                borderColor: isSelected ? tint : theme.border,
              }}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={tint} />
              ) : (
                <Ionicons
                  name={item.icon as any}
                  size={22}
                  color={isSelected ? tint : theme.textSecondary}
                />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
      {selectedLabel && (
        <Text
          className="text-secondary text-[11px] text-center"
          style={{ marginTop: spacing.xs }}
        >
          {selectedLabel}
        </Text>
      )}

      {selected === "DEFINITELY_WRONG" && correctionLabel && (
        <TouchableOpacity
          onPress={() => setPickerOpen(true)}
          disabled={!!submitting}
          activeOpacity={0.6}
          style={{
            marginTop: spacing.xs,
            paddingVertical: spacing.xs,
            paddingHorizontal: spacing.sm,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: theme.border,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text style={{ color: theme.textMain, fontSize: 12 }}>
            {correctionLabel}
          </Text>
          <Ionicons
            name="chevron-down"
            size={16}
            color={theme.textSecondary}
          />
        </TouchableOpacity>
      )}

      {errorMsg && (
        <Text
          className="text-[11px] text-center"
          style={{ marginTop: spacing.xs, color: theme.danger }}
        >
          {errorMsg}
        </Text>
      )}

      <Modal
        visible={pickerOpen}
        transparent
        animationType="fade"
        onRequestClose={handlePickerClose}
      >
        <Pressable
          onPress={handlePickerClose}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.45)",
            justifyContent: "center",
            paddingHorizontal: spacing.lg,
          }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: theme.surface,
              borderRadius: 14,
              maxHeight: "75%",
              overflow: "hidden",
            }}
          >
            <View
              style={{
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                borderBottomWidth: 1,
                borderBottomColor: theme.border,
              }}
            >
              <Text
                style={{
                  color: theme.textMain,
                  fontSize: 14,
                  fontWeight: "600",
                }}
              >
                {t.disease.correctionPickerTitle}
              </Text>
              <Text
                className="text-secondary text-[11px]"
                style={{ marginTop: 2 }}
              >
                {t.disease.correctionPrompt}
              </Text>
            </View>
            <ScrollView>
              {CORRECTION_OPTIONS.map((opt) => {
                const isActive = correction === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    onPress={() => handleCorrectionPick(opt.value)}
                    disabled={!!submitting}
                    activeOpacity={0.6}
                    style={{
                      paddingHorizontal: spacing.md,
                      paddingVertical: spacing.sm,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      backgroundColor: isActive
                        ? theme.primary + "15"
                        : "transparent",
                    }}
                  >
                    <Text
                      style={{
                        color: theme.textMain,
                        fontSize: 13,
                      }}
                    >
                      {t.disease[CORRECTION_LABEL_KEYS[opt.value]]}
                    </Text>
                    {isActive && (
                      <Ionicons
                        name="checkmark"
                        size={18}
                        color={theme.primary}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity
              onPress={handlePickerClose}
              disabled={!!submitting}
              activeOpacity={0.6}
              style={{
                paddingVertical: spacing.sm,
                alignItems: "center",
                borderTopWidth: 1,
                borderTopColor: theme.border,
              }}
            >
              <Text
                style={{ color: theme.textSecondary, fontSize: 13 }}
              >
                {t.disease.correctionCancel}
              </Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

// Durum bilgisi - renk ve ikon dondurur
const getStatusInfo = (
  status: DetectionStatus,
  t: any,
  theme: Theme,
): { text: string; color: string; icon: string } => {
  switch (status) {
    case "NOT_STARTED":
      return {
        text: t.disease.statusPending,
        color: theme.textMuted,
        icon: "time-outline",
      };
    case "PROCESSING":
      return {
        text: t.disease.statusProcessing,
        color: theme.info,
        icon: "sync-outline",
      };
    case "COMPLETED":
      return {
        text: t.disease.statusCompleted,
        color: theme.success,
        icon: "checkmark-circle-outline",
      };
    case "FAILED":
      return {
        text: t.disease.statusFailed,
        color: theme.danger,
        icon: "close-circle-outline",
      };
  }
};

// Tarih formatla - ne kadar once oldugunu gosterir
export const formatDate = (isoDate: string, t: any, language: string): string => {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return t.disease.justNow;
  if (diffMins < 60) return `${diffMins} ${t.disease.minutesAgo}`;
  if (diffHours < 24) return `${diffHours} ${t.disease.hoursAgo}`;
  if (diffDays === 1) return t.disease.yesterday;
  if (diffDays < 7) return `${diffDays} ${t.disease.daysAgo}`;

  return date.toLocaleDateString(language === "tr" ? "tr-TR" : "en-US", {
    day: "numeric",
    month: "short",
  });
};

export const DiseaseResultCard = ({
  detection,
  theme,
  imageUrl,
  onPress,
  onDelete,
}: DiseaseResultCardProps) => {
  const { t, language } = useLanguage();
  const statusInfo = getStatusInfo(detection.status, t, theme);

  // confidence_score oncelikli — backend'in otortatif alani; yoksa confidence'a dustur
  const rawConf = detection.confidence_score ?? detection.confidence;
  const confidencePct =
    rawConf != null
      ? rawConf <= 1
        ? rawConf * 100
        : rawConf
      : null;

  const isUncertain =
    detection.detected_disease != null &&
    (detection.confidence_status === "uncertain" ||
      detection.detected_disease === "Uncertain");

  const topTier =
    !isUncertain && confidencePct != null
      ? getConfidenceTier(confidencePct, theme)
      : null;

  let headline: React.ReactNode;
  if (detection.status === "COMPLETED" && detection.detected_disease) {
    headline = isUncertain ? (
      <View className="flex-row items-center" style={{ gap: 6 }}>
        <Ionicons name="warning-outline" size={15} color={theme.warning} />
        <Text
          className="font-bold"
          style={{ color: theme.warning, fontSize: 15, flex: 1 }}
          numberOfLines={1}
        >
          {t.disease.uncertainTitle}
        </Text>
      </View>
    ) : (
      <View>
        <Text
          className="text-primary font-bold"
          style={{ fontSize: 15 }}
          numberOfLines={1}
        >
          {detection.detected_disease}
        </Text>
        {topTier && confidencePct != null && (
          <View
            className="rounded self-start"
            style={{
              backgroundColor: topTier.soft,
              paddingHorizontal: 6,
              paddingVertical: 2,
              marginTop: 3,
            }}
          >
            <Text
              className="font-bold"
              style={{ color: topTier.color, fontSize: 12 }}
            >
              {confidencePct.toFixed(1)}%
            </Text>
          </View>
        )}
      </View>
    );
  } else {
    const headlineText =
      detection.status === "PROCESSING"
        ? t.disease.analyzingLeaf
        : detection.status === "FAILED"
          ? t.disease.statusFailed
          : t.disease.waitingInQueue;
    headline = (
      <View className="flex-row items-center" style={{ gap: 6 }}>
        <Ionicons
          name={statusInfo.icon as any}
          size={15}
          color={statusInfo.color}
        />
        <Text
          className="font-semibold"
          style={{ color: statusInfo.color, fontSize: 15, flex: 1 }}
          numberOfLines={1}
        >
          {headlineText}
        </Text>
        {detection.status === "PROCESSING" && (
          <ActivityIndicator size="small" color={theme.primary} />
        )}
      </View>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className="surface-bg rounded-xl"
      style={{
        padding: 10,
        marginBottom: 6,
        borderWidth: 1,
        borderColor: theme.primary + "20",
        shadowColor: theme.shadowColor,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
        elevation: 2,
      }}
    >
      <View className="flex-row" style={{ gap: 10 }}>
        <View
          className="rounded-lg bg-porcelain dark:bg-carbonBlack overflow-hidden center"
          style={{ width: 56, height: 56 }}
        >
          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              style={{ width: "100%", height: "100%" }}
              resizeMode="cover"
            />
          ) : (
            <Ionicons
              name="leaf-outline"
              size={22}
              color={theme.textSecondary}
            />
          )}
        </View>

        <View
          className="flex-1"
          style={{ minHeight: 56, justifyContent: "space-between" }}
        >
          {/* Top: headline + chip-below on left; trash floating top-right */}
          <View className="flex-row items-start" style={{ gap: 8 }}>
            <View className="flex-1">{headline}</View>
            {onDelete && (
              <TouchableOpacity onPress={onDelete} hitSlop={10} style={{ padding: 2 }}>
                <Ionicons name="trash-outline" size={14} color={theme.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          {/* Bottom: relative date pinned bottom-right */}
          <Text
            style={{
              alignSelf: "flex-end",
              color: theme.textSecondary,
              fontSize: 11,
            }}
          >
            {formatDate(detection.uploaded_at, t, language)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};
