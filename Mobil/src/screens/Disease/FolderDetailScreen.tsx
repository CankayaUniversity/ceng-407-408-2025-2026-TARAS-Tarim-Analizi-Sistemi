// Klasor detay ekrani — full-screen modal olarak acilir
// Gosterir: header (ad + crop/zone), timeline (tum detection'lar), labeled FAB
// FAB klasor adini icerir — kullanici kafasinda soru kalmasin diye explicit

import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
  Alert,
  StyleSheet,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Theme } from "../../utils/theme";
import { useLanguage } from "../../context/LanguageContext";
import { usePopupMessage } from "../../context/PopupMessageContext";
import { spacing, s, vs, ms } from "../../utils/responsive";
import { diseaseAPI, type DiseaseTrackingFolderDetail, type FolderDetectionDetail } from "../../utils/api";
import { DISEASE_TARGET_LABELS } from "../../utils/diseaseTargetLabels";
import { PendingUpload } from "../../utils/pendingUploads";
import { PendingUploadCard } from "./PendingUploadCard";

interface FolderDetailScreenProps {
  folderId: string;
  theme: Theme;
  onClose: () => void;
  /** Klasor pasiflestirildiginde parent listeyi guncellemek icin */
  onDeactivated: (folderId: string) => void;
  /** Klasor icin kamera ac (folderId context ile) */
  onAddPhoto: (folderId: string, folderName: string) => void;
  /** Detection tap'lerine callback (parent detail modal'i acabilir) */
  onDetectionPress?: (detection: FolderDetectionDetail) => void;
  /** Parent submit sonrasi artar → useEffect refetch tetikler */
  refreshKey?: number;
  pendingForFolder?: PendingUpload[];
  retryingPendingId?: string | null;
  onPendingRetry?: (pendingId: string) => void;
  onPendingDismiss?: (pendingId: string) => void;
}

