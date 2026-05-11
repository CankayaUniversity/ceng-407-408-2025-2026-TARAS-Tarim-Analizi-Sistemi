// Hastalik kamera ekrani — fullscreen modal, vision-camera + react-native-fast-tflite tabanli.
// Bu dosya native modulleri DOGRUDAN import eder; Expo Go'da yuklenirse crash olur.
// DiseaseCameraScreen.tsx (router) tarafindan SADECE non-Expo-Go ortamlarda require edilir.

import { useState, useRef, useEffect } from "react";
import { View, Text, TouchableOpacity, Pressable, StatusBar, StyleSheet, Alert } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Camera } from "react-native-vision-camera";
import { useSharedValue } from "react-native-worklets-core";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { CameraView } from "./CameraView";
import { PhotoPreview } from "./PhotoPreview";
import { LiveScanOverlay } from "./LiveScanOverlay";
import { ScanIntervalRing } from "./ScanIntervalRing";
import { DiseaseScreenProps, LocalInferenceResult } from "./types";
import { useLiveScan } from "../../hooks/useLiveScan";
import { usePopupMessage } from "../../context/PopupMessageContext";
import { useLanguage } from "../../context/LanguageContext";
import { useAuth } from "../../context/AuthContext";
import { prepareDiseaseImageForUpload } from "../../utils/diseaseImageProcessing";
import { loadLeafToggle, saveLeafToggle } from "../../utils/diseaseInference";
import { DEMO_SAMPLE_IMAGES } from "../../utils/demo/demoData";
import { pickSampleImage, resolveSampleImageUri } from "../../utils/demo/demoSampleImage";
import type { LeafBox } from "../../utils/leafDetection";
import { vs, ms, s } from "../../utils/responsive";

const HINT_AUTOHIDE_MS = 3000;

