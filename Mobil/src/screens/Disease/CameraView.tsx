// Kamera gorunumu - canli kamera, galeri ve flas kontrolleri
// Props: theme, cameraRef, flashOn, isActive, onPickFromGallery, onTakePicture, onToggleFlash
import { useState } from "react";
import { View, Text, TouchableOpacity, LayoutChangeEvent } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { appStyles } from "../../styles";
import { CameraViewProps } from "./types";
import { useLanguage } from "../../context/LanguageContext";

const _ExpoCamera: any = require("expo-camera");

// Kamera componentini bul
let RenderableCamera: any = null;
if (_ExpoCamera) {
  if (typeof _ExpoCamera.Camera === "function")
    RenderableCamera = _ExpoCamera.Camera;
  else if (typeof _ExpoCamera.CameraView === "function")
    RenderableCamera = _ExpoCamera.CameraView;
  else if (_ExpoCamera.default && typeof _ExpoCamera.default === "function")
    RenderableCamera = _ExpoCamera.default;
  else if (typeof _ExpoCamera === "function") RenderableCamera = _ExpoCamera;
}

export const CameraComponent: any = RenderableCamera;
export const ExpoCamera = _ExpoCamera;

export const canUseCameraComponent = Boolean(
  CameraComponent &&
  (typeof CameraComponent === "function" ||
    typeof CameraComponent.render === "function" ||
    CameraComponent.prototype),
);

export const CameraView = ({
  theme,
  cameraRef,
  flashOn,
  isActive,
  onPickFromGallery,
  onTakePicture,
  onToggleFlash,
}: CameraViewProps) => {
  const { t, language } = useLanguage();
  const [frameSize, setFrameSize] = useState(0);

  const onLayoutContainer = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    const side = Math.max(0, Math.min(width, height) - 28);
    setFrameSize(side);
  };

  return (
    <View
      style={[appStyles.cameraBorderContainer, { borderColor: theme.accent }]}
      onLayout={onLayoutContainer}
    >
      {isActive && canUseCameraComponent ? (
        <CameraComponent
          ref={(r: any) => {
            cameraRef.current = r;
          }}
          style={appStyles.cameraView}
          type={"back"}
          flashMode={
            ExpoCamera?.FlashMode
              ? flashOn
                ? ExpoCamera.FlashMode.on
                : ExpoCamera.FlashMode.off
              : flashOn
                ? "on"
                : "off"
          }
        />
      ) : isActive ? (
        <View
          style={[
            appStyles.cameraView,
            { alignItems: "center", justifyContent: "center" },
          ]}
        >
          <Text style={{ color: theme.textSecondary }}>
            {t.camera.liveCameraUnavailable}
          </Text>
          <Text style={{ color: theme.textSecondary, marginTop: 6 }}>
            {t.camera.liveCameraMessage}
          </Text>
        </View>
      ) : (
        <View style={[appStyles.cameraView, { backgroundColor: "#000" }]} />
      )}

      {frameSize > 0 && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <View
            style={{
              width: frameSize,
              height: frameSize,
              borderWidth: 2,
              borderColor: theme.accent,
              borderRadius: 12,
              backgroundColor: "transparent",
            }}
          />
          <Text
            style={{
              marginTop: 10,
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 8,
              backgroundColor: "rgba(0,0,0,0.5)",
              color: "#fff",
              fontSize: 12,
              fontWeight: "600",
            }}
          >
            {language === "tr"
              ? "Yaprağı kare çerçeveye ortalayın"
              : "Center the leaf inside the square"}
          </Text>
        </View>
      )}

      {/* Galeri butonu */}
      <TouchableOpacity
        onPress={onPickFromGallery}
        style={{
          position: "absolute",
          left: 16,
          bottom: 16,
          width: 56,
          height: 56,
          borderRadius: 12,
          backgroundColor: theme.surface,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 1,
          borderColor: theme.accent + "44",
        }}
        activeOpacity={0.8}
      >
        <MaterialCommunityIcons name="image" size={26} color={theme.accent} />
      </TouchableOpacity>

      {/* Cek butonu */}
      <TouchableOpacity
        onPress={onTakePicture}
        style={{
          position: "absolute",
          alignSelf: "center",
          bottom: 12,
          width: 78,
          height: 78,
          borderRadius: 39,
          alignItems: "center",
          justifyContent: "center",
        }}
        activeOpacity={0.8}
      >
        <View
          style={{
            width: 78,
            height: 78,
            borderRadius: 39,
            borderWidth: 6,
            borderColor: theme.surface,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: theme.background,
            }}
          />
        </View>
      </TouchableOpacity>

      {/* Flas butonu */}
      <TouchableOpacity
        onPress={onToggleFlash}
        style={{
          position: "absolute",
          right: 16,
          bottom: 16,
          width: 50,
          height: 50,
          borderRadius: 12,
          backgroundColor: theme.surface,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 1,
          borderColor: flashOn ? theme.accent : theme.accent + "44",
        }}
        activeOpacity={0.8}
      >
        <MaterialCommunityIcons
          name={flashOn ? "flash" : "flash-off"}
          size={22}
          color={flashOn ? theme.accent : theme.text}
        />
      </TouchableOpacity>
    </View>
  );
};
