import { useState, useEffect } from "react";
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

interface ParentDiseaseScreenProps extends DiseaseScreenProps {
  theme: Theme;
}

export const DiseaseScreen = ({
  theme,
  permission,
  onRequestPermission,
  isActive,
}: ParentDiseaseScreenProps) => {
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
            const imgResponse = await diseaseAPI.getImageUrl(detection.detection_id);
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
      Alert.alert('Hata', 'Sonuçlar yüklenemedi');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (isActive && !showCamera) {
      fetchDetections();
    }
  }, [isActive, showCamera]);

  const handleSendForAnalysis = async (imageUri: string) => {
    try {
      // Submit the image
      const response = await diseaseAPI.submitDetection(imageUri);
      if (!response.success || !response.data) {
        Alert.alert('Hata', response.error || 'Görsel gönderilemedi');
        return;
      }

      const { detectionId } = response.data;

      // Show success message
      Alert.alert(
        'Gönderildi',
        'Yaprak analiz için gönderildi. Sonuçlar yaklaşık 20-30 saniye içinde hazır olacak.',
        [{ text: 'Tamam', onPress: () => setShowCamera(false) }]
      );

      // Start polling for results in the background
      pollForResults(detectionId);
    } catch (error) {
      Alert.alert('Hata', 'Bir şeyler ters gitti');
    }
  };

  const pollForResults = async (detectionId: string) => {
    try {
      await diseaseAPI.pollDetectionStatus(
        detectionId,
        (status) => {
          console.log('Detection status:', status);
        },
        30,
        2000
      );

      // Refresh the list when complete
      fetchDetections();
    } catch (error) {
      console.error('Polling error:', error);
      // Still refresh to show the failed status
      fetchDetections();
    }
  };

  const handleDeleteDetection = async (detectionId: string) => {
    Alert.alert(
      'Sil',
      'Bu analiz sonucunu silmek istediğinizden emin misiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await diseaseAPI.deleteDetection(detectionId);
              if (response.success) {
                setDetections((prev) => prev.filter((d) => d.detection_id !== detectionId));
              } else {
                Alert.alert('Hata', response.error || 'Silinirken bir hata oluştu');
              }
            } catch {
              Alert.alert('Hata', 'Silinirken bir hata oluştu');
            }
          },
        },
      ]
    );
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
      <View style={{
        paddingHorizontal: spacing.md,
        paddingTop: spacing.md,
        paddingBottom: spacing.sm,
      }}>
        <Text style={{ fontSize: 24, fontWeight: '700', color: theme.text, marginBottom: spacing.xs }}>
          Hastalık Tespit
        </Text>
        <Text style={{ fontSize: 13, color: theme.textSecondary }}>
          Yaprak fotoğrafları ile hastalık tespit sonuçları
        </Text>
      </View>

      {loading && !refreshing ? (
        <View style={[appStyles.placeholder, { backgroundColor: theme.background }]}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={{ color: theme.textSecondary, marginTop: spacing.md }}>
            Yükleniyor...
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
              <View style={{ paddingVertical: spacing.xxl, alignItems: 'center' }}>
                <Ionicons name="leaf-outline" size={64} color={theme.textSecondary} />
                <Text style={{ color: theme.text, fontSize: 16, fontWeight: '600', marginTop: spacing.md }}>
                  Henüz analiz yok
                </Text>
                <Text style={{ color: theme.textSecondary, fontSize: 13, marginTop: spacing.xs, textAlign: 'center' }}>
                  Yaprak fotoğrafı çekerek hastalık tespiti başlatın
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
