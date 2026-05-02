// Folder list card — disease tracking folders icin tek satir
// Gosterir: ad, crop · zone alt-baslik, target disease etiketi, son aktivite
// + en yeni 4 detection icin minik thumbnail seridi

import { memo } from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Theme } from "../../utils/theme";
import { useLanguage } from "../../context/LanguageContext";
import { spacing, s, vs, ms } from "../../utils/responsive";
import {
  DISEASE_TARGET_LABELS,
} from "../../utils/diseaseTargetLabels";
import type { DiseaseTrackingFolder } from "../../utils/api";

const THUMB_COUNT = 4;
const THUMB_SIZE = 44;

interface FolderCardProps {
  folder: DiseaseTrackingFolder;
  theme: Theme;
  onPress: () => void;
}

const FolderCardBase = ({ folder, theme, onPress }: FolderCardProps) => {
  const { language, t } = useLanguage();

  const cropName = folder.planting.cropName ?? "—";
  const zoneName = folder.planting.zoneName ?? "—";
  const targetLabel = DISEASE_TARGET_LABELS[folder.targetDisease];
  const targetText = language === "tr" ? targetLabel.tr : targetLabel.en;
  const isUncertain = folder.targetDisease === "UNCERTAIN";
  const isHealthy = folder.targetDisease === "HEALTHY";

  const thumbs = folder.detections.slice(0, THUMB_COUNT);
  const moreCount = Math.max(0, folder.detections.length - THUMB_COUNT);
  const totalDetections = folder.detections.length;

  // Son aktivite zaman etiketi (relative)
  const lastActivity = folder.lastDetectionAt ?? folder.updatedAt;
  const relTime = formatRelative(lastActivity, language);

  // Status rengi: healthy = success, uncertain = textSecondary, hastalik = danger
  const statusDotColor = isUncertain
    ? theme.textSecondary
    : isHealthy
      ? (theme.success ?? "#22C55E")
      : (theme.danger ?? theme.primary);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: theme.primary + "20",
        },
      ]}
    >
      {/* Üst satir: name + chevron */}
      <View style={styles.headerRow}>
        <Text
          style={[styles.name, { color: theme.textMain }]}
          numberOfLines={1}
        >
          {folder.name}
        </Text>
        <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
      </View>

      {/* Alt-baslik: crop · zone */}
      <Text
        style={[styles.subtitle, { color: theme.textSecondary }]}
        numberOfLines={1}
      >
        {cropName} · {zoneName}
      </Text>

      {/* Status satiri: target disease · N photos · relative time */}
      <View style={styles.statusRow}>
        <View style={[styles.dot, { backgroundColor: statusDotColor }]} />
        <Text
          style={[
            styles.targetText,
            {
              color: isUncertain ? theme.textSecondary : theme.textMain,
              fontStyle: isUncertain ? "italic" : "normal",
            },
          ]}
          numberOfLines={1}
        >
          {targetText}
        </Text>
        <Text style={[styles.metaSep, { color: theme.textSecondary }]}>·</Text>
        <Text style={[styles.metaText, { color: theme.textSecondary }]}>
          {totalDetections} {totalDetections === 1 ? t.disease.folderPhotoSingular : t.disease.folderPhotoPlural}
        </Text>
        {relTime && (
          <>
            <Text style={[styles.metaSep, { color: theme.textSecondary }]}>·</Text>
            <Text style={[styles.metaText, { color: theme.textSecondary }]}>
              {relTime}
            </Text>
          </>
        )}
      </View>

      {/* Thumbnail seridi (varsa) */}
      {thumbs.length > 0 && (
        <View style={styles.thumbRow}>
          {thumbs.map((d) => (
            <View
              key={d.detection_id}
              style={[
                styles.thumbBox,
                { backgroundColor: theme.background, borderColor: theme.primary + "15" },
              ]}
            >
              {d.imageUrl ? (
                <Image
                  source={{ uri: d.imageUrl }}
                  style={styles.thumbImg}
                  resizeMode="cover"
                />
              ) : (
                <Ionicons name="leaf-outline" size={18} color={theme.textSecondary} />
              )}
            </View>
          ))}
          {moreCount > 0 && (
            <View
              style={[
                styles.thumbBox,
                styles.moreBox,
                { backgroundColor: theme.background, borderColor: theme.primary + "15" },
              ]}
            >
              <Text style={[styles.moreText, { color: theme.textSecondary }]}>
                +{moreCount}
              </Text>
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
};

export const FolderCard = memo(FolderCardBase);

// Basit relative time formatter (X minutes/hours/days ago)
function formatRelative(iso: string | null, language: "tr" | "en"): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  const diffMs = Date.now() - t;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (language === "tr") {
    if (diffSec < 60) return "şimdi";
    if (diffMin < 60) return `${diffMin}d önce`;
    if (diffHr < 24) return `${diffHr}sa önce`;
    if (diffDay < 30) return `${diffDay}g önce`;
    const mo = Math.floor(diffDay / 30);
    return `${mo}ay önce`;
  } else {
    if (diffSec < 60) return "now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDay < 30) return `${diffDay}d ago`;
    const mo = Math.floor(diffDay / 30);
    return `${mo}mo ago`;
  }
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  name: {
    flex: 1,
    fontSize: ms(15, 0.3),
    fontWeight: "700",
  },
  subtitle: {
    fontSize: ms(12, 0.3),
    marginTop: 2,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: vs(8),
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  targetText: {
    fontSize: ms(12, 0.3),
    fontWeight: "600",
    flexShrink: 1,
  },
  metaSep: {
    fontSize: ms(12, 0.3),
  },
  metaText: {
    fontSize: ms(11, 0.3),
  },
  thumbRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: vs(10),
  },
  thumbBox: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbImg: {
    width: "100%",
    height: "100%",
  },
  moreBox: {
    alignItems: "center",
    justifyContent: "center",
  },
  moreText: {
    fontSize: ms(11, 0.3),
    fontWeight: "700",
  },
});

void s;
