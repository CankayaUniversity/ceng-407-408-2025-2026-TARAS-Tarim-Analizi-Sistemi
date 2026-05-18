// Hastalik tespit ekrani - analiz listesi ve kamera erisimi
// Props: theme, permission, onRequestPermission, isActive

import { memo, useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
  Modal,
  FlatList,
  Dimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { Theme } from "../../utils/theme";
import { diseaseAPI, DiseaseDetection, type DiseaseTrackingFolder } from "../../utils/api";
import { IS_EXPO_GO } from "../../utils/runtimeEnv";
import { DiseaseResultCard, getConfidenceTier, FeedbackRating } from "./DiseaseResultCard";
import { PendingUploadCard } from "./PendingUploadCard";
import { DiseaseCameraScreen } from "./DiseaseCameraScreen";
import { FolderCard } from "./FolderCard";
import { CreateFolderModal } from "./CreateFolderModal";
import { FolderDetailScreen } from "./FolderDetailScreen";
import {
  PendingUpload,
  enqueuePending,
  listPending,
  removePending,
  updatePendingError,
} from "../../utils/pendingUploads";
import { DiseaseScreenProps } from "./types";
import { getDiseaseTargetLabel } from "../../utils/diseaseTargetLabels";
import { spacing } from "../../utils/responsive";
import { s, vs } from "../../utils/responsive";
import { useScreenReset } from "../../hooks/useScreenReset";
import { usePopupMessage } from "../../context/PopupMessageContext";
import { useLanguage } from "../../context/LanguageContext";
import { FocusableSection } from "../../components/FocusableSection";
import { PressableDark } from "../../components/PressableDark";
import { useTabBarPopOut } from "../../context/TabBarPopOutContext";
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
  const { t, language } = useLanguage();
  const { register: registerTabPopOut } = useTabBarPopOut();
  const [showCamera, setShowCamera] = useState(false);
  const [detections, setDetections] = useState<DiseaseDetection[]>([]);
  const [selectedDetection, setSelectedDetection] =
    useState<DiseaseDetection | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});

  // ── Folder state ─────────────────────────────────────────────────────────
  const [folders, setFolders] = useState<DiseaseTrackingFolder[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
  const [generalExpanded, setGeneralExpanded] = useState(true);
  const [foldersExpanded, setFoldersExpanded] = useState(true);
  // Kamera acildiginda (folder detail FAB'den) hangi folder'a baglanmali
  const [cameraFolderContext, setCameraFolderContext] =
    useState<{ folderId: string; folderName: string } | null>(null);
  const [returnToFolderId, setReturnToFolderId] = useState<string | null>(null);
  const [folderRefreshKey, setFolderRefreshKey] = useState(0);

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

  // Register a pop-out card-button on the disease tab. AppTabBar renders this
  // absolutely above the leaf tab slot using its own flex layout, so the X is
  // pixel-perfect on every device and the Y rides on top of the bar regardless
  // of 3-button vs gesture nav, iOS home indicator, etc.
  useEffect(() => {
    return registerTabPopOut({
      tabId: "disease",
      // Bookmark shape — flush against the tab bar top, gently rounded top
      // corners (matches the nav bar rounding), square bottom that melts into
      // the surface below it.
      render: () => (
        <PressableDark
          onPress={handleOpenGeneralCamera}
          style={{
            width: s(60),
            paddingVertical: vs(12),
            borderTopLeftRadius: s(10),
            borderTopRightRadius: s(10),
            backgroundColor: theme.success,
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            elevation: 8,
            shadowColor: theme.shadowColor,
            shadowOffset: { width: 0, height: -4 },
            shadowOpacity: 0.18,
            shadowRadius: 10,
          }}
        >
          <Ionicons name="camera" size={30} color={theme.textOnPrimary} />
        </PressableDark>
      ),
    });
  }, [registerTabPopOut, theme]);

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

  const fetchFolders = async () => {
    if (pollCancelledRef.current) return;
    setLoadingFolders(true);
    try {
      const res = await diseaseAPI.getFolders();
      if (pollCancelledRef.current) return;
      if (res.success && res.data) {
        setFolders(res.data);
      }
    } catch {
      // Sessiz — folders yoksa screen yine kullanilabilir; sadece loglayalim
      console.log("[DISEASE] folders fetch failed");
    } finally {
      if (!pollCancelledRef.current) setLoadingFolders(false);
    }
  };

  const fetchDetections = async (isRefresh = false) => {
    if (pollCancelledRef.current) return;
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    // Folders'i paralel cek — bekleme zinciri yok
    fetchFolders();

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
      if (!pollCancelledRef.current) showPopup(t.disease.errorLoadingResults);
    } finally {
      if (!pollCancelledRef.current) {
        setLoading(false);
        setRefreshing(false);
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

  const closeCameraAndReturn = () => {
    setShowCamera(false);
    setCameraFolderContext(null);
    if (returnToFolderId) {
      setOpenFolderId(returnToFolderId);
      setReturnToFolderId(null);
      setFolderRefreshKey((k) => k + 1);
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
        fetchDetections();
        return;
      }

      const { detectionId } = response.data;

      showPopup(t.disease.sentForAnalysis);
      closeCameraAndReturn();
      fetchDetections();
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
      fetchDetections();
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
        fetchDetections();
        if (item.folderId) setFolderRefreshKey((k) => k + 1);
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
    setOpenFolderId(folderId);
  };

  const handleCloseFolder = () => {
    setOpenFolderId(null);
  };

  const handleFolderCreated = (folder: DiseaseTrackingFolder) => {
    setFolders((prev) => [folder, ...prev]);
    // Yeni klasore otomatik gir — kullanici hemen foto cekebilsin
    setOpenFolderId(folder.folderId);
  };

  const handleFolderDeactivated = (folderId: string) => {
    // is_active=true filter backend'de — listeyi yeniden cek
    setFolders((prev) => prev.filter((f) => f.folderId !== folderId));
  };

  const handleAddPhotoFromFolder = (folderId: string, folderName: string) => {
    setCameraFolderContext({ folderId, folderName });
    setReturnToFolderId(folderId); // gönder/iptal sonrası bu folder'a geri dön
    setOpenFolderId(null); // detail'i kapat (modal stack temiz olsun)
    setShowCamera(true);
  };

  const handleOpenGeneralCamera = () => {
    setCameraFolderContext(null);
    setShowCamera(true);
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

      fetchDetections();
    } catch (error) {
      console.log("[DISEASE] poll err:", error);
      // Still refresh to show the failed status
      fetchDetections();
    }
  };

  const handleDeleteDetection = async (detectionId: string) => {
    Alert.alert(t.disease.deleteTitle, t.disease.deleteConfirmation, [
      { text: t.common.cancel, style: "cancel" },
      {
        text: t.common.delete,
        style: "destructive",
        onPress: async () => {
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
              setSelectedDetection((cur) =>
                cur?.detection_id === detectionId ? null : cur,
              );
              showPopup(t.disease.deletedSuccessfully);
            } else {
              showPopup(response.error || t.disease.errorDeleting);
            }
          } catch {
            showPopup(t.disease.errorDeleting);
          }
        },
      },
    ]);
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
              paddingHorizontal: spacing.md,
              paddingTop: spacing.md,
              paddingBottom: 100,
              flexGrow: 1,
            }}
            showsVerticalScrollIndicator={false}
            onScroll={handleScrollNearBottom}
            scrollEventThrottle={64}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => fetchDetections(true)}
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
                    onPress={() => handleOpenFolder(f.folderId)}
                  />
                ))
              ) : (
                <View style={{ marginHorizontal: -spacing.md }}>
                  <FlatList
                    data={folderPages}
                    keyExtractor={(_, i) => `folder-page-${i}`}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    snapToInterval={folderPageWidth}
                    decelerationRate="fast"
                    onMomentumScrollEnd={(e) =>
                      setFolderPage(Math.round(e.nativeEvent.contentOffset.x / folderPageWidth))
                    }
                    renderItem={({ item: page }) => (
                      <View style={{ width: folderPageWidth, paddingHorizontal: spacing.md }}>
                        {page.map((f) => (
                          <FolderCard
                            key={f.folderId}
                            folder={f}
                            theme={theme}
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
                        onPress={() => setSelectedDetection(detection)}
                        onDelete={() => handleDeleteDetection(detection.detection_id)}
                      />
                    ))}
                    {hasMoreDetections && (
                      <View style={{ paddingVertical: vs(10), alignItems: "center" }}>
                        <ActivityIndicator size="small" color={theme.primary} />
                      </View>
                    )}
                  </>
                )}
              </FocusableSection>
            </View>
          </ScrollView>

        </>
      )}

      {/* Detail modal — tam ekran, alttan slide. Onceki "tepe boslugu" altta
          bekleyen ekranin (folder vs) back arrow'unu gosteriyordu, kafa karistirici. */}
      <Modal
        visible={selectedDetection !== null}
        animationType="slide"
        onRequestClose={() => setSelectedDetection(null)}
      >
        <SafeAreaView className="screen-bg" style={{ flex: 1 }} edges={["top", "left", "right"]}>
          <View
            className="flex-row items-center"
            style={{
              paddingHorizontal: spacing.md,
              paddingVertical: 10,
              gap: 10,
              borderBottomWidth: 1,
              borderBottomColor: theme.primary + "20",
            }}
          >
            <TouchableOpacity
              onPress={() => setSelectedDetection(null)}
              hitSlop={10}
            >
              <Ionicons name="arrow-back" size={22} color={theme.textMain} />
            </TouchableOpacity>
            <Text
              className="text-primary text-[16px] font-bold"
              style={{ flex: 1 }}
              numberOfLines={1}
            >
              {t.disease.detailTitle}
            </Text>
            <TouchableOpacity
              onPress={() =>
                selectedDetection &&
                handleDeleteDetection(selectedDetection.detection_id)
              }
              hitSlop={10}
            >
              <Ionicons
                name="trash-outline"
                size={20}
                color={theme.textSecondary}
              />
            </TouchableOpacity>
          </View>

          {selectedDetection && (
            <DetailModalBody
              detection={selectedDetection}
              theme={theme}
              t={t}
              language={language}
              imageUrl={imageUrls[selectedDetection.detection_id]}
            />
          )}
        </SafeAreaView>
      </Modal>

      {/* Kamera — fullscreen takeover modal (folder context opsiyonel) */}
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

      {/* Folder olusturma modali */}
      <CreateFolderModal
        visible={showCreateFolder}
        theme={theme}
        existingFolders={folders}
        onClose={() => setShowCreateFolder(false)}
        onCreated={(folder) => {
          handleFolderCreated(folder);
          // Folders endpoint'i fresh state ile cek (lastDetectionAt vs)
          refreshFoldersOnly();
        }}
      />

      {/* Folder detay ekrani — fullscreen modal */}
      <Modal
        visible={openFolderId !== null}
        animationType="slide"
        onRequestClose={handleCloseFolder}
        presentationStyle="fullScreen"
      >
        {openFolderId && (
          <SafeAreaProvider>
            <FolderDetailScreen
              folderId={openFolderId}
              theme={theme}
              onClose={handleCloseFolder}
              onDeactivated={(id) => {
                handleFolderDeactivated(id);
                refreshFoldersOnly();
              }}
              onAddPhoto={handleAddPhotoFromFolder}
              onDetectionPress={(d) => {
                // Folder detection -> normal detail modal'a goster
                // FolderDetectionDetail seti subset of DiseaseDetection — cast guvenli
                setSelectedDetection(d as unknown as DiseaseDetection);
              }}
              refreshKey={folderRefreshKey}
              pendingForFolder={pending.filter((p) => p.folderId === openFolderId)}
              retryingPendingId={retryingPendingId}
              onPendingRetry={handleRetryPending}
              onPendingDismiss={handleDismissPending}
            />
          </SafeAreaProvider>
        )}
      </Modal>
    </View>
  );
});

