// Profil butonu - kullanici bas harflerini gosterir
// Props: username, theme, size, onPress
import { TouchableOpacity, Text } from "react-native";
import { Theme } from "../utils/theme";

export interface ProfileButtonProps {
  username: string;
  theme: Theme;
  size: number;
  onPress?: () => void;
}

export const ProfileButton = ({
  username,
  theme,
  size,
  onPress,
}: ProfileButtonProps) => {
  // Kullanici adinin ilk 2 harfini al
  const getInitials = (name: string): string => {
    if (!name || name.length < 2) return "US";
    return name.slice(0, 2).toUpperCase();
  };

  const initials = getInitials(username);
  const fontSize = size * 0.35;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className="center"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: theme.primary,
        borderWidth: 2,
        borderColor: theme.primary + "40",
        shadowColor: theme.shadowColor,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
        elevation: 3,
      }}
    >
      <Text
        className="font-bold text-center tracking-wider"
        style={{
          color: theme.textOnPrimary,
          fontSize,
        }}
      >
        {initials}
      </Text>
    </TouchableOpacity>
  );
};
