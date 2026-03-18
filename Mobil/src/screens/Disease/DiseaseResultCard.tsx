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
        color: "#22c55e",
        icon: "checkmark-circle-outline",
      };
    case "FAILED":
      return {
        text: t.disease.statusFailed,
        color: "#ef4444",
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
  const statusInfo = getStatusInfo(detection.status, t);

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
      style={{
        backgroundColor: theme.surface,
        borderRadius: spacing.md,
        padding: spacing.md,
        marginBottom: spacing.md,
        borderWidth: 1,
        borderColor: theme.accent + "20",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
      }}
    >
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <View
          style={{
            width: 80,
            height: 80,
            borderRadius: spacing.sm,
            backgroundColor: theme.background,
            overflow: "hidden",
            justifyContent: "center",
            alignItems: "center",
          }}
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

        <View style={{ flex: 1 }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: spacing.xs,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.xs,
              }}
            >
              <Ionicons
                name={statusInfo.icon as any}
                size={16}
                color={statusInfo.color}
              />
              <Text
                style={{
                  color: statusInfo.color,
                  fontSize: 12,
                  fontWeight: "600",
                }}
              >
                {statusInfo.text}
              </Text>
            </View>
            <Text style={{ color: theme.textSecondary, fontSize: 11 }}>
              {formatDate(detection.uploaded_at, t, language)}
            </Text>
          </View>

          {detection.status === "PROCESSING" && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.sm,
                marginBottom: spacing.xs,
              }}
            >
              <ActivityIndicator size="small" color={theme.accent} />
              <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                {t.disease.analyzingLeaf}
              </Text>
            </View>
          )}

          {detection.status === "COMPLETED" && detection.detected_disease && (
            <View>
              <Text
                style={{
                  color: theme.text,
                  fontSize: 15,
                  fontWeight: "700",
                  marginBottom: spacing.xs,
                }}
              >
                {detection.detected_disease}
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.xs,
                  marginBottom: spacing.xs,
                }}
              >
                <View
                  style={{
                    backgroundColor: theme.accent + "20",
                    paddingHorizontal: spacing.sm,
                    paddingVertical: 3,
                    borderRadius: 4,
                  }}
                >
                  <Text
                    style={{
                      color: theme.accent,
                      fontSize: 11,
                      fontWeight: "600",
                    }}
                  >
                    {confidencePct != null ? confidencePct.toFixed(1) : "--"}%{" "}
                    {t.disease.confidence}
                  </Text>
                </View>
              </View>

              {detection.all_predictions &&
                Object.keys(detection.all_predictions).length > 1 && (
                  <View style={{ marginTop: spacing.xs }}>
                    <Text
                      style={{
                        color: theme.textSecondary,
                        fontSize: 11,
                        fontWeight: "600",
                        marginBottom: 2,
                      }}
                    >
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
                            style={{
                              color: theme.textSecondary,
                              fontSize: 11,
                            }}
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
            <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
              {detection.error_message || t.disease.analysisFailed}
            </Text>
          )}

          {detection.status === "NOT_STARTED" && (
            <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
              {t.disease.waitingInQueue}
            </Text>
          )}
        </View>

        {onDelete && (
          <TouchableOpacity
            onPress={onDelete}
            style={{
              padding: spacing.xs,
              alignSelf: "flex-start",
            }}
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