export const FolderDetailScreen = ({
  folderId,
  theme,
  onClose,
  onDeactivated,
  onAddPhoto,
  onDetectionPress,
  refreshKey = 0,
  pendingForFolder = [],
  retryingPendingId = null,
  onPendingRetry,
  onPendingDismiss,
}: FolderDetailScreenProps) => {
  const { t, language } = useLanguage();
  const { showPopup } = usePopupMessage();
  const insets = useSafeAreaInsets();

  const [folder, setFolder] = useState<DiseaseTrackingFolderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchFolder = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      try {
        const res = await diseaseAPI.getFolderDetail(folderId);
        if (res.success && res.data) {
          setFolder(res.data);
        } else {
          showPopup(res.error ?? t.disease.folderDetailLoadError);
        }
      } catch {
        showPopup(t.disease.folderDetailLoadError);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [folderId],
  );

  useEffect(() => {
    fetchFolder();
  }, [fetchFolder]);

  // refreshKey > 0 ise initial mount fetch'i ile cakismasin
  useEffect(() => {
    if (refreshKey > 0) fetchFolder(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const handleDeactivate = () => {
    if (!folder) return;
    Alert.alert(
      t.disease.folderDeactivateTitle,
      t.disease.folderDeactivateConfirmation.replace("{name}", folder.name),
      [
        { text: t.common.cancel, style: "cancel" },
        {
          text: t.disease.folderDeactivateConfirm,
          style: "destructive",
          onPress: async () => {
            try {
              const res = await diseaseAPI.deactivateFolder(folderId);
              if (res.success) {
                onDeactivated(folderId);
                onClose();
                showPopup(t.disease.folderDeactivateSuccess);
              } else {
                showPopup(res.error ?? t.disease.folderDeactivateError);
              }
            } catch {
              showPopup(t.disease.folderDeactivateError);
            }
          },
        },
      ],
    );
  };

  const handleAddPhoto = () => {
    if (!folder) return;
    onAddPhoto(folder.folderId, folder.name);
  };

  // Loading
  if (loading || !folder) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={26} color={theme.textMain} />
          </TouchableOpacity>
        </View>
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </View>
    );
  }

  const targetLabel = DISEASE_TARGET_LABELS[folder.targetDisease];
  const targetText = language === "tr" ? targetLabel.tr : targetLabel.en;
  const isUncertain = folder.targetDisease === "UNCERTAIN";
  const isHealthy = folder.targetDisease === "HEALTHY";
  const targetColor = isUncertain
    ? theme.textSecondary
    : isHealthy
      ? (theme.success ?? "#22C55E")
      : (theme.danger ?? theme.primary);

  const cropName = folder.planting.cropName ?? "—";
  const zoneName = folder.planting.zoneName ?? "—";
  const startedAt = formatDate(folder.createdAt, language);

  return (
    <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      {/* Top bar: back · title · kebab */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={theme.textMain} />
        </TouchableOpacity>
        <Text
          style={[styles.headerTitle, { color: theme.textMain }]}
          numberOfLines={1}
        >
          {folder.name}
        </Text>
        <TouchableOpacity onPress={handleDeactivate} hitSlop={10} style={styles.iconBtn}>
          <Ionicons name="archive-outline" size={22} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.md, paddingBottom: vs(120) }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchFolder(true)}
            tintColor={theme.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header card: crop · zone · target · start date */}
        <View style={[styles.metaCard, { backgroundColor: theme.surface, borderColor: theme.primary + "20" }]}>
          <View style={styles.metaRow}>
            <Ionicons name="leaf" size={16} color={theme.primary} />
            <Text style={[styles.metaText, { color: theme.textMain }]}>
              {cropName} · {zoneName}
            </Text>
          </View>
          <View style={styles.metaRow}>
            <View style={[styles.dot, { backgroundColor: targetColor }]} />
            <Text style={[styles.metaText, { color: theme.textMain, fontWeight: "600" }]}>
              {t.disease.folderDetailTarget}: {targetText}
            </Text>
          </View>
          <View style={styles.metaRow}>
            <Ionicons name="calendar-outline" size={14} color={theme.textSecondary} />
            <Text style={[styles.metaSecondary, { color: theme.textSecondary }]}>
              {t.disease.folderDetailStarted} {startedAt} · {folder.detections.length} {folder.detections.length === 1 ? t.disease.folderPhotoSingular : t.disease.folderPhotoPlural}
            </Text>
          </View>
        </View>

        {/* Timeline */}
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
          {t.disease.folderDetailTimeline}
        </Text>

        {pendingForFolder.map((p) => (
          <PendingUploadCard
            key={p.pendingId}
            pending={p}
            theme={theme}
            retrying={retryingPendingId === p.pendingId}
            onRetry={(id) => onPendingRetry?.(id)}
            onDismiss={(id) => onPendingDismiss?.(id)}
          />
        ))}

        {folder.detections.length === 0 && pendingForFolder.length === 0 ? (
          <View style={[styles.emptyState, { backgroundColor: theme.surface, borderColor: theme.primary + "15" }]}>
            <Ionicons name="image-outline" size={36} color={theme.textSecondary} />
            <Text style={[styles.emptyStateText, { color: theme.textSecondary }]}>
              {t.disease.folderDetailEmpty}
            </Text>
          </View>
        ) : (
          folder.detections.map((d) => (
            <TimelineRow
              key={d.detection_id}
              detection={d}
              theme={theme}
              language={language}
              onPress={() => onDetectionPress?.(d)}
            />
          ))
        )}
      </ScrollView>

      {/* Labeled FAB: explicit folder context */}
      <View style={[styles.fabWrap, { paddingBottom: insets.bottom + vs(12) }]} pointerEvents="box-none">
        <TouchableOpacity
          onPress={handleAddPhoto}
          activeOpacity={0.85}
          style={[
            styles.fab,
            { backgroundColor: theme.primary, shadowColor: theme.shadowColor },
          ]}
        >
          <Ionicons name="camera" size={20} color="#fff" />
          <Text style={styles.fabText} numberOfLines={1}>
            {t.disease.folderAddPhotoTo} "{folder.name}"
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

interface TimelineRowProps {
  detection: FolderDetectionDetail;
  theme: Theme;
  language: "tr" | "en";
  onPress?: () => void;
}

const TimelineRow = ({ detection, theme, language, onPress }: TimelineRowProps) => {
  const date = formatDate(detection.uploaded_at, language);
  const disease = detection.detected_disease;
  const conf = detection.confidence_score ?? detection.confidence;
  const confPct = conf != null ? Math.round(conf * 100) : null;
  const isFailed = detection.status === "FAILED";
  const isProcessing = detection.status !== "COMPLETED" && detection.status !== "FAILED";
  const isUncertain = disease === "Uncertain" || (confPct != null && confPct < 50);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.timelineRow, { backgroundColor: theme.surface, borderColor: theme.primary + "15" }]}
    >
      {/* Thumbnail */}
      <View style={[styles.timelineThumb, { backgroundColor: theme.background, borderColor: theme.primary + "10" }]}>
        {detection.imageUrl ? (
          <Image source={{ uri: detection.imageUrl }} style={styles.timelineThumbImg} resizeMode="cover" />
        ) : (
          <Ionicons name="leaf-outline" size={20} color={theme.textSecondary} />
        )}
      </View>

      {/* Body */}
      <View style={{ flex: 1 }}>
        <Text style={[styles.timelineDate, { color: theme.textSecondary }]}>{date}</Text>
        {isFailed ? (
          <Text style={[styles.timelineDisease, { color: theme.danger ?? theme.textMain }]}>
            {detection.error_message ?? "Failed"}
          </Text>
        ) : isProcessing ? (
          <Text style={[styles.timelineDisease, { color: theme.textSecondary, fontStyle: "italic" }]}>
            …
          </Text>
        ) : (
          <Text
            style={[
              styles.timelineDisease,
              { color: isUncertain ? theme.textSecondary : theme.textMain },
            ]}
            numberOfLines={1}
          >
            {disease ?? "—"}
            {confPct != null && (
              <Text style={{ color: theme.textSecondary, fontWeight: "500" }}>  · {confPct}%</Text>
            )}
          </Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
    </TouchableOpacity>
  );
};

function formatDate(iso: string | null, language: "tr" | "en"): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  // Compact: "May 02" / "02 May"
  const monthsTr = ["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"];
  const monthsEn = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const mon = (language === "tr" ? monthsTr : monthsEn)[d.getMonth()];
  const day = String(d.getDate()).padStart(2, "0");
  return language === "tr" ? `${day} ${mon}` : `${mon} ${day}`;
}

