import { View, Text, Image, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Theme } from "../../utils/theme";
import { DiseaseDetection, DetectionStatus } from "../../utils/api";
import { spacing } from "../../utils/responsive";

interface DiseaseResultCardProps {
  detection: DiseaseDetection;
  theme: Theme;
  imageUrl?: string;
  onPress?: () => void;
  onDelete?: () => void;
}

// get color and icon based on status
const getStatusInfo = (status: DetectionStatus): { text: string; color: string; icon: string } => {
  switch (status) {
    case 'NOT_STARTED':
      return { text: 'Bekleniyor', color: '#94a3b8', icon: 'time-outline' };
    case 'PROCESSING':
      return { text: 'İşleniyor', color: '#3b82f6', icon: 'sync-outline' };
    case 'COMPLETED':
      return { text: 'Tamamlandı', color: '#22c55e', icon: 'checkmark-circle-outline' };
    case 'FAILED':
      return { text: 'Başarısız', color: '#ef4444', icon: 'close-circle-outline' };
  }
};

// show how long ago something happened
const formatDate = (isoDate: string): string => {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Az önce';
  if (diffMins < 60) return `${diffMins} dk önce`;
  if (diffHours < 24) return `${diffHours} saat önce`;
  if (diffDays === 1) return 'Dün';
  if (diffDays < 7) return `${diffDays} gün önce`;

  return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
};

export const DiseaseResultCard = ({
  detection,
  theme,
  imageUrl,
  onPress,
  onDelete,
}: DiseaseResultCardProps) => {
  const statusInfo = getStatusInfo(detection.status);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        backgroundColor: theme.surface,
        borderRadius: spacing.md,
        padding: spacing.md,
        marginBottom: spacing.md,
        borderWidth: 1,
        borderColor: theme.accent + '20',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
      }}
    >
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <View
          style={{
            width: 80,
            height: 80,
            borderRadius: spacing.sm,
            backgroundColor: theme.background,
            overflow: 'hidden',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
            />
          ) : (
            <Ionicons name="leaf-outline" size={32} color={theme.textSecondary} />
          )}
        </View>

        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <Ionicons name={statusInfo.icon as any} size={16} color={statusInfo.color} />
              <Text style={{ color: statusInfo.color, fontSize: 12, fontWeight: '600' }}>
                {statusInfo.text}
              </Text>
            </View>
            <Text style={{ color: theme.textSecondary, fontSize: 11 }}>
              {formatDate(detection.uploaded_at)}
            </Text>
          </View>

          {detection.status === 'PROCESSING' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs }}>
              <ActivityIndicator size="small" color={theme.accent} />
              <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                Yaprak analiz ediliyor...
              </Text>
            </View>
          )}

          {detection.status === 'COMPLETED' && detection.detected_disease && (
            <View>
              <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700', marginBottom: spacing.xs }}>
                {detection.detected_disease}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs }}>
                <View
                  style={{
                    backgroundColor: theme.accent + '20',
                    paddingHorizontal: spacing.sm,
                    paddingVertical: 3,
                    borderRadius: 4,
                  }}
                >
                  <Text style={{ color: theme.accent, fontSize: 11, fontWeight: '600' }}>
                    {detection.confidence?.toFixed(1)}% güven
                  </Text>
                </View>
              </View>
              {detection.recommendations && detection.recommendations.length > 0 && (
                <Text
                  style={{ color: theme.textSecondary, fontSize: 11 }}
                  numberOfLines={2}
                >
                  {detection.recommendations[0]}
                </Text>
              )}
            </View>
          )}

          {detection.status === 'FAILED' && (
            <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
              {detection.error_message || 'Analiz başarısız oldu'}
            </Text>
          )}

          {detection.status === 'NOT_STARTED' && (
            <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
              Analiz için sırada bekliyor
            </Text>
          )}
        </View>

        {onDelete && (
          <TouchableOpacity
            onPress={onDelete}
            style={{
              padding: spacing.xs,
              alignSelf: 'flex-start',
            }}
          >
            <Ionicons name="trash-outline" size={18} color={theme.textSecondary} />
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
};
