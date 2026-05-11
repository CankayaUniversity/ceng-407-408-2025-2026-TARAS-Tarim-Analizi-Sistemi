// Failed-send kayitlari icin kart — sag ust dismiss, sag alt retry butonu.

import { memo } from "react";
import { View, Text, Image, TouchableOpacity, ActivityIndicator } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Theme } from "../../utils/theme";
import { PendingUpload } from "../../utils/pendingUploads";
import { useLanguage } from "../../context/LanguageContext";

interface PendingUploadCardProps {
  pending: PendingUpload;
  theme: Theme;
  retrying: boolean;
  onRetry: (pendingId: string) => void;
  onDismiss: (pendingId: string) => void;
}

const RETRY_BUTTON_SIZE = 32;

const PendingUploadCardBase = ({
  pending,
  theme,
  retrying,
  onRetry,
  onDismiss,
}: PendingUploadCardProps) => {
  const { t } = useLanguage();
  return (
    <View
      className="surface-bg rounded-xl"
      style={{
        padding: 10,
        marginBottom: 6,
        borderWidth: 1,
        borderColor: theme.danger + "55",
        shadowColor: theme.shadowColor,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
        elevation: 2,
      }}
    >
      <View className="flex-row" style={{ gap: 10 }}>
        <View
          className="rounded-lg bg-porcelain dark:bg-carbonBlack overflow-hidden center"
          style={{ width: 56, height: 56 }}
        >
          <Image
            source={{ uri: pending.imageUri }}
            style={{ width: "100%", height: "100%" }}
            resizeMode="cover"
          />
        </View>

        <View
          className="flex-1"
          style={{ minHeight: 56, justifyContent: "space-between" }}
        >
          <View className="flex-row items-start" style={{ gap: 8 }}>
            <View className="flex-1 flex-row items-center" style={{ gap: 6 }}>
              <Ionicons name="cloud-offline-outline" size={15} color={theme.danger} />
              <Text
                className="font-semibold"
                style={{ color: theme.danger, fontSize: 15, flex: 1 }}
                numberOfLines={1}
              >
                {t.disease.failedToSend}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => onDismiss(pending.pendingId)}
              hitSlop={10}
              style={{ padding: 2 }}
            >
              <Ionicons name="close" size={16} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          <View className="flex-row" style={{ justifyContent: "flex-end" }}>
            <TouchableOpacity
              onPress={() => onRetry(pending.pendingId)}
              disabled={retrying}
              activeOpacity={0.7}
              style={{
                width: RETRY_BUTTON_SIZE,
                height: RETRY_BUTTON_SIZE,
                borderRadius: RETRY_BUTTON_SIZE / 2,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: theme.primary,
                opacity: retrying ? 0.7 : 1,
              }}
            >
              {retrying ? (
                <ActivityIndicator size="small" color={theme.textOnPrimary ?? "#fff"} />
              ) : (
                <Ionicons name="refresh" size={18} color={theme.textOnPrimary ?? "#fff"} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
};

export const PendingUploadCard = memo(PendingUploadCardBase);
