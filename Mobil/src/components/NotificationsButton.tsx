// Bildirim butonu — minimalist: arka plan/cerceve/golge yok, sadece zil ikonu.
// Okunmamis bildirim varsa ikonun sag ustunde accent renkli kucuk daire (badge) cikar.
import { TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Theme } from "../utils/theme";

export interface NotificationsButtonProps {
  theme: Theme;
  size: number;
  onPress?: () => void;
  /** Okunmamis bildirim var mi — true ise accent renkli badge gosterilir. */
  hasUnread?: boolean;
}

export const NotificationsButton = ({
  theme,
  size,
  onPress,
  hasUnread = false,
}: NotificationsButtonProps) => {
  // Arka plan kalktigi icin ikonu kutuya gore biraz buyutuyoruz.
  const iconSize = size * 0.72;
  const dotSize = Math.max(7, Math.round(size * 0.28));

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.6}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      className="center"
      style={{ width: size, height: size }}
    >
      <Ionicons name="notifications-outline" size={iconSize} color={theme.textMain} />
      {hasUnread && (
        <View
          style={{
            position: "absolute",
            top: size * 0.1,
            right: size * 0.1,
            width: dotSize,
            height: dotSize,
            borderRadius: dotSize / 2,
            backgroundColor: theme.primary,
            // Badge'i ikonun cizgilerinden ayirmak icin header arka plani renginde ince cerceve.
            borderWidth: 1.5,
            borderColor: theme.background,
          }}
        />
      )}
    </TouchableOpacity>
  );
};
