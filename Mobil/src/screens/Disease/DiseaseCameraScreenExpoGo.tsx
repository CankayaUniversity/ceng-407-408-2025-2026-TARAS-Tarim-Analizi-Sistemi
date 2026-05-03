// Expo Go fallback — vision-camera native modulu yok ama expo-camera Expo Go'da
// calisir. Native ile ayni kabuk: top stack (folder banner + ×) + canli on-app
// preview (CameraView) + alt bar (galeri / shutter / flash). Live tarama yok.

import { useState, useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, Pressable, StatusBar, StyleSheet, Alert, ActivityIndicator, Dimensions } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { CameraView, useCameraPermissions } from "expo-camera";
import { PhotoPreview } from "./PhotoPreview";
import { DiseaseScreenProps } from "./types";
import { usePopupMessage } from "../../context/PopupMessageContext";
import { useLanguage } from "../../context/LanguageContext";
import { prepareDiseaseImageForUpload } from "../../utils/diseaseImageProcessing";
import { vs, ms, s } from "../../utils/responsive";

// Native variant'taki CameraView crop overlay'i ile birebir ayni — kullanici
// hangi alanin 1:1 kirpilip backend'e gonderilecegini gorsun. expo-camera
// "cover" preview yapiyor, biz overlay'i ekran orta-karesine baglayinca
// kullanicinin gordugu kirpma alani prepareDiseaseImageForUpload'in cikartacagi
// merkez kareyle ayni hizada kalir.
const VIGNETTE_COLOR = "rgba(0,0,0,0.42)";
const BRACKET_COLOR = "rgba(255,255,255,0.85)";
const BRACKET_LEN = 18;
const BRACKET_WIDTH = 2;
const HINT_AUTOHIDE_MS = 3000;

