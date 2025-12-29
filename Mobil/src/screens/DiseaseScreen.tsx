import React, { useState, useRef } from "react";
import { View, Text, TouchableOpacity, Image, Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { PermissionResponse } from "expo-camera";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { appStyles } from '../styles';
import { Theme } from '../types';

const _ExpoCamera: any = require("expo-camera");

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
const CameraComponent: any = RenderableCamera;

interface DiseaseScreenProps {
  theme: Theme;
  permission: PermissionResponse | null;
  onRequestPermission: () => void;
  onSendForAnalysis?: (uri: string) => void;
}

export const DiseaseScreen = ({
  theme,
  permission,
  onRequestPermission,
  onSendForAnalysis,
}: DiseaseScreenProps) => {
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [isPreview, setIsPreview] = useState(false);

  const pickFromGallery = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        quality: 0.7,
        base64: false,
      });
      if (!result.canceled) {
        const uri = result.assets && result.assets[0] && result.assets[0].uri;
        if (uri) {
          setPhotoUri(uri);
          setIsPreview(true);
        }
      }
    } catch (err) {
      Alert.alert("Hata", "Galeri resmi seçilemedi. Lütfen tekrar deneyin.");
    }
  };

  if (!permission) {
    return (
      <View
        style={[appStyles.placeholder, { backgroundColor: theme.background }]}
      >
        <Text style={[appStyles.placeholderText, { color: theme.text }]}>
          Kamera İzni
        </Text>
        <TouchableOpacity
          style={[
            appStyles.primaryButton,
            { backgroundColor: theme.accent, marginTop: 24 },
          ]}
          onPress={onRequestPermission}
        >
          <Text
            style={[appStyles.primaryButtonText, { color: theme.background }]}
          >
            İzin Ver
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View
        style={[appStyles.placeholder, { backgroundColor: theme.background }]}
      >
        <Text style={[appStyles.placeholderText, { color: theme.text }]}>
          Kamera Erişimi Reddedildi
        </Text>
        <Text
          style={[
            appStyles.placeholderSub,
            { color: theme.textSecondary, marginBottom: 24 },
          ]}
        >
          Bu özelliği kullanmak için cihaz ayarlarında kamera izinlerini
          etkinleştirin.
        </Text>
        <TouchableOpacity
          style={[appStyles.primaryButton, { backgroundColor: theme.accent }]}
          onPress={onRequestPermission}
        >
          <Text
            style={[appStyles.primaryButtonText, { color: theme.background }]}
          >
            Yeniden Dene
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  const cameraRef = useRef<any>(null);
  const [flashOn, setFlashOn] = useState(false);
  const [flashOverlayVisible, setFlashOverlayVisible] = useState(false);

  const canUseCameraComponent = Boolean(
    CameraComponent &&
    (typeof CameraComponent === "function" ||
      typeof CameraComponent.render === "function" ||
      CameraComponent.prototype),
  );
  if (!canUseCameraComponent) {
    if (typeof __DEV__ !== "undefined" && __DEV__)
      console.warn(
        "DiseaseScreen: Camera component not available, falling back to ImagePicker. ExpoCamera keys:",
        Object.keys(_ExpoCamera || {}),
        "selected:",
        CameraComponent ? CameraComponent.name || "<component>" : "<none>",
      );
  }

  const triggerFlashOverlay = () => {
    setFlashOverlayVisible(true);
    setTimeout(() => setFlashOverlayVisible(false), 180);
  };

  const takePicture = async () => {
    try {
      triggerFlashOverlay();

      if (canUseCameraComponent) {
        if (!cameraRef.current) {
          Alert.alert("Hata", "Kamera hazır değil.");
          return;
        }
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.7,
          skipProcessing: true,
        });
        if (photo?.uri) {
          setPhotoUri(photo.uri);
          setIsPreview(true);
        }
      } else {
        const result = await ImagePicker.launchCameraAsync({
          quality: 0.7,
          base64: false,
        });
        if (!result.canceled) {
          const uri = result.assets && result.assets[0] && result.assets[0].uri;
          if (uri) {
            setPhotoUri(uri);
            setIsPreview(true);
          }
        }
      }
    } catch (err) {
      Alert.alert("Hata", "Fotoğraf çekilemedi. Lütfen tekrar deneyin.");
    } finally {
      setFlashOn(false);
    }
  };

  const handleSend = () => {
    if (!photoUri) return;
    Alert.alert("Gönder", "Resmi analiz için göndermek istiyor musunuz?", [
      { text: "İptal", style: "cancel" },
      {
        text: "Evet",
        onPress: () => {
          if (onSendForAnalysis) onSendForAnalysis(photoUri);
          else Alert.alert("Gönderildi", "Resim analiz için gönderildi.");
          setPhotoUri(null);
          setIsPreview(false);
        },
      },
    ]);
  };

  return (
    <View
      style={[appStyles.cameraContainer, { backgroundColor: theme.background }]}
    >
      <View
        style={[appStyles.cameraBorderContainer, { borderColor: theme.accent }]}
      >
        {canUseCameraComponent ? (
          <CameraComponent
            ref={(r: any) => {
              cameraRef.current = r;
            }}
            style={appStyles.cameraView}
            type={"back"}
            flashMode={
              _ExpoCamera?.FlashMode
                ? flashOn
                  ? _ExpoCamera.FlashMode.on
                  : _ExpoCamera.FlashMode.off
                : flashOn
                  ? "on"
                  : "off"
            }
          />
        ) : (
          <View
            style={[
              appStyles.cameraView,
              { alignItems: "center", justifyContent: "center" },
            ]}
          >
            <Text style={{ color: theme.textSecondary }}>
              Canlı kamera kullanılamıyor
            </Text>
            <Text style={{ color: theme.textSecondary, marginTop: 6 }}>
              Cihaz kameranızı kullanmak için izin verin veya albümden seçin.
            </Text>
          </View>
        )}

        {!isPreview && (
          <React.Fragment>
            <TouchableOpacity
              onPress={pickFromGallery}
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
              <MaterialCommunityIcons
                name="image"
                size={26}
                color={theme.accent}
              />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={takePicture}
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

            <TouchableOpacity
              onPress={() => setFlashOn((s) => !s)}
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
          </React.Fragment>
        )}
      </View>

      {flashOverlayVisible && (
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            backgroundColor: theme.accent + "33",
          }}
        />
      )}

      {isPreview && photoUri && (
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: theme.background + "CC",
          }}
        >
          <Image
            source={{ uri: photoUri }}
            style={{ width: "86%", height: "60%", borderRadius: 12 }}
            resizeMode="cover"
          />
          <View style={{ flexDirection: "row", marginTop: 16 }}>
            <TouchableOpacity
              onPress={() => {
                setPhotoUri(null);
                setIsPreview(false);
              }}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: 8,
                backgroundColor: theme.surface,
                borderWidth: 1,
                borderColor: theme.textSecondary,
                marginRight: 8,
              }}
            >
              <Text style={{ color: theme.text }}>İptal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSend}
              style={[
                appStyles.primaryButton,
                { backgroundColor: theme.accent },
              ]}
            >
              <Text
                style={[
                  appStyles.primaryButtonText,
                  { color: theme.background },
                ]}
              >
                Gönder
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};
