// Hastalik tespit ekrani - analiz listesi ve kamera erisimi
// Props: theme, permission, onRequestPermission, isActive

import { memo, useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Modal,
  FlatList,
  Dimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import { Theme } from "../../utils/theme";
import { diseaseAPI, DiseaseDetection, type DiseaseTrackingFolder } from "../../utils/api";
import { IS_EXPO_GO } from "../../utils/runtimeEnv";
import { DiseaseResultCard } from "./DiseaseResultCard";
import { PendingUploadCard } from "./PendingUploadCard";
import { DiseaseCameraScreen } from "./DiseaseCameraScreen";
import { FolderCard } from "./FolderCard";
import { CreateFolderModal } from "./CreateFolderModal";
import {
  PendingUpload,
  enqueuePending,
  listPending,
  removePending,
  updatePendingError,
} from "../../utils/pendingUploads";
import { DiseaseScreenProps } from "./types";
import { spacing, vs, TAB_H_PADDING } from "../../utils/responsive";
import type { DiseaseListScreenProps } from "./DiseaseStack";
import { useScreenReset } from "../../hooks/useScreenReset";
import { useTabReset } from "../../context/TabResetContext";
import { usePopupMessage } from "../../context/PopupMessageContext";
import { useLanguage } from "../../context/LanguageContext";
import { useAuth } from "../../context/AuthContext";
import { useDashboard } from "../../context/DashboardContext";
import { useConfirm } from "../../context/ConfirmContext";
import { FocusableSection } from "../../components/FocusableSection";
import * as imageCache from "../../utils/imageCache";

interface ParentDiseaseScreenProps extends DiseaseScreenProps {
  theme: Theme;
  isActive?: boolean;
}

export const DiseaseScreen = memo(function DiseaseScreen({
  theme,
  hasCameraPermission,
  onRequestPermission,
  isActive = true,
}: ParentDiseaseScreenProps) {
  const { showPopup } = usePopupMessage();
  const { t } = useLanguage();
  const confirm = useConfirm();
  // Paydas (stakeholder): yalnizca secili ciftligin klasorlerini gorur (salt-okunur).
  const { isStakeholder } = useAuth();
  const { selectedFarmId } = useDashboard();
  const navigation = useNavigation<DiseaseListScreenProps["navigation"]>();
  const route = useRoute<DiseaseListScreenProps["route"]>();
  const [showCamera, setShowCamera] = useState(false);
  const [detections, setDetections] = useState<DiseaseDetection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});

  // ── Folder state ─────────────────────────────────────────────────────────
  const [folders, setFolders] = useState<DiseaseTrackingFolder[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [generalExpanded, setGeneralExpanded] = useState(true);
  const [foldersExpanded, setFoldersExpanded] = useState(true);
  // Kamera acildiginda (folder detail FAB'den) hangi folder'a baglanmali
  const [cameraFolderContext, setCameraFolderContext] =
    useState<{ folderId: string; folderName: string } | null>(null);

  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [retryingPendingId, setRetryingPendingId] = useState<string | null>(null);

  // Infinite scroll for general detections — start at 5, grow by 10 on bottom-reach
  const DETECTION_INITIAL = 5;
  const DETECTION_INCREMENT = 10;
  const [visibleDetectionCount, setVisibleDetectionCount] = useState(DETECTION_INITIAL);
  const visibleDetections = useMemo(
    () => detections.slice(0, visibleDetectionCount),
    [detections, visibleDetectionCount],
  );
  const hasMoreDetections = visibleDetectionCount < detections.length;

  // Folder pager — 2 folders per swipe page
  const FOLDERS_PER_PAGE = 2;
  const folderPages = useMemo(() => {
    const out: DiseaseTrackingFolder[][] = [];
    for (let i = 0; i < folders.length; i += FOLDERS_PER_PAGE) {
      out.push(folders.slice(i, i + FOLDERS_PER_PAGE));
    }
    return out;
  }, [folders]);
  // Full-window page width so adjacent pages can have inner padding gap during swipe
  const folderPageWidth = Dimensions.get("window").width;
  const [folderPage, setFolderPage] = useState(0);

  const refreshPending = async () => {
    try {
      const list = await listPending();
      setPending(list);
    } catch (err) {
      console.log("[DISEASE] pending list fail:", String(err));
    }
  };

  useEffect(() => {
    refreshPending();
  }, []);

  // Silent background refresh when this screen comes back to focus (e.g.,
  // returning from DiseaseDetail or FolderDetail). NO loading spinner — the
  // current content stays visible and updates in place. The user shouldn't
  // see a "reload" when they swipe back from a sub-screen.
  // Skip the very first focus since the mount effect (above) already fetched.
  const hasMountedRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!hasMountedRef.current) {
        hasMountedRef.current = true;
        return;
      }
      fetchDetections("silent");
      refreshPending();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  // React to camera-trigger params from the persistent DiseaseCameraButton.
  // - openCameraFor: bound to a specific folder (from FolderDetail context).
  // - openGeneralCamera: general photo, no folder context.
  // Params are cleared after consumption so they don't re-fire on remount.
  useEffect(() => {
    const folderCtx = route.params?.openCameraFor;
    const general = route.params?.openGeneralCamera;
    if (folderCtx) {
      setCameraFolderContext(folderCtx);
      setShowCamera(true);
      navigation.setParams({ openCameraFor: undefined, openGeneralCamera: undefined });
    } else if (general) {
      setCameraFolderContext(null);
      setShowCamera(true);
      navigation.setParams({ openCameraFor: undefined, openGeneralCamera: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.openCameraFor, route.params?.openGeneralCamera]);

  // Refresh / delete → clamp window down if list shrank, but never below the initial 5
  useEffect(() => {
    setVisibleDetectionCount((cur) =>
      Math.min(Math.max(DETECTION_INITIAL, cur), Math.max(detections.length, DETECTION_INITIAL)),
    );
  }, [detections.length]);

  const handleScrollNearBottom = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!hasMoreDetections) return;
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    if (contentOffset.y + layoutMeasurement.height >= contentSize.height - 240) {
      setVisibleDetectionCount((c) => Math.min(c + DETECTION_INCREMENT, detections.length));
    }
  };

  // Modeli arka planda yukle — kullanici Live mode'a gectiginde hazir olur
  // Singleton oldugu icin useLiveScan ikinci yukleme baslatmaz
  // Expo Go: fast-tflite native modulu yok — diseaseInference.ts'i hic load etme,
  // aksi halde TensorflowModule.install() Expo Go'da TypeError firlatir
  useEffect(() => {
    if (IS_EXPO_GO) return;
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const { loadDiseaseModel } = require("../../utils/diseaseInference");
    loadDiseaseModel().catch(() => {
      // Sessizce yut — gercek hata gostermesi useLiveScan'e birakilir
    });
  }, []);
  const scrollViewRef = useRef<ScrollView>(null);
  const pollCancelledRef = useRef(false);

  // Cache'deki resimleri hydrate et — network fetch ile paralel, kart goruntuleri
  // backend cevaplamadan once gozukebilsin
  useEffect(() => {
    (async () => {
      const ids = await imageCache.listCachedIds();
      if (ids.length === 0) return;
      const hydrated: Record<string, string> = {};
      for (const id of ids) hydrated[id] = imageCache.localPath(id);
      setImageUrls((prev) => ({ ...hydrated, ...prev }));
    })();
  }, []);

  const fetchFolders = async (silent = false) => {
    if (pollCancelledRef.current) return;
    if (!silent) setLoadingFolders(true);
    try {
      const res = await diseaseAPI.getFolders(
        isStakeholder ? selectedFarmId ?? undefined : undefined,
      );
      if (pollCancelledRef.current) return;
      if (res.success && res.data) {
        setFolders(res.data);

        // Pre-resolve folder thumbnail images into the shared imageCache.
        // Without this, FolderCard thumbnails use the raw signed S3 URL,
        // whose ?X-Amz-Signature param rotates on every fetch and forces
        // <Image> to re-download (visible as a flicker on focus/refresh).
        const entries = await Promise.all(
          res.data
            .flatMap((f) => f.detections)
            .map(async (d) => {
              const uri = await imageCache.resolveImage(
                d.detection_id,
                d.imageUrl ?? null,
              );
              return [d.detection_id, uri] as const;
            }),
        );
        if (pollCancelledRef.current) return;
        setImageUrls((prev) => {
          const next = { ...prev };
          for (const [id, uri] of entries) {
            if (uri) next[id] = uri;
          }
          return next;
        });
      }
    } catch {
      // Sessiz — folders yoksa screen yine kullanilabilir; sadece loglayalim
      console.log("[DISEASE] folders fetch failed");
    } finally {
      if (!pollCancelledRef.current && !silent) setLoadingFolders(false);
    }
  };

  /**
   * @param mode "initial" → full-screen spinner (first paint, no content yet)
   *             "pull"    → pull-to-refresh indicator (RefreshControl)
   *             "silent"  → no loading UI at all (background refresh on focus)
   */
  const fetchDetections = async (mode: "initial" | "pull" | "silent" = "initial") => {
    if (pollCancelledRef.current) return;
    if (mode === "pull") setRefreshing(true);
    else if (mode === "initial") setLoading(true);

    // Folders'i paralel cek — bekleme zinciri yok
    fetchFolders(mode === "silent");

    // Paydas: klasorsuz (genel) tespitler ciftlige baglanamaz, backend reddeder —
    // yalnizca folders gosterilir, genel liste atlanir.
    if (isStakeholder) {
      setDetections([]);
      if (mode === "pull") setRefreshing(false);
      else if (mode === "initial") setLoading(false);
      return;
    }

    try {
      const response = await diseaseAPI.getAllDetections();
      if (pollCancelledRef.current) return;
      if (response.success && response.data) {
        setDetections(response.data.detections);

        // Her detection icin yerel cache ya indir ya da mevcut dosyayi kullan
        const nextUrls: Record<string, string> = {};
        await Promise.all(
          response.data.detections.map(async (d) => {
            const uri = await imageCache.resolveImage(
              d.detection_id,
              d.imageUrl ?? null,
            );
            if (uri) nextUrls[d.detection_id] = uri;
          }),
        );
        if (pollCancelledRef.current) return;
        setImageUrls(nextUrls);

        // Cross-device reconciliation — server'da olmayan yerel dosyalari temizle
        // Sadece basarili fetch sonrasi cagrilir; network hatasinda silme yapma
        const liveIds = new Set(
          response.data.detections.map((d) => d.detection_id),
        );
        imageCache.reconcile(liveIds).catch(() => {});
      }
    } catch (error) {
      if (!pollCancelledRef.current && mode !== "silent")
        showPopup(t.disease.errorLoadingResults);
    } finally {
      if (!pollCancelledRef.current) {
        if (mode !== "silent") setLoading(false);
        if (mode === "pull") setRefreshing(false);
      }
    }
  };

  // Sadece folder list'i yenile (folder olusturulduktan/pasiflestirildikten sonra)
  const refreshFoldersOnly = () => {
    fetchFolders();
  };

  useScreenReset(isActive, {
    onActivate: () => {
      // Sadece veri yoksa fetch yap - mevcut veri korunur
      pollCancelledRef.current = false;
      if (!showCamera && detections.length === 0) {
        fetchDetections();
      }
    },
    onDeactivate: () => {
      // Kamera state sifirla, veri korunur
      pollCancelledRef.current = true;
      setShowCamera(false);
      setLoading(false);
    },
  });

  // Aktif "disease" sekmesine tekrar basilinca ana duruma don: alt ekrandan koke
  // (DiseaseDetail/FolderDetail) don, acik dialoglari kapat, listeyi en uste kaydir.
  useTabReset("disease", () => {
    navigation.popToTop();
    setShowCamera(false);
    setCameraFolderContext(null);
    setShowCreateFolder(false);
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  });

  const closeCameraAndReturn = () => {
    setShowCamera(false);
    // If we came from a folder context, navigate back to that folder detail
    // after the camera dismisses; otherwise stay on the list.
    const wasFolderCtx = cameraFolderContext;
    setCameraFolderContext(null);
    if (wasFolderCtx) {
      navigation.navigate("FolderDetail", {
        folderId: wasFolderCtx.folderId,
        folderName: wasFolderCtx.folderName,
      });
    }
  };

  const handleSendForAnalysis = async (
    imageUri: string,
    folderId?: string | null,
    extras?: import("./types").DiseaseSubmissionExtras,
  ) => {
    try {
      const response = await diseaseAPI.submitDetection(
        imageUri,
        folderId ?? null,
        extras?.hintedLabel ?? null,
        extras?.liveScanResult ?? null,
      );

      if (!response.success || !response.data) {
        // Backend basarisizsa goruntuyu yerel kuyruga al — kullanici resmi tekrar cekmesin
        try {
          await enqueuePending({
            imageUri,
            folderId: folderId ?? null,
            hintedLabel: extras?.hintedLabel ?? null,
            liveScanResult: extras?.liveScanResult ?? null,
            errorReason: response.error ?? null,
          });
          await refreshPending();
          showPopup(t.disease.queuedForRetry);
        } catch (err) {
          console.log("[DISEASE] enqueue pending fail:", String(err));
          showPopup(response.error || t.disease.errorSendingImage);
        }
        closeCameraAndReturn();
        fetchDetections("silent");
        return;
      }

      const { detectionId } = response.data;

      showPopup(t.disease.sentForAnalysis);
      closeCameraAndReturn();
      fetchDetections("silent");
      pollForResults(detectionId);
    } catch (error) {
      console.log("[DISEASE] submit unexpected:", String(error));
      try {
        await enqueuePending({
          imageUri,
          folderId: folderId ?? null,
          hintedLabel: extras?.hintedLabel ?? null,
          liveScanResult: extras?.liveScanResult ?? null,
          errorReason: error instanceof Error ? error.message : "unknown",
        });
        await refreshPending();
        showPopup(t.disease.queuedForRetry);
      } catch {
        showPopup(t.disease.errorGeneric);
      }
      closeCameraAndReturn();
      fetchDetections("silent");
    }
  };

  const handleRetryPending = async (pendingId: string) => {
    const item = pending.find((p) => p.pendingId === pendingId);
    if (!item) return;
    setRetryingPendingId(pendingId);
    try {
      const response = await diseaseAPI.submitDetection(
        item.imageUri,
        item.folderId ?? null,
        item.hintedLabel ?? null,
        (item.liveScanResult as any) ?? null,
      );
      if (response.success && response.data) {
        await removePending(pendingId);
        await refreshPending();
        showPopup(t.disease.retrySuccess);
        fetchDetections("silent");
        pollForResults(response.data.detectionId);
      } else {
        const reason = response.error ?? "retry failed";
        await updatePendingError(pendingId, reason);
        await refreshPending();
        showPopup(reason);
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : "retry error";
      await updatePendingError(pendingId, reason);
      await refreshPending();
      showPopup(t.disease.errorSendingImage);
    } finally {
      setRetryingPendingId(null);
    }
  };

  const handleDismissPending = async (pendingId: string) => {
    await removePending(pendingId);
    await refreshPending();
  };

  // ── Folder handlers ──────────────────────────────────────────────────────
  const handleOpenFolder = (folderId: string) => {
    const folder = folders.find((f) => f.folderId === folderId);
    navigation.navigate("FolderDetail", {
      folderId,
      folderName: folder?.name,
    });
  };

  const handleFolderCreated = (folder: DiseaseTrackingFolder) => {
    setFolders((prev) => [folder, ...prev]);
    // Yeni klasore otomatik gir
    navigation.navigate("FolderDetail", {
      folderId: folder.folderId,
      folderName: folder.name,
    });
  };

  const pollForResults = async (detectionId: string) => {
    pollCancelledRef.current = false;
    try {
      await diseaseAPI.pollDetectionStatus(
        detectionId,
        (status) => {
          console.log("[DISEASE] poll:", status);
        },
        30,
        2000,
      );

      fetchDetections("silent");
    } catch (error) {
      console.log("[DISEASE] poll err:", error);
      // Still refresh to show the failed status
      fetchDetections("silent");
    }
  };

  const handleDeleteDetection = async (detectionId: string) => {
    const ok = await confirm({
      title: t.disease.deleteTitle,
      message: t.disease.deleteConfirmation,
      confirmLabel: t.common.delete,
      cancelLabel: t.common.cancel,
      destructive: true,
    });
    if (!ok) return;
    try {
      const response = await diseaseAPI.deleteDetection(detectionId);
      if (response.success) {
        setDetections((prev) =>
          prev.filter((d) => d.detection_id !== detectionId),
        );
        imageCache.deleteLocal(detectionId).catch(() => {});
        setImageUrls((prev) => {
          const next = { ...prev };
          delete next[detectionId];
          return next;
        });
        showPopup(t.disease.deletedSuccessfully);
      } else {
        showPopup(response.error || t.disease.errorDeleting);
      }
    } catch {
      showPopup(t.disease.errorDeleting);
    }
  };

  return (
    <View className="screen-bg">
      {loading && !refreshing ? (
        <View className="flex-1 center px-6 bg-porcelain dark:bg-carbonBlack">
          <ActivityIndicator size="large" color={theme.primary} />
          <Text className="text-secondary mt-4">
            {t.disease.loadingResults}
          </Text>
        </View>
      ) : (
        <>
          <ScrollView
            ref={scrollViewRef}
            className="flex-1"
            contentContainerStyle={{
              paddingHorizontal: TAB_H_PADDING,
              paddingTop: 0,
              paddingBottom: 100,
              flexGrow: 1,
            }}
            showsVerticalScrollIndicator={false}
            onScroll={handleScrollNearBottom}
            scrollEventThrottle={64}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => fetchDetections("pull")}
                tintColor={theme.primary}
              />
            }
          >
            {/* ── FOLDERS SECTION ───────────────────────────────── */}
            <View style={{ marginBottom: spacing.md }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: foldersExpanded ? vs(8) : 0,
                }}
              >
                <TouchableOpacity
                  onPress={() => setFoldersExpanded((v) => !v)}
                  activeOpacity={0.8}
                  hitSlop={8}
                  style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}
                >
                  <Ionicons
                    name={foldersExpanded ? "chevron-down" : "chevron-forward"}
                    size={18}
                    color={theme.textSecondary}
                  />
                  <Text
                    style={{
                      color: theme.textSecondary,
                      fontSize: 11,
                      fontWeight: "700",
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}
                  >
                    {t.disease.foldersSectionTitle} {folders.length > 0 ? `(${folders.length})` : ""}
                  </Text>
                </TouchableOpacity>
                {!isStakeholder && (
                  <TouchableOpacity
                    onPress={() => setShowCreateFolder(true)}
                    hitSlop={8}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 999,
                      backgroundColor: theme.primary + "15",
                      borderWidth: 1,
                      borderColor: theme.primary + "35",
                    }}
                  >
                    <Ionicons name="add" size={14} color={theme.primary} />
                    <Text style={{ color: theme.primary, fontSize: 12, fontWeight: "700" }}>
                      {t.disease.folderCreateButton}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {!foldersExpanded ? null : loadingFolders && folders.length === 0 ? (
                <View style={{ paddingVertical: vs(16), alignItems: "center" }}>
                  <ActivityIndicator size="small" color={theme.primary} />
                </View>
              ) : folders.length === 0 ? (
                <View
                  style={{
                    padding: spacing.md,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: theme.primary + "20",
                    backgroundColor: theme.surface,
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Ionicons name="folder-open-outline" size={28} color={theme.textSecondary} />
                  <Text style={{ color: theme.textSecondary, fontSize: 13, textAlign: "center" }}>
                    {t.disease.foldersEmpty}
                  </Text>
                </View>
              ) : folderPages.length <= 1 ? (
                folders.map((f) => (
                  <FolderCard
                    key={f.folderId}
                    folder={f}
                    theme={theme}
                    imageUrls={imageUrls}
                    onPress={() => handleOpenFolder(f.folderId)}
                  />
                ))
              ) : (
                <View style={{ marginHorizontal: -TAB_H_PADDING }}>
                  <FlatList
                    data={folderPages}
                    keyExtractor={(_, i) => `folder-page-${i}`}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    snapToInterval={folderPageWidth}
                    decelerationRate="fast"
                    scrollEventThrottle={16}
                    onScroll={(e) => {
                      const next = Math.round(e.nativeEvent.contentOffset.x / folderPageWidth);
                      if (next !== folderPage) setFolderPage(next);
                    }}
                    renderItem={({ item: page }) => (
                      <View style={{ width: folderPageWidth, paddingHorizontal: TAB_H_PADDING }}>
                        {page.map((f) => (
                          <FolderCard
                            key={f.folderId}
                            folder={f}
                            theme={theme}
                            imageUrls={imageUrls}
                            onPress={() => handleOpenFolder(f.folderId)}
                          />
                        ))}
                      </View>
                    )}
                  />
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "center",
                      gap: 6,
                      marginTop: 6,
                    }}
                  >
                    {folderPages.map((_, i) => (
                      <View
                        key={i}
                        style={{
                          width: i === folderPage ? 16 : 6,
                          height: 6,
                          borderRadius: 3,
                          backgroundColor:
                            i === folderPage ? theme.primary : theme.primary + "40",
                        }}
                      />
                    ))}
                  </View>
                </View>
              )}
            </View>

            {/* ── GENERAL DETECTIONS SECTION ────────────────────── */}
            <View style={{ marginBottom: vs(8) }}>
              <TouchableOpacity
                onPress={() => setGeneralExpanded((v) => !v)}
                activeOpacity={0.8}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: generalExpanded ? vs(8) : 0,
                  paddingHorizontal: 2,
                }}
              >
                <Ionicons
                  name={generalExpanded ? "chevron-down" : "chevron-forward"}
                  size={18}
                  color={theme.textSecondary}
                />
                <Text
                  style={{
                    color: theme.textSecondary,
                    fontSize: 11,
                    fontWeight: "700",
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  {t.disease.generalSectionTitle} {detections.length > 0 ? `(${detections.length})` : ""}
                </Text>
              </TouchableOpacity>

              <FocusableSection
                id="detectionList"
                screen="disease"
                theme={theme}
                scrollViewRef={scrollViewRef}
              >
                {/* Pending uploads (failed-to-send) — folder'a bagli olmayanlar */}
                {generalExpanded &&
                  pending
                    .filter((p) => !p.folderId)
                    .map((p) => (
                      <PendingUploadCard
                        key={p.pendingId}
                        pending={p}
                        theme={theme}
                        retrying={retryingPendingId === p.pendingId}
                        onRetry={handleRetryPending}
                        onDismiss={handleDismissPending}
                      />
                    ))}

                {!generalExpanded ? null : detections.length === 0 && pending.filter((p) => !p.folderId).length === 0 ? (
                  <View className="flex-1 center" style={{ paddingVertical: vs(16) }}>
                    <Ionicons
                      name="leaf-outline"
                      size={48}
                      color={theme.textSecondary}
                    />
                    <Text className="text-primary text-base font-semibold mt-3">
                      {t.disease.noAnalysisYet}
                    </Text>
                    <Text className="text-secondary text-[13px] mt-1 text-center">
                      {t.disease.noAnalysisSubtitle}
                    </Text>
                  </View>
                ) : (
                  <>
                    {visibleDetections.map((detection) => (
                      <DiseaseResultCard
                        key={detection.detection_id}
                        detection={detection}
                        theme={theme}
                        imageUrl={imageUrls[detection.detection_id]}
                        onPress={() =>
                          navigation.navigate("DiseaseDetail", {
                            detection,
                            imageUrl: imageUrls[detection.detection_id],
                          })
                        }
                        onDelete={() => handleDeleteDetection(detection.detection_id)}
                      />
                    ))}
                    {hasMoreDetections && (
                      <View style={{ paddingVertical: vs(10), alignItems: "center" }}>
                        <TouchableOpacity
                          onPress={() =>
                            setVisibleDetectionCount((c) =>
                              Math.min(c + DETECTION_INCREMENT, detections.length),
                            )
                          }
                          activeOpacity={0.7}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 6,
                            paddingHorizontal: 14,
                            paddingVertical: 8,
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: theme.primary + "35",
                            backgroundColor: theme.primary + "10",
                          }}
                        >
                          <Text style={{ color: theme.primary, fontSize: 12, fontWeight: "700" }}>
                            +{Math.min(DETECTION_INCREMENT, detections.length - visibleDetectionCount)} {t.disease.showMore}
                          </Text>
                          <Ionicons name="chevron-down" size={14} color={theme.primary} />
                        </TouchableOpacity>
                      </View>
                    )}
                  </>
                )}
              </FocusableSection>
            </View>
          </ScrollView>

        </>
      )}

      {/* Camera + create-folder dialogs */}
      <Modal
        visible={showCamera}
        animationType="slide"
        onRequestClose={() => {
          setShowCamera(false);
          setCameraFolderContext(null);
        }}
        statusBarTranslucent
        presentationStyle="fullScreen"
        transparent={false}
      >
        <SafeAreaProvider>
          <DiseaseCameraScreen
            theme={theme}
            hasCameraPermission={hasCameraPermission}
            onRequestPermission={onRequestPermission}
            onSendForAnalysis={handleSendForAnalysis}
            isActive={showCamera && isActive}
            onClose={() => {
              setShowCamera(false);
              setCameraFolderContext(null);
            }}
            folderContext={cameraFolderContext}
          />
        </SafeAreaProvider>
      </Modal>

      <CreateFolderModal
        visible={showCreateFolder}
        theme={theme}
        existingFolders={folders}
        onClose={() => setShowCreateFolder(false)}
        onCreated={(folder) => {
          handleFolderCreated(folder);
          refreshFoldersOnly();
        }}
      />
    </View>
  );
});

