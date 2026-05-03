// Expo Go fallback — vision-camera + react-native-fast-tflite native modulleri yok
// AMA fotograf cekme ve galeri secimi yine de calismali (sistem kamera + ImagePicker)
//
// Gorunum: Native ekranla ayni kabuk (top bar [× kapat] + alt bar shutter/gallery/flash)
// Farklar:
//   - Canli tarama yok (toggle de yok) — ExpoGo'da native modul mevcut degil
//   - Kamera preview yerine "shutter'a bas" yer tutucusu
//   - Shutter: ImagePicker.launchCameraAsync (sistem kamerasi acilir)
//   - Local inference yok — backend'e gonderilince sunucu tarafinda analiz edilir

import { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, Pressable, StatusBar, StyleSheet, Alert } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { PhotoPreview } from "./PhotoPreview";
import { DiseaseScreenProps } from "./types";
import { usePopupMessage } from "../../context/PopupMessageContext";
import { useLanguage } from "../../context/LanguageContext";
import { prepareDiseaseImageForUpload } from "../../utils/diseaseImageProcessing";
import { vs, ms, s } from "../../utils/responsive";

export const DiseaseCameraScreenExpoGo = ({
  theme,
  onSendForAnalysis,
  onClose,
  folderContext,
}: DiseaseScreenProps) => {
  const { showPopup } = usePopupMessage();
  const { t, language } = useLanguage();
  const insets = useSafeAreaInsets();

  // Native ile ayni — banner'in X'i mid-capture detach icin
  const [activeFolderContext, setActiveFolderContext] = useState(folderContext ?? null);
  useEffect(() => {
    setActiveFolderContext(folderContext ?? null);
  }, [folderContext]);

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [isPreview, setIsPreview] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);

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

  const launchCamera = async () => {
    try {
      setIsPreparing(true);
      const result = await ImagePicker.launchCameraAsync({
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
      console.log("[ERR] launchCamera:", (err as { message?: string })?.message);
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

  // ── Preview ────────────────────────────────────────────────────────
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

  // ── Kamera kabuğu (preview yerine yer tutucu) ──────────────────────
  return (
    <View style={styles.fill}>
      <StatusBar hidden />

      {/* Yer tutucu — gercek kamera onizlemesi yerine */}
      <View style={styles.placeholder}>
        <Ionicons name="camera-outline" size={64} color="rgba(255,255,255,0.45)" />
        <Text style={styles.placeholderTitle}>
          {language === "tr" ? "Sistem Kamerasi" : "System Camera"}
        </Text>
        <Text style={styles.placeholderHint}>
          {language === "tr"
            ? "Shutter'a basarak fotograf cek\nveya galeriden sec"
            : "Tap shutter to capture\nor pick from gallery"}
        </Text>
      </View>

      {/* Top stack — folder banner (varsa) + topBar tek absolute container icinde */}
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

      {/* Bottom bar — galeri / shutter / flash */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + vs(16) }]}>
        <TouchableOpacity onPress={pickFromGallery} disabled={isPreparing} style={styles.sideBtn}>
          <MaterialCommunityIcons name="image-outline" size={22} color="#fff" />
        </TouchableOpacity>

        <Pressable
          onPress={launchCamera}
          disabled={isPreparing}
          style={({ pressed }) => [
            styles.shutterOuter,
            { transform: [{ scale: pressed ? 0.93 : 1 }], opacity: isPreparing ? 0.5 : 1 },
          ]}
        >
          <View style={styles.shutterInner} />
        </Pressable>

        {/* Flash sistem kameranin kendi UI'sinda — burada disable */}
        <View style={[styles.sideBtn, { opacity: 0.3 }]}>
          <Ionicons name="flash-outline" size={22} color="#fff" />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#0a0a0a" },

  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: s(32),
  },
  placeholderTitle: {
    color: "rgba(255,255,255,0.85)",
    fontSize: ms(18, 0.3),
    fontWeight: "700",
    marginTop: vs(14),
  },
  placeholderHint: {
    color: "rgba(255,255,255,0.55)",
    fontSize: ms(13, 0.3),
    marginTop: vs(6),
    textAlign: "center",
    lineHeight: ms(19, 0.3),
  },

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
});
