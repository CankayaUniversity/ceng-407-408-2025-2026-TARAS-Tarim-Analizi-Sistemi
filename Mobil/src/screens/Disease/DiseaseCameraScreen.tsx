// Hastalik kamera ekrani - fotograf cekme ve galeri secimi
// Props: theme, permission, onRequestPermission, onSendForAnalysis, isActive

import React, { useState, useRef } from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { appStyles } from "../../styles";
import { CameraView, canUseCameraComponent } from "./CameraView";
import { PhotoPreview } from "./PhotoPreview";
import { DiseaseScreenProps } from "./types";
import { usePopupMessage } from "../../context/PopupMessageContext";
import { useLanguage } from "../../context/LanguageContext";
import { prepareDiseaseImageForUpload } from "../../utils/diseaseImageProcessing";

export const DiseaseCameraScreen = ({
  theme,
  permission,
  onRequestPermission,
  onSendForAnalysis,
  isActive = true,
}: DiseaseScreenProps) => {
  const { showPopup } = usePopupMessage();
  const { t } = useLanguage();
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [isPreview, setIsPreview] = useState(false);
  const cameraRef = useRef<any>(null);
  const [flashOn, setFlashOn] = useState(false);
  const [flashOverlayVisible, setFlashOverlayVisible] = useState(false);
  const [isPreparingImage, setIsPreparingImage] = useState(false);

  const prepareImage = async (
    uri: string,
    width?: number,
    height?: number,
  ): Promise<string> => {
    const imageWidth = width ?? 0;
    const imageHeight = height ?? 0;

    if (imageWidth <= 0 || imageHeight <= 0) {
      return uri;
    }

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

  const triggerFlashOverlay = () => {
    setFlashOverlayVisible(true);
    setTimeout(() => setFlashOverlayVisible(false), 180);
  };

  const takePicture = async () => {
    try {
      setIsPreparingImage(true);
      triggerFlashOverlay();

      if (canUseCameraComponent) {
        if (!cameraRef.current) {
          showPopup(t.camera.cameraNotReady);
          return;
        }
        const photo = await cameraRef.current.takePictureAsync({
          quality: 1,
          skipProcessing: false,
        });
        if (photo?.uri) {
          const preparedUri = await prepareImage(photo.uri, photo.width, photo.height);
          setPhotoUri(preparedUri);
          setIsPreview(true);
        }
      } else {
        const result = await ImagePicker.launchCameraAsync({
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
      }
    } catch (err) {
      showPopup(t.camera.photoError);
    } finally {
      setFlashOn(false);
      setIsPreparingImage(false);
    }
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
        },
      },
    ]);
  };

  const handleCancel = () => {
    setPhotoUri(null);
    setIsPreview(false);
  };

  if (!permission) {
    return (
      <View
        style={[appStyles.placeholder, { backgroundColor: theme.background }]}
      >
        <Text style={[appStyles.placeholderText, { color: theme.text }]}>
          {t.camera.permissionTitle}
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
            {t.camera.permissionButton}
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
          {t.camera.permissionDeniedTitle}
        </Text>
        <Text
          style={[
            appStyles.placeholderSub,
            { color: theme.textSecondary, marginBottom: 24 },
          ]}
        >
          {t.camera.permissionDeniedMessage}
        </Text>
        <TouchableOpacity
          style={[appStyles.primaryButton, { backgroundColor: theme.accent }]}
          onPress={onRequestPermission}
        >
          <Text
            style={[appStyles.primaryButtonText, { color: theme.background }]}
          >
            {t.camera.retryButton}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View
      style={[appStyles.cameraContainer, { backgroundColor: theme.background }]}
    >
      {!isPreview && (
        <CameraView
          theme={theme}
          cameraRef={cameraRef}
          flashOn={flashOn}
          isActive={isActive}
          onPickFromGallery={pickFromGallery}
          onTakePicture={takePicture}
          onToggleFlash={() => setFlashOn((s) => !s)}
        />
      )}

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
        <PhotoPreview
          theme={theme}
          photoUri={photoUri}
          onCancel={handleCancel}
          onSend={handleSend}
        />
      )}

      {isPreparingImage && (
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            backgroundColor: theme.background + "AA",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: theme.text, fontWeight: "600" }}>
            {t.common.loading}
          </Text>
        </View>
      )}
    </View>
  );
};
