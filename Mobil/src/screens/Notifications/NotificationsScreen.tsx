// Bildirimler ekrani - bildirim listesini gosterir
import { View, Text, ScrollView, TouchableOpacity, SafeAreaView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../context/ThemeContext";
import { useLanguage } from "../../context/LanguageContext";
import { s, vs, ms } from "../../utils/responsive";

interface NotificationsScreenProps {
  onClose: () => void;
}

export const NotificationsScreen = ({ onClose }: NotificationsScreenProps) => {
  const { theme } = useTheme();
  const { t } = useLanguage();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Header */}
      <View
        className="flex-row items-center justify-between"
        style={{
          paddingHorizontal: s(16),
          paddingVertical: vs(12),
          borderBottomWidth: 1,
          borderBottomColor: theme.primary + "20",
          backgroundColor: theme.background,
        }}
      >
        <Text
          className="font-bold"
          style={{ fontSize: ms(18, 0.3), color: theme.textMain }}
        >
          {t.notifications.title}
        </Text>
        <TouchableOpacity
          onPress={onClose}
          activeOpacity={0.7}
          style={{
            padding: s(8),
            borderRadius: s(20),
            backgroundColor: theme.surface,
          }}
        >
          <Ionicons name="close" size={ms(20, 0.3)} color={theme.textMain} />
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      >
        <View
          className="flex-1 center"
          style={{ paddingVertical: vs(60), gap: vs(12) }}
        >
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
    </SafeAreaView>
  );
};
