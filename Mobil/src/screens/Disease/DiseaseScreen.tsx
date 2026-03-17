// Hastalik tespit ekrani - analiz listesi ve kamera erisimi
// Props: theme, permission, onRequestPermission, isActive

import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { appStyles } from "../../styles";
import { Theme } from "../../utils/theme";
import { diseaseAPI, DiseaseDetection } from "../../utils/api";
import { DiseaseResultCard } from "./DiseaseResultCard";
import { DiseaseCameraScreen } from "./DiseaseCameraScreen";
import { DiseaseScreenProps } from "./types";
import { spacing } from "../../utils/responsive";
import { useScreenReset } from "../../hooks/useScreenReset";
import { usePopupMessage } from "../../context/PopupMessageContext";
import { useLanguage } from "../../context/LanguageContext";

interface ParentDiseaseScreenProps extends DiseaseScreenProps {
  theme: Theme;
  isActive?: boolean;
}

export const DiseaseScreen = ({
  theme,
  permission,
  onRequestPermission,
  isActive = true,
}: ParentDiseaseScreenProps) => {
  const { showPopup } = usePopupMessage();
  const { t } = useLanguage();
  const [showCamera, setShowCamera] = useState(false);
  const [detections, setDetections] = useState<DiseaseDetection[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});

  const fetchDetections = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const response = await diseaseAPI.getAllDetections();
      if (response.success && response.data) {
        setDetections(response.data.detections);

        // Fetch image URLs for all detections
        const urls: Record<string, string> = {};
        for (const detection of response.data.detections) {
          try {
            const imgResponse = await diseaseAPI.getImageUrl(
              detection.detection_id,
            );
            if (imgResponse.success && imgResponse.data) {
              urls[detection.detection_id] = imgResponse.data.imageUrl;
            }
          } catch {
            // Ignore errors for individual images
          }
        }
        setImageUrls(urls);
      }
    } catch (error) {
      showPopup(t.disease.errorLoadingResults);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useScreenReset(isActive, {
    onActivate: () => {
      // Sadece veri yoksa fetch yap - mevcut veri korunur
      if (!showCamera && detections.length === 0) {
        fetchDetections();
      }
    },
    onDeactivate: () => {
      // Kamera state sifirla, veri korunur
      setShowCamera(false);
      setLoading(false);
    },
  });

  const handleSendForAnalysis = async (imageUri: string) => {
    try {
      // Submit the image
      const response = await diseaseAPI.submitDetection(imageUri);
      if (!response.success || !response.data) {
        showPopup(response.error || t.disease.errorSendingImage);
        return;
      }

      const { detectionId } = response.data;

      // Show success message and close camera
      showPopup(t.disease.sentForAnalysis);
      setShowCamera(false);

      // Start polling for results in the background
      pollForResults(detectionId);
    } catch (error) {
      showPopup(t.disease.errorGeneric);
    }
  };

  const pollForResults = async (detectionId: string) => {
    try {
      await diseaseAPI.pollDetectionStatus(
        detectionId,
        (status) => {
          console.log("Detection status:", status);
        },
        30,
        2000,
      );

      // Refresh the list when complete
      fetchDetections();
    } catch (error) {
      console.error("Polling error:", error);
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

  if (showCamera) {
    return (
      <DiseaseCameraScreen
        theme={theme}
        permission={permission}
        onRequestPermission={onRequestPermission}
        onSendForAnalysis={handleSendForAnalysis}
        isActive={isActive}
      />
    );
  }

  return (
    <View style={[appStyles.container, { backgroundColor: theme.background }]}>
      <View
        style={{
          paddingHorizontal: spacing.md,
          paddingTop: spacing.md,
          paddingBottom: spacing.sm,
        }}
      >
        <Text
          style={{
            fontSize: 24,
            fontWeight: "700",
            color: theme.text,
            marginBottom: spacing.xs,
          }}
        >
          {t.disease.title}
        </Text>
        <Text style={{ fontSize: 13, color: theme.textSecondary }}>
          {t.disease.subtitle}
        </Text>
      </View>

      {loading && !refreshing ? (
        <View
          style={[appStyles.placeholder, { backgroundColor: theme.background }]}
        >
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={{ color: theme.textSecondary, marginTop: spacing.md }}>
            {t.disease.loadingResults}
          </Text>
        </View>
      ) : (
        <>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              paddingHorizontal: spacing.md,
              paddingBottom: 100,
            }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => fetchDetections(true)}
                tintColor={theme.accent}
              />
            }
          >
            {detections.length === 0 ? (
              <View
                style={{ paddingVertical: spacing.xxl, alignItems: "center" }}
              >
                <Ionicons
                  name="leaf-outline"
                  size={64}
                  color={theme.textSecondary}
                />
                <Text
                  style={{
                    color: theme.text,
                    fontSize: 16,
                    fontWeight: "600",
                    marginTop: spacing.md,
                  }}
                >
                  {t.disease.noAnalysisYet}
                </Text>
                <Text
                  style={{
                    color: theme.textSecondary,
                    fontSize: 13,
                    marginTop: spacing.xs,
                    textAlign: "center",
                  }}
                >
                  {t.disease.noAnalysisSubtitle}
                </Text>
              </View>
            ) : (
              detections.map((detection) => (
                <DiseaseResultCard
                  key={detection.detection_id}
                  detection={detection}
                  theme={theme}
                  imageUrl={imageUrls[detection.detection_id]}
                  onDelete={() => handleDeleteDetection(detection.detection_id)}
                />
              ))
            )}
          </ScrollView>

          <TouchableOpacity
            onPress={() => setShowCamera(true)}
            style={[
              appStyles.fab,
              {
                backgroundColor: theme.accent,
              },
            ]}
          >
            <Ionicons name="camera" size={28} color={theme.background} />
          </TouchableOpacity>
        </>
      )}
    </View>
  );
};
