// Hastalik kamera ekrani — fullscreen modal, vision-camera + react-native-fast-tflite tabanli
// Bu dosya native modulleri DOGRUDAN import eder; Expo Go'da yuklenirse crash olur.
// DiseaseCameraScreen.tsx (router) tarafindan SADECE non-Expo-Go ortamlarda require edilir.
//
// Üst bar: [× Kapat] [Fotoğraf | Canlı] [⚡/Tarama Halkasi]
// Orta: Kamera + köse brackets + opsiyonel canli tarama pili
// Alt bar: [Galeri] [Büyük shutter] [⚡ Flaş]

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
import { prepareDiseaseImageForUpload } from "../../utils/diseaseImageProcessing";
import { loadLeafToggle, saveLeafToggle } from "../../utils/diseaseInference";
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
}: DiseaseScreenProps) => {
  const { showPopup } = usePopupMessage();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [isPreview, setIsPreview] = useState(false);
  const cameraRef = useRef<Camera | null>(null);
  const [flashOn, setFlashOn] = useState(false);
  const [isPreparingImage, setIsPreparingImage] = useState(false);
  const [liveMode, setLiveMode] = useState(false);
  const [pendingLocalResult, setPendingLocalResult] = useState<LocalInferenceResult | null>(null);
  const [showHint, setShowHint] = useState(true);

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
    inferenceMs,
    currentIntervalMs,
    waitForInflightDrained,
    leafCascadeActive,
  } = useLiveScan(liveScanActive, livePauseRef, useLeafDetection);

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
      exportSize: 256,
      quality: 0.82,
    });
  };

  const pickFromGallery = async () => {
    try {
      setIsPreparingImage(true);
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
        base64: false,
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

  const handleToggleLiveMode = (next: boolean) => {
    if (next === liveMode) return;
    setLiveMode(next);
  };

  const handleSend = () => {
    if (!photoUri) return;
    Alert.alert(t.camera.sendTitle, t.camera.sendConfirmation, [
      { text: t.common.cancel, style: "cancel" },
      {
        text: t.common.yes,
        onPress: () => {
          if (onSendForAnalysis) onSendForAnalysis(photoUri);
          else showPopup(t.camera.sentSuccess);
          setPhotoUri(null);
          setIsPreview(false);
          setPendingLocalResult(null);
        },
      },
    ]);
  };

  const handleCancelPreview = () => {
    setPhotoUri(null);
    setIsPreview(false);
    setPendingLocalResult(null);
    setPendingLeafBox(null);
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

      {/* Üst bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + vs(8), paddingBottom: vs(10) }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.iconBtn}>
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>
          {/* Yaprak cascade toggle (debug) — default OFF, model hazirlandiginda aktif olur */}
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
        </View>

        <View style={styles.segmented}>
          <Pressable
            onPress={() => handleToggleLiveMode(false)}
            style={[styles.segment, !liveMode && { backgroundColor: theme.primary }]}
          >
            <Text style={[styles.segmentText, { color: !liveMode ? "#fff" : "rgba(255,255,255,0.7)" }]}>
              {t.camera.photoMode}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => handleToggleLiveMode(true)}
            style={[styles.segment, liveMode && { backgroundColor: theme.primary }]}
          >
            <Text style={[styles.segmentText, { color: liveMode ? "#fff" : "rgba(255,255,255,0.7)" }]}>
              {t.camera.liveMode}
            </Text>
          </Pressable>
        </View>

        {liveMode && inferenceMs != null ? (
          <ScanIntervalRing
            intervalMs={currentIntervalMs}
            size={52}
            strokeWidth={3}
            trackColor="rgba(255,255,255,0.18)"
            progressColor={theme.primary}
            active={liveScanActive}
          >
            <View style={styles.timerInner}>
              <Text style={styles.timerText}>{inferenceMs}</Text>
              <Text style={styles.timerUnit}>ms</Text>
            </View>
          </ScanIntervalRing>
        ) : (
          <View style={styles.iconBtn} />
        )}
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

      {/* Alt bar — galeri / shutter / flash */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + vs(16) }]}>
        <TouchableOpacity onPress={pickFromGallery} style={styles.sideBtn}>
          <MaterialCommunityIcons name="image-outline" size={22} color="#fff" />
        </TouchableOpacity>

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

  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  timerInner: {
    alignItems: "center",
    justifyContent: "center",
  },
  timerText: {
    color: "rgba(255,255,255,0.95)",
    fontSize: 13,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    lineHeight: 14,
  },
  timerUnit: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 8,
    fontWeight: "600",
    lineHeight: 9,
    marginTop: 1,
  },
  segmented: {
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.35)",
    borderRadius: 999,
    padding: 3,
  },
  segment: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: "600",
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
});