export const DiseaseCameraScreenNative = ({
  theme,
  hasCameraPermission,
  onRequestPermission,
  onSendForAnalysis,
  isActive = true,
  onClose,
  folderContext,
}: DiseaseScreenProps) => {
  const { showPopup } = usePopupMessage();
  const { t } = useLanguage();
  const { dataSource } = useAuth();
  const insets = useSafeAreaInsets();
  const isDemo = dataSource === "demo";
  const showSampleBtn = isDemo && DEMO_SAMPLE_IMAGES.length > 0;

  // folderContext set ise photo submit'i bu folder'a baglar
  // Kullanici banner'daki X ile mid-capture detach edebilir
  const [activeFolderContext, setActiveFolderContext] = useState(folderContext ?? null);
  useEffect(() => {
    setActiveFolderContext(folderContext ?? null);
  }, [folderContext]);

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [isPreview, setIsPreview] = useState(false);
  const cameraRef = useRef<Camera | null>(null);
  const [flashOn, setFlashOn] = useState(false);
  const [isPreparingImage, setIsPreparingImage] = useState(false);
  const [liveMode, setLiveMode] = useState(false);
  const [pendingLocalResult, setPendingLocalResult] = useState<LocalInferenceResult | null>(null);
  const [showHint, setShowHint] = useState(true);
  // Demo: capture aninda taze live result + sample image truth label submit'e iletilir
  const liveResultStampRef = useRef<number>(0);
  const [pendingHintedLabel, setPendingHintedLabel] = useState<string | null>(null);

  // Yaprak cascade toggle — DEFAULT OFF (model henuz hazir degil; sema yanlissa
  // useLiveScan yuklemede null doner ve toggle otomatik OFF'a kayar).
  // Persist via AsyncStorage; load once on mount.
  const [useLeafDetection, setUseLeafDetection] = useState(false);
  const [pendingLeafBox, setPendingLeafBox] = useState<LeafBox | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadLeafToggle().then((on) => {
      if (!cancelled) setUseLeafDetection(on);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const livePauseRef = useSharedValue(false);

  const liveScanActive = isActive && hasCameraPermission && liveMode && !isPreview;
  const {
    liveResult,
    modelLoading,
    frameProcessor,
    currentIntervalMs,
    waitForInflightDrained,
    leafCascadeActive,
  } = useLiveScan(liveScanActive, livePauseRef, useLeafDetection);

  useEffect(() => {
    if (liveResult) liveResultStampRef.current = Date.now();
  }, [liveResult]);

  // Yaprak modeli yuklenemediyse toggle JS state'inde de OFF'a doner
  // (hook AsyncStorage'i guncelledi, biz UI state'ini hizalayalim).
  useEffect(() => {
    if (useLeafDetection && !leafCascadeActive && !modelLoading) {
      // Hook null donduyse useLeafShared.value zaten false; toast goster ve UI'i guncelle
      const timer = setTimeout(() => {
        showPopup("Leaf detector unavailable");
        setUseLeafDetection(false);
      }, 600);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useLeafDetection, leafCascadeActive, modelLoading]);

  const handleToggleLeafDetection = () => {
    const next = !useLeafDetection;
    setUseLeafDetection(next);
    saveLeafToggle(next);
  };

  // Ipucu 3 saniye sonra kaybolsun
  useEffect(() => {
    if (!isActive) return;
    setShowHint(true);
    const handle = setTimeout(() => setShowHint(false), HINT_AUTOHIDE_MS);
    return () => clearTimeout(handle);
  }, [isActive]);

  const prepareImage = async (uri: string, width?: number, height?: number): Promise<string> => {
    const imageWidth = width ?? 0;
    const imageHeight = height ?? 0;
    if (imageWidth <= 0 || imageHeight <= 0) return uri;
    return prepareDiseaseImageForUpload(uri, {
      width: imageWidth,
      height: imageHeight,
    });
  };

  const handlePickSample = async () => {
    try {
      const sample = await pickSampleImage(
        t.disease.sampleSheetTitle,
        t.common.cancel,
      );
      if (!sample) return;
      setIsPreparingImage(true);
      const uri = await resolveSampleImageUri(sample.module);
      if (!uri) {
        showPopup(t.disease.sampleResolveError);
        return;
      }
      const prepared = await prepareDiseaseImageForUpload(uri, {
        width: 256,
        height: 256,
      }).catch(() => uri);
      setPhotoUri(prepared);
      setPendingHintedLabel(sample.label);
      // Sample hint zaten ground truth — live scan'i submit'e ekleme
      setPendingLocalResult(null);
      setIsPreview(true);
    } catch (err) {
      console.log("[ERR] sample pick:", err);
      showPopup(t.disease.sampleResolveError);
    } finally {
      setIsPreparingImage(false);
    }
  };

  const pickFromGallery = async () => {
    try {
      setIsPreparingImage(true);
      // EXIF korunur; HEIC iOS 14+'ta JPEG'e cevrilir; native aspect korunur
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        exif: true,
        preferredAssetRepresentationMode:
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      });
      if (!result.canceled) {
        const asset = result.assets && result.assets[0];
        const uri = asset && asset.uri;
        if (uri) {
          const preparedUri = await prepareImage(uri, asset?.width, asset?.height);
          setPhotoUri(preparedUri);
          setIsPreview(true);
        }
      }
    } catch (err) {
      console.log("[ERR] gallery:", (err as { message?: string })?.message);
      showPopup(t.camera.galleryError);
    } finally {
      setIsPreparingImage(false);
    }
  };

  const takePicture = async () => {
    livePauseRef.value = true;
    setIsPreparingImage(true);
    if (!cameraRef.current) {
      showPopup(t.camera.cameraNotReady);
      setIsPreparingImage(false);
      livePauseRef.value = false;
      return;
    }

    // Ucan worklet inference'inin bitmesini bekle (en fazla 400 ms)
    // Aksi halde Android'de "Camera busy" hatasi alabiliriz
    if (liveMode) {
      await waitForInflightDrained(400);
    }

    let uri: string;
    let photoWidth: number;
    let photoHeight: number;
    try {
      const photo = await cameraRef.current.takePhoto({
        flash: flashOn ? "on" : "off",
        enableShutterSound: false,
      });
      uri = photo.path.startsWith("file://") ? photo.path : `file://${photo.path}`;
      photoWidth = photo.width;
      photoHeight = photo.height;
      console.log("[DISEASE] photo:", { w: photoWidth, h: photoHeight, uri });
    } catch (err) {
      console.log("[ERR] takePhoto:", err);
      showPopup(t.camera.photoError);
      setFlashOn(false);
      setIsPreparingImage(false);
      livePauseRef.value = false;
      return;
    }

    let preparedUri: string;
    try {
      preparedUri = await prepareImage(uri, photoWidth, photoHeight);
    } catch (err) {
      console.log("[ERR] prepareImage:", err);
      // Fotograf alindi ama isleme basarisiz — yine de orijinali kullan ki kullanici takilmasin
      preparedUri = uri;
    }

    setPhotoUri(preparedUri);
    if (liveMode && liveResult?.status === "confident") {
      setPendingLocalResult(liveResult);
    }
    // Yaprak cascade aktifse ve son live frame'de kutu varsa preview'da maskeyi goster
    if (liveMode && useLeafDetection && leafCascadeActive && liveResult?.leafBox) {
      setPendingLeafBox(liveResult.leafBox);
    } else {
      setPendingLeafBox(null);
    }
    setIsPreview(true);
    setFlashOn(false);
    setIsPreparingImage(false);
    livePauseRef.value = false;
  };

  const handleToggleLiveScan = () => {
    setLiveMode((prev) => !prev);
  };

  const handleSend = () => {
    if (!photoUri) return;
    Alert.alert(t.camera.sendTitle, t.camera.sendConfirmation, [
      { text: t.common.cancel, style: "cancel" },
      {
        text: t.common.yes,
        onPress: () => {
          // folderId varsa parent submit'i bu klasore baglar; yoksa general
          if (onSendForAnalysis) {
            // Demo extras backend tarafindan yok sayilir; tazelik CAPTURE aninda kontrol edilir
            const liveFreshAtCapture =
              pendingLocalResult &&
              pendingLocalResult.status === "confident" &&
              Date.now() - liveResultStampRef.current <= 1500;
            const extras = isDemo
              ? {
                  hintedLabel: pendingHintedLabel,
                  liveScanResult: liveFreshAtCapture
                    ? {
                        className: pendingLocalResult.className,
                        confidence: pendingLocalResult.confidence,
                        allProbs: pendingLocalResult.allProbs,
                        timestamp: Date.now(),
                      }
                    : null,
                }
              : undefined;
            onSendForAnalysis(
              photoUri,
              activeFolderContext?.folderId ?? null,
              extras,
            );
          } else {
            showPopup(t.camera.sentSuccess);
          }
          setPhotoUri(null);
          setIsPreview(false);
          setPendingLocalResult(null);
          setPendingHintedLabel(null);
        },
      },
    ]);
  };

  const handleCancelPreview = () => {
    setPhotoUri(null);
    setIsPreview(false);
    setPendingLocalResult(null);
    setPendingLeafBox(null);
    setPendingHintedLabel(null);
  };

  // ── Permission ekrani ────────────────────────────────────────────────
  if (!hasCameraPermission) {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: theme.background, padding: s(24) }]}>
        <Ionicons name="camera-outline" size={64} color={theme.primary} />
        <Text style={{ color: theme.textMain, fontSize: ms(20, 0.3), fontWeight: "700", marginTop: vs(16) }}>
          {t.camera.permissionTitle}
        </Text>
        <Text style={{ color: theme.textSecondary, fontSize: ms(14, 0.3), marginTop: vs(8), textAlign: "center" }}>
          {t.camera.systemPermissionDescription}
        </Text>
        <View style={{ flexDirection: "row", gap: s(12), marginTop: vs(24) }}>
          <TouchableOpacity
            onPress={onClose}
            style={{ backgroundColor: theme.surface, paddingVertical: vs(12), paddingHorizontal: s(20), borderRadius: 10, borderWidth: 1, borderColor: theme.textSecondary + "40" }}
          >
            <Text style={{ color: theme.textMain, fontWeight: "600" }}>{t.camera.closeButton}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { onRequestPermission(); }}
            style={{ backgroundColor: theme.primary, paddingVertical: vs(12), paddingHorizontal: s(20), borderRadius: 10 }}
          >
            <Text style={{ color: "#fff", fontWeight: "700" }}>{t.camera.permissionButton}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Preview ekrani ────────────────────────────────────────────────────
  if (isPreview && photoUri) {
    return (
      <PhotoPreview
        theme={theme}
        photoUri={photoUri}
        onCancel={handleCancelPreview}
        onSend={handleSend}
        localResult={pendingLocalResult}
        leafBox={pendingLeafBox}
      />
    );
  }

  // ── Canli kamera ekrani ───────────────────────────────────────────────
  return (
    <View style={styles.fill}>
      <StatusBar hidden />

      <CameraView
        theme={theme}
        cameraRef={cameraRef}
        isActive={isActive && !isPreview}
        frameProcessor={frameProcessor}
        showHint={showHint}
      />

      {/* topStack: banner + topBar'i tek absolute container'da tutuyor — folder
          modunda topBar'in status bar notch'i altina kacmasini onler. */}
      <View style={styles.topStack}>
        {activeFolderContext && (
          <View
            style={[
              styles.folderBanner,
              { paddingTop: insets.top + vs(8), backgroundColor: theme.primary + "E0" },
            ]}
          >
            <Ionicons name="folder" size={16} color="#fff" />
            <Text style={styles.folderBannerLabel}>{t.disease.folderCameraAddingTo}</Text>
            <Text style={styles.folderBannerName} numberOfLines={1}>
              {activeFolderContext.folderName}
            </Text>
            <TouchableOpacity
              onPress={() => setActiveFolderContext(null)}
              hitSlop={10}
              style={styles.folderBannerClose}
            >
              <Ionicons name="close" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        )}

        <View
          style={[
            styles.topBar,
            { paddingTop: activeFolderContext ? vs(8) : insets.top + vs(8) },
          ]}
        >
          <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.iconBtn}>
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>

          <View style={styles.topBarRight}>
            <TouchableOpacity
              onPress={handleToggleLeafDetection}
              hitSlop={10}
              style={[
                styles.iconBtn,
                useLeafDetection && leafCascadeActive && { backgroundColor: theme.primary + "40" },
              ]}
            >
              <Ionicons
                name={useLeafDetection ? "leaf" : "leaf-outline"}
                size={20}
                color={
                  useLeafDetection
                    ? leafCascadeActive
                      ? theme.primary ?? "#22C55E"
                      : "#F59E0B"
                    : "#fff"
                }
              />
            </TouchableOpacity>

            <Pressable onPress={handleToggleLiveScan} hitSlop={10} style={styles.liveToggleWrap}>
              {liveMode ? (
                <ScanIntervalRing
                  intervalMs={currentIntervalMs}
                  size={40}
                  strokeWidth={2.5}
                  trackColor="rgba(255,255,255,0.18)"
                  progressColor={theme.primary}
                  active={liveScanActive}
                >
                  <View
                    style={[
                      styles.liveToggleInner,
                      { backgroundColor: theme.primary + "30" },
                    ]}
                  >
                    <Ionicons name="scan" size={18} color={theme.primary ?? "#fff"} />
                  </View>
                </ScanIntervalRing>
              ) : (
                <View style={styles.iconBtn}>
                  <Ionicons name="scan-outline" size={20} color="#fff" />
                </View>
              )}
            </Pressable>
          </View>
        </View>
      </View>

      {/* Canli tarama katmani — alt bar'in hemen üzerinde */}
      {liveMode && (
        <LiveScanOverlay
          result={liveResult}
          modelLoading={modelLoading}
          theme={theme}
          bottomOffset={insets.bottom + vs(120)}
        />
      )}

      {/* Alt bar — galeri / (sample) / shutter / flash */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + vs(16) }]}>
        <View style={styles.bottomLeftCluster}>
          <TouchableOpacity onPress={pickFromGallery} style={styles.sideBtn}>
            <MaterialCommunityIcons name="image-outline" size={22} color="#fff" />
          </TouchableOpacity>
          {showSampleBtn && (
            <TouchableOpacity onPress={handlePickSample} style={styles.samplePill}>
              <Ionicons name="sparkles" size={14} color="#fff" />
              <Text style={styles.samplePillLabel}>{t.disease.sampleButton}</Text>
            </TouchableOpacity>
          )}
        </View>

        <Pressable
          onPress={takePicture}
          disabled={isPreparingImage}
          style={({ pressed }) => [
            styles.shutterOuter,
            { transform: [{ scale: pressed ? 0.93 : 1 }], opacity: isPreparingImage ? 0.5 : 1 },
          ]}
        >
          <View style={styles.shutterInner} />
        </Pressable>

        <TouchableOpacity onPress={() => setFlashOn((v) => !v)} style={styles.sideBtn}>
          <Ionicons
            name={flashOn ? "flash" : "flash-outline"}
            size={22}
            color={flashOn ? "#F59E0B" : "#fff"}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#000" },
  center: { alignItems: "center", justifyContent: "center" },

  topStack: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  topBarRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  liveToggleWrap: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  liveToggleInner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },

  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 28,
    paddingTop: 16,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sideBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  bottomLeftCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  samplePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  samplePillLabel: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  shutterOuter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#fff",
  },
  folderBanner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingBottom: 8,
    gap: 8,
  },
  folderBannerLabel: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 12,
    fontWeight: "600",
  },
  folderBannerName: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
    flex: 1,
  },
  folderBannerClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.25)",
  },
});
