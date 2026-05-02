// Kamera görünümü — vision-camera tabanli, "contain" preview + vignette overlay
// Tum sensor goruntusu ekranda (letterbox) gosterilir; vignette inference + upload icin
// kullanilan center 1:1 kirpma bolgesini netlestirir. Kose brackets bu bolgeyi anchor'lar.

import { useMemo } from "react";
import { View, Text, StyleSheet, Dimensions, ActivityIndicator } from "react-native";
import { Camera, useCameraDevice, useCameraFormat } from "react-native-vision-camera";
import type { CameraDeviceFormat, ReadonlyFrameProcessor } from "react-native-vision-camera";
import { Theme } from "../../utils/theme";
import { useLanguage } from "../../context/LanguageContext";
import { s, vs, ms } from "../../utils/responsive";

export interface CameraViewVCProps {
  theme: Theme;
  cameraRef: React.RefObject<Camera | null>;
  isActive: boolean;
  frameProcessor?: ReadonlyFrameProcessor;
  showHint: boolean;
}

const VIGNETTE_COLOR = "rgba(0,0,0,0.42)";
const BRACKET_COLOR = "rgba(255,255,255,0.85)";
const BRACKET_LEN = 18;
const BRACKET_WIDTH = 2;

interface Layout {
  // Screen dims
  screenW: number;
  screenH: number;
  // Letterbox-fit displayed video rect (in screen px)
  videoLeft: number;
  videoTop: number;
  videoW: number;
  videoH: number;
  // Center 1:1 inference/upload crop rect (in screen px)
  cropLeft: number;
  cropTop: number;
  cropSize: number;
}

// Kamera format'i landscape sensor boyutlarini verir (Android'de her zaman; iOS'ta da
// genelde oyle). Portrait gosterimde swap edip bisey hesapliyoruz.
function computeLayout(format: CameraDeviceFormat | null | undefined): Layout {
  const { width: screenW, height: screenH } = Dimensions.get("window");

  // Frame'in portrait gosterilen boyutlari (landscape sensor -> portrait display)
  // Format yoksa 9:16 varsayim (1280x720) ile bootstrap
  const fmtLandscapeW = format?.videoWidth ?? 1280;
  const fmtLandscapeH = format?.videoHeight ?? 720;
  // Portrait icin smaller-dim genislik, larger-dim yukseklik
  const frameW = Math.min(fmtLandscapeW, fmtLandscapeH);
  const frameH = Math.max(fmtLandscapeW, fmtLandscapeH);

  // Contain = her iki boyut da ekrana sigsin diye en kucuk olcek
  const scale = Math.min(screenW / frameW, screenH / frameH);
  const videoW = frameW * scale;
  const videoH = frameH * scale;
  const videoLeft = (screenW - videoW) / 2;
  const videoTop = (screenH - videoH) / 2;

  // Center 1:1 crop = displayed video icindeki en buyuk kare
  const cropSize = Math.min(videoW, videoH);
  const cropLeft = videoLeft + (videoW - cropSize) / 2;
  const cropTop = videoTop + (videoH - cropSize) / 2;

  return { screenW, screenH, videoLeft, videoTop, videoW, videoH, cropLeft, cropTop, cropSize };
}

export const CameraView = ({
  theme,
  cameraRef,
  isActive,
  frameProcessor,
  showHint,
}: CameraViewVCProps) => {
  const { t, language } = useLanguage();
  const device = useCameraDevice("back");

  // 720p önizleme — frame processor için yeterli, enerjiyi korur
  const format = useCameraFormat(device, [
    { videoResolution: { width: 1280, height: 720 } },
    { photoResolution: { width: 3024, height: 3024 } },
  ]);

  const layout = useMemo(() => computeLayout(format), [format]);

  if (!device) {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: "#000" }]}>
        <ActivityIndicator color={theme.primary} />
        <Text style={{ color: "rgba(255,255,255,0.7)", marginTop: vs(8), fontSize: ms(13, 0.3) }}>
          {t.camera.liveCameraUnavailable}
        </Text>
      </View>
    );
  }

  const { cropLeft, cropTop, cropSize, screenW, screenH } = layout;
  const cropRight = cropLeft + cropSize;
  const cropBottom = cropTop + cropSize;

  return (
    <View style={styles.fill}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        format={format}
        isActive={isActive}
        photo={true}
        frameProcessor={frameProcessor}
        enableZoomGesture={false}
        resizeMode="contain"
      />

      {/* Vignette — crop bolgesi disindaki tum alani karart */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {/* Top */}
        <View style={{ position: "absolute", left: 0, top: 0, width: screenW, height: cropTop, backgroundColor: VIGNETTE_COLOR }} />
        {/* Bottom */}
        <View style={{ position: "absolute", left: 0, top: cropBottom, width: screenW, height: screenH - cropBottom, backgroundColor: VIGNETTE_COLOR }} />
        {/* Left (sadece crop satirinda) */}
        <View style={{ position: "absolute", left: 0, top: cropTop, width: cropLeft, height: cropSize, backgroundColor: VIGNETTE_COLOR }} />
        {/* Right (sadece crop satirinda) */}
        <View style={{ position: "absolute", left: cropRight, top: cropTop, width: screenW - cropRight, height: cropSize, backgroundColor: VIGNETTE_COLOR }} />
      </View>

      {/* Köşe brackets — vignette'in bos birakttigi crop bolgesi corner'lari */}
      <View pointerEvents="none" style={[styles.cropGuide, { left: cropLeft, top: cropTop, width: cropSize, height: cropSize }]}>
        <View style={[styles.bracket, styles.bracketTL]} />
        <View style={[styles.bracket, styles.bracketTR]} />
        <View style={[styles.bracket, styles.bracketBL]} />
        <View style={[styles.bracket, styles.bracketBR]} />
      </View>

      {/* Kısa ipucu — crop bolgesinin altinda, mount'tan sonra kaybolur */}
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
    </View>
  );
};

// Legacy export — eski DiseaseCameraScreen importlarını bozmamak için
export const canUseCameraComponent = true;

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject, backgroundColor: "#000" },
  center: { alignItems: "center", justifyContent: "center" },
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
