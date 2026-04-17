// Bildirim butonu - zil simgesi, AppHeader'in sag tarafinda yer alir
import { TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Theme } from "../utils/theme";

export interface NotificationsButtonProps {
  theme: Theme;
  size: number;
  onPress?: () => void;
}

export const NotificationsButton = ({
  theme,
  size,
  onPress,
}: NotificationsButtonProps) => {
  const iconSize = size * 0.55;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className="center"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: theme.surface,
        borderWidth: 2,
        borderColor: theme.primary + "30",
        shadowColor: theme.shadowColor,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
        elevation: 3,
      }}
    >
      <Ionicons name="notifications-outline" size={iconSize} color={theme.primary} />
    </TouchableOpacity>
  );
};
