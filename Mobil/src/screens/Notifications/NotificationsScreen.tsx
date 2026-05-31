// Bildirimler ekrani — yalnizca icerik (bos durum). Header + kapat butonu FullScreenModal'dan gelir.
import { View, Text, ScrollView } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "../../context/ThemeContext";
import { useLanguage } from "../../context/LanguageContext";
import { vs, ms } from "../../utils/responsive";

export const NotificationsScreen = () => {
  const { theme } = useTheme();
  const { t } = useLanguage();

  return (
    <ScrollView
      contentContainerStyle={{ flexGrow: 1 }}
      showsVerticalScrollIndicator={false}
    >
      <View className="flex-1 center" style={{ paddingVertical: vs(60), gap: vs(12) }}>
        <Ionicons
          name="notifications-off-outline"
          size={ms(48, 0.3)}
          color={theme.textSecondary}
        />
        <Text
          className="text-center"
          style={{ fontSize: ms(15, 0.3), color: theme.textSecondary }}
        >
          {t.notifications.empty}
        </Text>
      </View>
    </ScrollView>
  );
};
