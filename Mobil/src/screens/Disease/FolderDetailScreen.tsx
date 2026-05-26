// Native stack screen — folder detail.
// Receives folderId via route.params. Fetches own folder data, manages own
// pending-uploads view (filtered by folderId). On "+ Add photo": navigates
// back to DiseaseList with openCameraFor param. On archive: API call then
// navigate back. On detection tap: pushes DiseaseDetail on top.

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  Alert,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { CompactStackHeader } from "../../components/CompactStackHeader";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "../../context/ThemeContext";
import { useLanguage } from "../../context/LanguageContext";
import { usePopupMessage } from "../../context/PopupMessageContext";
import { spacing, vs, ms } from "../../utils/responsive";
import {
  diseaseAPI,
  type DiseaseTrackingFolderDetail,
  type FolderDetectionDetail,
  type DiseaseDetection,
} from "../../utils/api";
import { DISEASE_TARGET_LABELS } from "../../utils/diseaseTargetLabels";
import {
  type PendingUpload,
  listPending,
  removePending,
  updatePendingError,
} from "../../utils/pendingUploads";
import { PendingUploadCard } from "./PendingUploadCard";
import { DiseaseResultCard } from "./DiseaseResultCard";
import type { FolderDetailScreenProps } from "./DiseaseStack";

export const FolderDetailScreen = ({ route, navigation }: FolderDetailScreenProps) => {
  const { folderId } = route.params;
  const { theme } = useTheme();
  const { t, language } = useLanguage();
  const { showPopup } = usePopupMessage();

  const [folder, setFolder] = useState<DiseaseTrackingFolderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingForFolder, setPendingForFolder] = useState<PendingUpload[]>([]);
  const [retryingPendingId, setRetryingPendingId] = useState<string | null>(null);

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

  const refreshPending = useCallback(async () => {
    const all = await listPending();
    setPendingForFolder(all.filter((p) => p.folderId === folderId));
  }, [folderId]);

  useEffect(() => {
    fetchFolder();
    refreshPending();
  }, [fetchFolder, refreshPending]);

  const handleDeactivate = useCallback(() => {
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
                showPopup(t.disease.folderDeactivateSuccess);
                navigation.goBack();
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
  }, [folder, folderId, t, showPopup, navigation]);

  const subtitleForHeader = useMemo(() => {
    if (!folder) return undefined;
    const crop = folder.planting.cropName ?? "—";
    const zone = folder.planting.zoneName ?? "—";
    return `${crop} · ${zone}`;
  }, [folder]);

  const handleDetectionPress = (d: FolderDetectionDetail) => {
    // FolderDetectionDetail is a subset of DiseaseDetection — safe widen for nav.
    navigation.navigate("DiseaseDetail", {
      detection: d as unknown as DiseaseDetection,
      imageUrl: d.imageUrl ?? undefined,
    });
  };

  const handlePendingRetry = async (pendingId: string) => {
    setRetryingPendingId(pendingId);
    try {
      // Best-effort: parent (DiseaseList) is the canonical retry path. For now
      // just clear the error state so user knows it's queued.
      await updatePendingError(pendingId, "");
      await refreshPending();
    } finally {
      setRetryingPendingId(null);
    }
  };

  const handlePendingDismiss = async (pendingId: string) => {
    await removePending(pendingId);
    await refreshPending();
  };

  // Loading
  if (loading || !folder) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <CompactStackHeader title="" dismissStyle />
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
      ? theme.success
      : theme.danger;

  const cropName = folder.planting.cropName ?? "—";
  const zoneName = folder.planting.zoneName ?? "—";
  const startedAt = formatDate(folder.createdAt, language);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <CompactStackHeader
        title={folder.name}
        subtitle={subtitleForHeader}
        dismissStyle
        rightAction={{
          icon: "archive-outline",
          onPress: handleDeactivate,
          accessibilityLabel: "archive",
        }}
      />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.md,
          paddingTop: 0,
          paddingBottom: vs(120),
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              fetchFolder(true);
              refreshPending();
            }}
            tintColor={theme.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header card */}
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

        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
          {t.disease.folderDetailTimeline}
        </Text>

        {pendingForFolder.map((p) => (
          <PendingUploadCard
            key={p.pendingId}
            pending={p}
            theme={theme}
            retrying={retryingPendingId === p.pendingId}
            onRetry={handlePendingRetry}
            onDismiss={handlePendingDismiss}
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
            <DiseaseResultCard
              key={d.detection_id}
              detection={d as unknown as DiseaseDetection}
              theme={theme}
              imageUrl={d.imageUrl ?? undefined}
              onPress={() => handleDetectionPress(d)}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
};

function formatDate(iso: string | null, language: "tr" | "en"): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const monthsTr = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
  const monthsEn = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mon = (language === "tr" ? monthsTr : monthsEn)[d.getMonth()];
  const day = String(d.getDate()).padStart(2, "0");
  return language === "tr" ? `${day} ${mon}` : `${mon} ${day}`;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingCenter: { flex: 1, alignItems: "center", justifyContent: "center" },
  metaCard: {
    padding: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: spacing.md,
    gap: vs(8),
  },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  metaText: { fontSize: ms(13, 0.3), flexShrink: 1 },
  metaSecondary: { fontSize: ms(12, 0.3), flexShrink: 1 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  sectionTitle: {
    fontSize: ms(11, 0.3),
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: vs(8),
  },
  emptyState: {
    padding: spacing.lg,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    gap: 10,
  },
  emptyStateText: { fontSize: ms(13, 0.3), textAlign: "center" },
});
