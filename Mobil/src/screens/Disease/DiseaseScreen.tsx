// Hastalik tespit ekrani - analiz listesi ve kamera erisimi
// Props: theme, permission, onRequestPermission, isActive

import { useState, useEffect } from "react";
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
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { Theme } from "../../utils/theme";
import { diseaseAPI, DiseaseDetection } from "../../utils/api";
import { DiseaseResultCard } from "./DiseaseResultCard";
import { DiseaseCameraScreen } from "./DiseaseCameraScreen";
import { DiseaseScreenProps } from "./types";
import { spacing } from "../../utils/responsive";
import { s, vs } from "../../utils/responsive";
import { useScreenReset } from "../../hooks/useScreenReset";
import { usePopupMessage } from "../../context/PopupMessageContext";
import { useLanguage } from "../../context/LanguageContext";
import * as imageCache from "../../utils/imageCache";

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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});

  // Cache'deki resimleri hydrate et — network fetch ile paralel, kart goruntuleri
  // backend cevaplamadan once gozukebilsin
  useEffect(() => {
    (async () => {
      const ids = await imageCache.listCachedIds();
      if (ids.length === 0) return;
      const hydrated: Record<string, string> = {};
      for (const id of ids) hydrated[id] = imageCache.localPath(id);
      setImageUrls((prev) => ({ ...hydrated, ...prev }));
    })();
  }, []);

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

        // Her detection icin yerel cache ya indir ya da mevcut dosyayi kullan
        const nextUrls: Record<string, string> = {};
        await Promise.all(
          response.data.detections.map(async (d) => {
            const uri = await imageCache.resolveImage(
              d.detection_id,
              d.imageUrl ?? null,
            );
            if (uri) nextUrls[d.detection_id] = uri;
          }),
        );
        setImageUrls(nextUrls);

        // Cross-device reconciliation — server'da olmayan yerel dosyalari temizle
        // Sadece basarili fetch sonrasi cagrilir; network hatasinda silme yapma
        const liveIds = new Set(
          response.data.detections.map((d) => d.detection_id),
        );
        imageCache.reconcile(liveIds).catch(() => {});
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
              imageCache.deleteLocal(detectionId).catch(() => {});
              setImageUrls((prev) => {
                const next = { ...prev };
                delete next[detectionId];
                return next;
              });
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
    <View className="screen-bg">
      {loading && !refreshing ? (
        <View className="flex-1 center px-6 bg-platinum-50 dark:bg-onyx-950">
          <ActivityIndicator size="large" color={theme.accent} />
          <Text className="text-secondary mt-4">
            {t.disease.loadingResults}
          </Text>
        </View>
      ) : (
        <>
          <ScrollView
            className="flex-1"
            contentContainerStyle={{
              paddingHorizontal: spacing.md,
              paddingTop: spacing.md,
              paddingBottom: 100,
              flexGrow: 1,
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
              <View className="flex-1 center">
                <Ionicons
                  name="leaf-outline"
                  size={64}
                  color={theme.textSecondary}
                />
                <Text className="text-primary text-base font-semibold mt-4">
                  {t.disease.noAnalysisYet}
                </Text>
                <Text className="text-secondary text-[13px] mt-1 text-center">
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

          <View
            className="absolute"
            style={{
              left: 0,
              right: 0,
              bottom: vs(12),
              alignItems: "center",
            }}
            pointerEvents="box-none"
          >
            <TouchableOpacity
              onPress={() => setShowCamera(true)}
              activeOpacity={0.85}
              style={{
                width: s(48),
                height: s(48),
                borderRadius: 24,
                backgroundColor: theme.accent,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 2,
                borderColor: theme.background,
                elevation: 10,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 10,
              }}
            >
              <Ionicons name="add" size={32} color="#fff" />
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Detail modal - tap any card to inspect all returned fields */}
      <Modal
        visible={selectedDetection !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedDetection(null)}
      >
        <BlurView
          intensity={40}
          tint={theme.isDark ? "dark" : "light"}
          style={{ flex: 1 }}
        >
          <View
            className="screen-bg"
            style={{
              marginTop: 60,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
            }}
          >
            {/* Header */}
            <View
              className="flex-row justify-between items-center"
              style={{
                padding: spacing.md,
                borderBottomWidth: 1,
                borderBottomColor: theme.accent + "20",
              }}
            >
              <Text className="text-primary text-[17px] font-bold">
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
                  className="surface-bg rounded-lg"
                  style={{ padding: spacing.sm }}
                >
                  <Text className="text-secondary text-[11px] font-semibold mb-2">
                    all_predictions
                  </Text>
                  {selectedDetection.all_predictions &&
                  Object.keys(selectedDetection.all_predictions).length > 0 ? (
                    Object.entries(selectedDetection.all_predictions)
                      .sort(([, a], [, b]) => b - a)
                      .map(([label, score], idx) => {
                        const pct = score <= 1 ? score * 100 : score;
                        const isTop = idx === 0;
                        return (
                          <View
                            key={label}
                            style={{ marginBottom: spacing.sm }}
                          >
                            <View className="flex-row items-start mb-1" style={{ gap: spacing.xs }}>
                              <Text
                                className="text-primary text-xs flex-1"
                                style={{ fontWeight: isTop ? "700" : "500" }}
                                numberOfLines={2}
                              >
                                {label}
                              </Text>
                              <Text
                                className="text-xs"
                                style={{
                                  color: theme.accent,
                                  fontWeight: isTop ? "700" : "600",
                                  minWidth: s(52),
                                  textAlign: "right",
                                }}
                              >
                                {pct.toFixed(2)}%
                              </Text>
                            </View>
                            <View
                              style={{
                                height: 4,
                                borderRadius: 2,
                                backgroundColor: theme.accent + "15",
                                overflow: "hidden",
                              }}
                            >
                              <View
                                style={{
                                  height: "100%",
                                  width: `${Math.min(100, Math.max(0, pct))}%`,
                                  backgroundColor: theme.accent,
                                  borderRadius: 2,
                                }}
                              />
                            </View>
                          </View>
                        );
                      })
                  ) : (
                    <Text className="text-secondary text-xs">
                      {t.disease.detailNoData}
                    </Text>
                  )}
                </View>

                {/* Recommendations */}
                {selectedDetection.recommendations &&
                  selectedDetection.recommendations.length > 0 && (
                    <View
                      className="surface-bg rounded-lg"
                      style={{ padding: spacing.sm }}
                    >
                      <Text className="text-secondary text-[11px] font-semibold mb-1">
                        {t.disease.detailRecommendations}
                      </Text>
                      {selectedDetection.recommendations.map((rec, i) => (
                        <Text
                          key={i}
                          className="text-primary text-xs mb-0.5"
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
        </BlurView>
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

const DetailRow = ({ label, value, theme: _theme, bold, mono }: DetailRowProps) => (
  <View
    className="surface-bg rounded-lg"
    style={{ padding: spacing.sm }}
  >
    <Text className="text-secondary text-[11px] font-semibold mb-0.5">
      {label}
    </Text>
    <Text
      className="text-primary"
      style={{
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
