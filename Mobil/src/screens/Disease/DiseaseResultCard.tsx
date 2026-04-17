// Hastalik sonuc karti - tespit durumu ve onerileri gosterir
// Props: detection (tespit verisi), theme, imageUrl, onPress, onDelete

import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Theme } from "../../utils/theme";
import { DiseaseDetection, DetectionStatus } from "../../utils/api";
import { spacing } from "../../utils/responsive";
import { useLanguage } from "../../context/LanguageContext";

interface DiseaseResultCardProps {
  detection: DiseaseDetection;
  theme: Theme;
  imageUrl?: string;
  onPress?: () => void;
  onDelete?: () => void;
}

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
        color: "#94a3b8",
        icon: "time-outline",
      };
    case "PROCESSING":
      return {
        text: t.disease.statusProcessing,
        color: "#3b82f6",
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
const formatDate = (isoDate: string, t: any, language: string): string => {
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

  // Normalize confidence: backend may return 0-1 float or 0-100, and may use
  // either the "confidence" field or the "confidence_score" field.
  const rawConfidence = detection.confidence ?? detection.confidence_score;
  const confidencePct =
    rawConfidence != null
      ? rawConfidence <= 1
        ? rawConfidence * 100
        : rawConfidence
      : null;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className="surface-bg rounded-2xl p-4 mb-4"
      style={{
        borderWidth: 1,
        borderColor: theme.primary + "20",
        shadowColor: theme.shadowColor,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
      }}
    >
      <View className="flex-row" style={{ gap: spacing.md }}>
        <View
          className="rounded-lg bg-porcelain dark:bg-carbonBlack overflow-hidden center"
          style={{ width: 80, height: 80 }}
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
              size={32}
              color={theme.textSecondary}
            />
          )}
        </View>

        <View className="flex-1">
          <View className="flex-row justify-between items-center mb-1">
            <View className="row" style={{ gap: spacing.xs }}>
              <Ionicons
                name={statusInfo.icon as any}
                size={16}
                color={statusInfo.color}
              />
              <Text
                style={{ color: statusInfo.color }}
                className="text-xs font-semibold"
              >
                {statusInfo.text}
              </Text>
            </View>
            <Text className="text-secondary text-[11px]">
              {formatDate(detection.uploaded_at, t, language)}
            </Text>
          </View>

          {detection.status === "PROCESSING" && (
            <View
              className="row mb-1"
              style={{ gap: spacing.sm }}
            >
              <ActivityIndicator size="small" color={theme.primary} />
              <Text className="text-secondary text-xs">
                {t.disease.analyzingLeaf}
              </Text>
            </View>
          )}

          {detection.status === "COMPLETED" && detection.detected_disease && (
            <View>
              <Text className="text-primary text-[15px] font-bold mb-1">
                {detection.detected_disease}
              </Text>
              <View
                className="row mb-1"
                style={{ gap: spacing.xs }}
              >
                <View
                  className="rounded px-2 py-0.5"
                  style={{ backgroundColor: theme.primary + "20" }}
                >
                  <Text
                    className="text-[11px] font-semibold"
                    style={{ color: theme.primary }}
                  >
                    {confidencePct != null ? confidencePct.toFixed(1) : "--"}%{" "}
                    {t.disease.confidence}
                  </Text>
                </View>
              </View>

              {detection.all_predictions &&
                Object.keys(detection.all_predictions).length > 1 && (
                  <View className="mt-1">
                    <Text className="text-secondary text-[11px] font-semibold mb-0.5">
                      {t.disease.allPredictions}
                    </Text>
                    {Object.entries(detection.all_predictions)
                      .sort(([, a], [, b]) => b - a)
                      .slice(0, 4)
                      .map(([label, score]) => {
                        const scorePct = score <= 1 ? score * 100 : score;
                        return (
                          <Text
                            key={label}
                            className="text-secondary text-[11px]"
                          >
                            {label}: {scorePct.toFixed(1)}%
                          </Text>
                        );
                      })}
                  </View>
                )}
            </View>
          )}

          {detection.status === "FAILED" && (
            <Text className="text-secondary text-xs">
              {detection.error_message || t.disease.analysisFailed}
            </Text>
          )}

          {detection.status === "NOT_STARTED" && (
            <Text className="text-secondary text-xs">
              {t.disease.waitingInQueue}
            </Text>
          )}
        </View>

        {onDelete && (
          <TouchableOpacity
            onPress={onDelete}
            className="self-start"
            style={{ padding: spacing.xs }}
          >
            <Ionicons
              name="trash-outline"
              size={18}
              color={theme.textSecondary}
            />
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
};