void s;

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: vs(8),
    gap: 6,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    fontSize: ms(17, 0.3),
    fontWeight: "700",
  },
  loadingCenter: { flex: 1, alignItems: "center", justifyContent: "center" },
  metaCard: {
    padding: spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: spacing.md,
    gap: vs(8),
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  metaText: {
    fontSize: ms(13, 0.3),
    flexShrink: 1,
  },
  metaSecondary: {
    fontSize: ms(12, 0.3),
    flexShrink: 1,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  sectionTitle: {
    fontSize: ms(11, 0.3),
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: vs(8),
  },
  emptyState: {
    padding: spacing.lg,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    gap: 10,
  },
  emptyStateText: {
    fontSize: ms(13, 0.3),
    textAlign: "center",
  },
  timelineRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.sm,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
    gap: 12,
  },
  timelineThumb: {
    width: 52,
    height: 52,
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  timelineThumbImg: { width: "100%", height: "100%" },
  timelineDate: {
    fontSize: ms(11, 0.3),
    fontWeight: "600",
  },
  timelineDisease: {
    fontSize: ms(14, 0.3),
    fontWeight: "600",
    marginTop: 2,
  },
  fabWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    paddingHorizontal: spacing.md,
  },
  fab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 999,
    elevation: 10,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    maxWidth: "92%",
  },
  fabText: {
    color: "#fff",
    fontSize: ms(14, 0.3),
    fontWeight: "700",
    flexShrink: 1,
  },
});