const formatAbsoluteDate = (iso: string, language: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(language === "tr" ? "tr-TR" : "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

interface DetailModalBodyProps {
  detection: DiseaseDetection;
  theme: Theme;
  t: any;
  language: string;
  imageUrl?: string;
}

const DetailModalBody = ({ detection, theme, t, language, imageUrl }: DetailModalBodyProps) => {
  const rawConf = detection.confidence_score ?? detection.confidence;
  const confidencePct =
    rawConf != null ? (rawConf <= 1 ? rawConf * 100 : rawConf) : null;

  const isUncertain =
    detection.confidence_status === "uncertain" ||
    detection.detected_disease === "UNCERTAIN";

  const topTier = confidencePct != null ? getConfidenceTier(confidencePct, theme) : null;

  const [heroAspect, setHeroAspect] = useState<number | null>(null);

  return (
    <ScrollView
      contentContainerStyle={{
        padding: spacing.md,
        gap: spacing.sm,
        paddingBottom: spacing.sm,
        flexGrow: 1,
      }}
      showsVerticalScrollIndicator={false}
    >
      <View
        style={{
          flex: 1,
          minHeight: 213,
          aspectRatio: heroAspect ?? 1,
          alignSelf: "center",
          maxWidth: "100%",
          borderRadius: 14,
          overflow: "hidden",
          backgroundColor: theme.border + "30",
        }}
      >
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={{ width: "100%", height: "100%" }}
            resizeMode="contain"
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
        <Text className="text-secondary text-sm text-center">
          {t.disease.waitingInQueue}
        </Text>
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
          <View
            className="flex-row items-center"
            style={{ gap: spacing.sm }}
          >
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
          <View
            className="surface-bg rounded-lg"
            style={{ padding: spacing.sm }}
          >
            {Object.entries(detection.all_predictions)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 5)
              .map(([label, score], idx) => {
                const pct = score <= 1 ? score * 100 : score;
                const rowTier = getConfidenceTier(pct, theme);
                const isTop = idx === 0;
                return (
                  <View key={label} style={{ marginBottom: idx === 4 ? 0 : 4 }}>
                    <View className="flex-row items-center" style={{ gap: spacing.xs, marginBottom: 1 }}>
                      <Text
                        className="text-primary text-[11px] flex-1"
                        style={{ fontWeight: isTop ? "700" : "500" }}
                        numberOfLines={1}
                      >
                        {label}
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
                    <View
                      style={{
                        height: 2,
                        borderRadius: 1,
                        backgroundColor: rowTier.soft,
                        overflow: "hidden",
                      }}
                    >
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
          <View
            className="surface-bg rounded-lg"
            style={{ padding: spacing.sm }}
          >
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

      <Text className="text-secondary text-[11px] text-center" style={{ marginTop: spacing.xs }}>
        {t.disease.detailCapturedAt}: {formatAbsoluteDate(detection.uploaded_at, language)}
      </Text>
    </ScrollView>
  );
};
