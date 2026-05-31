// Folder list card — disease tracking folders icin tek satir
// Gosterir: ad, crop · zone alt-baslik, target disease etiketi, son aktivite
// + en yeni 4 detection icin minik thumbnail seridi

import { memo } from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Theme } from "../../utils/theme";
import { useLanguage } from "../../context/LanguageContext";
import { ms } from "../../utils/responsive";
import {
  DISEASE_TARGET_LABELS,
} from "../../utils/diseaseTargetLabels";
import { formatDate } from "./DiseaseResultCard";
import type { DiseaseTrackingFolder } from "../../utils/api";

const THUMB_SIZE = 48;
const THUMB_GAP = 3;

interface FolderCardProps {
  folder: DiseaseTrackingFolder;
  theme: Theme;
  onPress: () => void;
  /** Map of detection_id -> cached local file URI (file://...). When provided,
   *  thumbnails render from the stable local cache so a re-fetch (which
   *  changes signed S3 URL query params) doesn't trigger a re-download. */
  imageUrls?: Record<string, string>;
}

const FolderCardBase = ({ folder, theme, onPress, imageUrls }: FolderCardProps) => {
  const { language, t } = useLanguage();

  const cropName = folder.planting.cropName ?? "—";
  const zoneName = folder.planting.zoneName ?? "—";
  const targetLabel = DISEASE_TARGET_LABELS[folder.targetDisease];
  const targetText = language === "tr" ? targetLabel.tr : targetLabel.en;
  const isUncertain = folder.targetDisease === "UNCERTAIN";
  const isHealthy = folder.targetDisease === "HEALTHY";

  const totalDetections = folder.detections.length;
  const showDots = totalDetections > 4;
  const thumbs = folder.detections.slice(0, showDots ? 3 : 4);

  const lastActivity = folder.lastDetectionAt ?? folder.updatedAt;
  const relTime = lastActivity ? formatDate(lastActivity, t, language) : null;

  // Status rengi: healthy = success, uncertain = textSecondary, hastalik = danger
  const statusDotColor = isUncertain
    ? theme.textSecondary
    : isHealthy
      ? theme.success
      : theme.danger;

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
      <View style={styles.body}>
        <View style={styles.leftSection}>
          <View>
            <Text
              style={[styles.name, { color: theme.textMain }]}
              numberOfLines={1}
            >
              {folder.name}
            </Text>
            <Text
              style={[styles.subtitle, { color: theme.textSecondary }]}
              numberOfLines={1}
            >
              {cropName} · {zoneName}
            </Text>
          </View>

          <View>
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
            </View>
            <View style={styles.metaRow}>
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
          </View>
        </View>

        {totalDetections > 0 && (
          <View style={styles.thumbGrid}>
            {thumbs.map((d) => (
              <View
                key={d.detection_id}
                style={[
                  styles.thumbBox,
                  { backgroundColor: theme.background, borderColor: theme.primary + "15" },
                ]}
              >
                {(() => {
                  // Prefer cached local file URI so signed-URL signature
                  // rotation on re-fetch doesn't blank the image.
                  const uri = imageUrls?.[d.detection_id] ?? d.imageUrl;
                  if (!uri) {
                    return (
                      <Ionicons
                        name="leaf-outline"
                        size={16}
                        color={theme.textSecondary}
                      />
                    );
                  }
                  return (
                    <Image
                      source={{ uri }}
                      style={styles.thumbImg}
                      resizeMode="cover"
                    />
                  );
                })()}
              </View>
            ))}
            {showDots && (
              <View
                style={[
                  styles.thumbBox,
                  { backgroundColor: theme.background, borderColor: theme.primary + "15" },
                ]}
              >
                <Ionicons
                  name="ellipsis-horizontal"
                  size={18}
                  color={theme.textSecondary}
                />
              </View>
            )}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

export const FolderCard = memo(FolderCardBase);

const styles = StyleSheet.create({
  card: {
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 6,
  },
  body: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
    minHeight: THUMB_SIZE * 2 + THUMB_GAP,
  },
  leftSection: {
    flex: 1,
    justifyContent: "space-between",
  },
  name: {
    fontSize: ms(15, 0.3),
    fontWeight: "700",
  },
  subtitle: {
    fontSize: ms(12, 0.3),
    marginTop: 1,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  dot: {
    width: 7,
    height: 7,
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
  thumbGrid: {
    width: THUMB_SIZE * 2 + THUMB_GAP,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: THUMB_GAP,
  },
  thumbBox: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 6,
    borderWidth: 1,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbImg: {
    width: "100%",
    height: "100%",
  },
});
