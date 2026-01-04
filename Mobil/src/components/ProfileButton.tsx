import { TouchableOpacity, Text } from 'react-native';
import { Theme } from '../utils/theme';

export interface ProfileButtonProps {
  username: string;
  theme: Theme;
  size: number;
  onPress?: () => void;
}

/**
 * ProfileButton - Circular button displaying user initials
 *
 * Displays the first 2 letters of the username in uppercase.
 * Styled with theme accent color and scales based on size prop.
 *
 * @param username - User's username (first 2 letters will be used)
 * @param theme - Theme object for styling
 * @param size - Button diameter in pixels
 * @param onPress - Optional press handler (e.g., navigate to profile/settings)
 *
 * @example
 * <ProfileButton
 *   username="john_doe"
 *   theme={theme}
 *   size={48}
 *   onPress={() => navigation.navigate('Profile')}
 * />
 * // Displays: "JO"
 */
export const ProfileButton = ({ username, theme, size, onPress }: ProfileButtonProps) => {
  /**
   * Extracts first 2 characters from username and converts to uppercase
   * Falls back to "US" if username is empty or too short
   */
  const getInitials = (name: string): string => {
    if (!name || name.length < 2) return 'US';
    return name.slice(0, 2).toUpperCase();
  };

  const initials = getInitials(username);

  // Font size is 35% of button size for optimal visual balance
  const fontSize = size * 0.35;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2, // Perfect circle
        backgroundColor: theme.accent,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: theme.accent + '40', // 40% opacity for subtle border
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
        elevation: 3, // Android shadow
      }}
    >
      <Text
        style={{
          color: theme.surface,
          fontSize: fontSize,
          fontWeight: '700',
          letterSpacing: 0.5,
          textAlign: 'center',
        }}
      >
        {initials}
      </Text>
    </TouchableOpacity>
  );
};
