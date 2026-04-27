// Kamera gorunumu - canli kamera, galeri ve flas kontrolleri
// Props: theme, cameraRef, flashOn, isActive, onPickFromGallery, onTakePicture, onToggleFlash
import { useState } from "react";
import { View, Text, TouchableOpacity, LayoutChangeEvent } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { CameraViewProps } from "./types";
import { useLanguage } from "../../context/LanguageContext";
import { s, vs, ms } from "../../utils/responsive";

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
      className="flex-1 rounded-[20px] overflow-hidden"
      style={{
        borderWidth: 3,
        borderColor: theme.primary,
        elevation: 8,
        shadowColor: theme.shadowColor,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      }}
      onLayout={onLayoutContainer}
    >
      {isActive && canUseCameraComponent ? (
        <CameraComponent
          ref={(r: any) => {
            cameraRef.current = r;
          }}
          style={{ flex: 1 }}
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
        <View className="flex-1 center">
          <Text className="text-secondary">
            {t.camera.liveCameraUnavailable}
          </Text>
          <Text
            className="text-secondary"
            style={{ marginTop: vs(6) }}
          >
            {t.camera.liveCameraMessage}
          </Text>
        </View>
      ) : (
        <View className="flex-1 bg-black" />
      )}

      {frameSize > 0 && (
        <View
          pointerEvents="none"
          className="overlay-fill"
        >
          <View
            style={{
              width: frameSize,
              height: frameSize,
              borderWidth: 2,
              borderColor: theme.primary,
              borderRadius: 12,
              backgroundColor: "transparent",
            }}
          />
          <Text
            className="font-semibold"
            style={{
              marginTop: vs(10),
              paddingHorizontal: s(10),
              paddingVertical: vs(4),
              borderRadius: 8,
              backgroundColor: "rgba(0,0,0,0.5)",
              color: theme.textOnPrimary,
              fontSize: ms(12, 0.3),
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
        className="absolute center rounded-xl"
        style={{
          left: s(16),
          bottom: s(16),
          width: s(56),
          height: s(56),
          backgroundColor: theme.surface,
          borderWidth: 1,
          borderColor: theme.primary + "44",
        }}
        activeOpacity={0.8}
      >
        <MaterialCommunityIcons name="image" size={26} color={theme.primary} />
      </TouchableOpacity>

      {/* Cek butonu */}
      <TouchableOpacity
        onPress={onTakePicture}
        className="absolute self-center center"
        style={{
          bottom: s(12),
          width: s(78),
          height: s(78),
          borderRadius: 39,
        }}
        activeOpacity={0.8}
      >
        <View
          className="center"
          style={{
            width: s(78),
            height: s(78),
            borderRadius: 39,
            borderWidth: 6,
            borderColor: theme.surface,
          }}
        >
          <View
            className="bg-porcelain dark:bg-carbonBlack"
            style={{
              width: s(56),
              height: s(56),
              borderRadius: 28,
            }}
          />
        </View>
      </TouchableOpacity>

      {/* Flas butonu */}
      <TouchableOpacity
        onPress={onToggleFlash}
        className="absolute center rounded-xl"
        style={{
          right: s(16),
          bottom: s(16),
          width: s(50),
          height: s(50),
          backgroundColor: theme.surface,
          borderWidth: 1,
          borderColor: flashOn ? theme.primary : theme.primary + "44",
        }}
        activeOpacity={0.8}
      >
        <MaterialCommunityIcons
          name={flashOn ? "flash" : "flash-off"}
          size={22}
          color={flashOn ? theme.primary : theme.textMain}
        />
      </TouchableOpacity>
    </View>
  );
};
