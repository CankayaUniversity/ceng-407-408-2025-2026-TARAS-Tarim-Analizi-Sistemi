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
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
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
  const [selectedDetection, setSelectedDetection] =
    useState<DiseaseDetection | null>(null);
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

        // URL'ler artik response icinde geliyor (backend paralel olusturuyor)
        const urls: Record<string, string> = {};
        for (const d of response.data.detections) {
          if (d.imageUrl) urls[d.detection_id] = d.imageUrl;
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
          console.log("[DISEASE] poll:", status);
        },
        30,
        2000,
      );

      fetchDetections();
    } catch (error) {
      console.log("[DISEASE] poll err:", error);
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
                  onPress={() => setSelectedDetection(detection)}
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

      {/* Detail modal - tap any card to inspect all returned fields */}
      <Modal
        visible={selectedDetection !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedDetection(null)}
      >
        <SafeAreaView
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <View
            style={{
              flex: 1,
              marginTop: 60,
              backgroundColor: theme.background,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
            }}
          >
            {/* Header */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                padding: spacing.md,
                borderBottomWidth: 1,
                borderBottomColor: theme.accent + "20",
              }}
            >
              <Text
                style={{
                  fontSize: 17,
                  fontWeight: "700",
                  color: theme.text,
                }}
              >
                {t.disease.detailTitle}
              </Text>
              <TouchableOpacity onPress={() => setSelectedDetection(null)}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            {selectedDetection && (
              <ScrollView
                contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
                showsVerticalScrollIndicator={false}
              >
                <DetailRow label="status" value={selectedDetection.status} theme={theme} />
                <DetailRow
                  label="detected_disease"
                  value={selectedDetection.detected_disease ?? t.disease.detailNoData}
                  theme={theme}
                  bold
                />
                <DetailRow
                  label={t.disease.detailConfidenceRaw}
                  value={
                    selectedDetection.confidence != null
                      ? String(selectedDetection.confidence)
                      : t.disease.detailNoData
                  }
                  theme={theme}
                />
                <DetailRow
                  label={t.disease.detailConfidenceScore}
                  value={
                    selectedDetection.confidence_score != null
                      ? String(selectedDetection.confidence_score)
                      : t.disease.detailNoData
                  }
                  theme={theme}
                />

                {/* All predictions */}
                <View
                  style={{
                    backgroundColor: theme.surface,
                    borderRadius: spacing.sm,
                    padding: spacing.sm,
                  }}
                >
                  <Text
                    style={{
                      color: theme.textSecondary,
                      fontSize: 11,
                      fontWeight: "600",
                      marginBottom: spacing.xs,
                    }}
                  >
                    all_predictions
                  </Text>
                  {selectedDetection.all_predictions &&
                  Object.keys(selectedDetection.all_predictions).length > 0 ? (
                    Object.entries(selectedDetection.all_predictions)
                      .sort(([, a], [, b]) => b - a)
                      .map(([label, score]) => {
                        const pct = score <= 1 ? score * 100 : score;
                        return (
                          <View
                            key={label}
                            style={{
                              flexDirection: "row",
                              justifyContent: "space-between",
                              paddingVertical: 2,
                              borderBottomWidth: 1,
                              borderBottomColor: theme.accent + "10",
                            }}
                          >
                            <Text
                              style={{
                                color: theme.text,
                                fontSize: 12,
                                flex: 1,
                              }}
                              numberOfLines={2}
                            >
                              {label}
                            </Text>
                            <Text
                              style={{
                                color: theme.accent,
                                fontSize: 12,
                                fontWeight: "600",
                                marginLeft: spacing.sm,
                              }}
                            >
                              {pct.toFixed(2)}%
                            </Text>
                          </View>
                        );
                      })
                  ) : (
                    <Text
                      style={{ color: theme.textSecondary, fontSize: 12 }}
                    >
                      {t.disease.detailNoData}
                    </Text>
                  )}
                </View>

                {/* Recommendations */}
                {selectedDetection.recommendations &&
                  selectedDetection.recommendations.length > 0 && (
                    <View
                      style={{
                        backgroundColor: theme.surface,
                        borderRadius: spacing.sm,
                        padding: spacing.sm,
                      }}
                    >
                      <Text
                        style={{
                          color: theme.textSecondary,
                          fontSize: 11,
                          fontWeight: "600",
                          marginBottom: spacing.xs,
                        }}
                      >
                        {t.disease.detailRecommendations}
                      </Text>
                      {selectedDetection.recommendations.map((rec, i) => (
                        <Text
                          key={i}
                          style={{ color: theme.text, fontSize: 12, marginBottom: 2 }}
                        >
                          • {rec}
                        </Text>
                      ))}
                    </View>
                  )}

                <DetailRow
                  label={t.disease.detailDetectionId}
                  value={selectedDetection.detection_id}
                  theme={theme}
                  mono
                />
                <DetailRow
                  label="uploaded_at"
                  value={selectedDetection.uploaded_at}
                  theme={theme}
                />
                <DetailRow
                  label="processing_started_at"
                  value={selectedDetection.processing_started_at ?? t.disease.detailNoData}
                  theme={theme}
                />
                <DetailRow
                  label="completed_at"
                  value={selectedDetection.completed_at ?? t.disease.detailNoData}
                  theme={theme}
                />
                {selectedDetection.error_message && (
                  <DetailRow
                    label="error_message"
                    value={selectedDetection.error_message}
                    theme={theme}
                  />
                )}
              </ScrollView>
            )}
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
};

interface DetailRowProps {
  label: string;
  value: string;
  theme: Theme;
  bold?: boolean;
  mono?: boolean;
}

const DetailRow = ({ label, value, theme, bold, mono }: DetailRowProps) => (
  <View
    style={{
      backgroundColor: theme.surface,
      borderRadius: spacing.sm,
      padding: spacing.sm,
    }}
  >
    <Text
      style={{
        color: theme.textSecondary,
        fontSize: 11,
        fontWeight: "600",
        marginBottom: 2,
      }}
    >
      {label}
    </Text>
    <Text
      style={{
        color: theme.text,
        fontSize: bold ? 15 : 13,
        fontWeight: bold ? "700" : "400",
        fontFamily: mono ? "monospace" : undefined,
      }}
      selectable
    >
      {value}
    </Text>
  </View>
);