export const DiseaseCameraScreenExpoGo = ({
  theme,
  onSendForAnalysis,
  onClose,
  folderContext,
}: DiseaseScreenProps) => {
  const { showPopup } = usePopupMessage();
  const { t, language } = useLanguage();
  const insets = useSafeAreaInsets();

  const [activeFolderContext, setActiveFolderContext] = useState(folderContext ?? null);
  useEffect(() => {
    setActiveFolderContext(folderContext ?? null);
  }, [folderContext]);

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [isPreview, setIsPreview] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [showHint, setShowHint] = useState(true);

  useEffect(() => {
    const handle = setTimeout(() => setShowHint(false), HINT_AUTOHIDE_MS);
    return () => clearTimeout(handle);
  }, []);

  const prepareImage = async (uri: string, width?: number, height?: number): Promise<string> => {
    const w = width ?? 0;
    const h = height ?? 0;
    if (w <= 0 || h <= 0) return uri;
    return prepareDiseaseImageForUpload(uri, {
      width: w,
      height: h,
      exportSize: 256,
      quality: 0.82,
    });
  };

  const takePicture = async () => {
    if (!cameraRef.current) {
      showPopup(t.camera.cameraNotReady);
      return;
    }
    setIsPreparing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 1, exif: false });
      if (photo?.uri) {
        const prepared = await prepareImage(photo.uri, photo.width, photo.height);
        setPhotoUri(prepared);
        setIsPreview(true);
      }
    } catch (err) {
      console.log("[ERR] takePicture:", (err as { message?: string })?.message);
      showPopup(t.camera.photoError);
    } finally {
      setIsPreparing(false);
    }
  };

  const pickFromGallery = async () => {
    try {
      setIsPreparing(true);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
        base64: false,
      });
      if (!result.canceled) {
        const asset = result.assets?.[0];
        if (asset?.uri) {
          const prepared = await prepareImage(asset.uri, asset.width, asset.height);
          setPhotoUri(prepared);
          setIsPreview(true);
        }
      }
    } catch (err) {
      console.log("[ERR] gallery:", (err as { message?: string })?.message);
      showPopup(t.camera.galleryError);
    } finally {
      setIsPreparing(false);
    }
  };

  const handleSend = () => {
    if (!photoUri) return;
    Alert.alert(t.camera.sendTitle, t.camera.sendConfirmation, [
      { text: t.common.cancel, style: "cancel" },
      {
        text: t.common.yes,
        onPress: () => {
          if (onSendForAnalysis) onSendForAnalysis(photoUri, activeFolderContext?.folderId ?? null);
          else showPopup(t.camera.sentSuccess);
          setPhotoUri(null);
          setIsPreview(false);
        },
      },
    ]);
  };

  const handleCancelPreview = () => {
    setPhotoUri(null);
    setIsPreview(false);
  };

  if (isPreview && photoUri) {
    return (
      <PhotoPreview
        theme={theme}
        photoUri={photoUri}
        onCancel={handleCancelPreview}
        onSend={handleSend}
        localResult={null}
      />
    );
  }

  // Permission gate — useCameraPermissions hook null donuyorsa loading; granted false
  // ise izin ekrani goster (Native variant ile ayni patern).
  if (!permission) {
    return (
      <View style={[styles.fill, styles.center]}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  if (!permission.granted) {
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
            onPress={() => { requestPermission(); }}
            style={{ backgroundColor: theme.primary, paddingVertical: vs(12), paddingHorizontal: s(20), borderRadius: 10 }}
          >
            <Text style={{ color: "#fff", fontWeight: "700" }}>{t.camera.permissionButton}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const { width: screenW, height: screenH } = Dimensions.get("window");
  const cropSize = Math.min(screenW, screenH);
  const cropLeft = (screenW - cropSize) / 2;
  const cropTop = (screenH - cropSize) / 2;
  const cropRight = cropLeft + cropSize;
  const cropBottom = cropTop + cropSize;

  return (
    <View style={styles.fill}>
      <StatusBar hidden />

      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        flash={flashOn ? "on" : "off"}
      />

      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={{ position: "absolute", left: 0, top: 0, width: screenW, height: cropTop, backgroundColor: VIGNETTE_COLOR }} />
        <View style={{ position: "absolute", left: 0, top: cropBottom, width: screenW, height: screenH - cropBottom, backgroundColor: VIGNETTE_COLOR }} />
        <View style={{ position: "absolute", left: 0, top: cropTop, width: cropLeft, height: cropSize, backgroundColor: VIGNETTE_COLOR }} />
        <View style={{ position: "absolute", left: cropRight, top: cropTop, width: screenW - cropRight, height: cropSize, backgroundColor: VIGNETTE_COLOR }} />
      </View>

      <View pointerEvents="none" style={[styles.cropGuide, { left: cropLeft, top: cropTop, width: cropSize, height: cropSize }]}>
        <View style={[styles.bracket, styles.bracketTL]} />
        <View style={[styles.bracket, styles.bracketTR]} />
        <View style={[styles.bracket, styles.bracketBL]} />
        <View style={[styles.bracket, styles.bracketBR]} />
      </View>

      {showHint && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: cropBottom + vs(14),
            alignSelf: "center",
            backgroundColor: "rgba(0,0,0,0.55)",
            paddingHorizontal: s(12),
            paddingVertical: vs(5),
            borderRadius: 999,
          }}
        >
          <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: ms(12, 0.3), fontWeight: "500" }}>
            {language === "tr" ? "Yaprağı çerçeveye ortalayın" : "Center the leaf in the frame"}
          </Text>
        </View>
      )}

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
          <View style={styles.iconBtn} />
        </View>
      </View>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + vs(16) }]}>
        <TouchableOpacity onPress={pickFromGallery} disabled={isPreparing} style={styles.sideBtn}>
          <MaterialCommunityIcons name="image-outline" size={22} color="#fff" />
        </TouchableOpacity>

        <Pressable
          onPress={takePicture}
          disabled={isPreparing}
          style={({ pressed }) => [
            styles.shutterOuter,
            { transform: [{ scale: pressed ? 0.93 : 1 }], opacity: isPreparing ? 0.5 : 1 },
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
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.25)",
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
  cropGuide: {
    position: "absolute",
  },
  bracket: {
    position: "absolute",
    width: BRACKET_LEN,
    height: BRACKET_LEN,
    borderColor: BRACKET_COLOR,
  },
  bracketTL: { top: 0, left: 0, borderTopWidth: BRACKET_WIDTH, borderLeftWidth: BRACKET_WIDTH },
  bracketTR: { top: 0, right: 0, borderTopWidth: BRACKET_WIDTH, borderRightWidth: BRACKET_WIDTH },
  bracketBL: { bottom: 0, left: 0, borderBottomWidth: BRACKET_WIDTH, borderLeftWidth: BRACKET_WIDTH },
  bracketBR: { bottom: 0, right: 0, borderBottomWidth: BRACKET_WIDTH, borderRightWidth: BRACKET_WIDTH },
});
