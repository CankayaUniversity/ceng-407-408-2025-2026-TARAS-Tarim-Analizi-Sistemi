// Slim (~40dp) header rendered inline as the first child of a screen body,
// not via screenOptions header. Inline keeps header + content in one View that
// slides as a single piece on push/pop — the split native header/content slots
// otherwise desync and blank the content before the slide finishes.

import { type ReactNode } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useNavigation } from "@react-navigation/native";
import { useTheme } from "../context/ThemeContext";
import { spacing, ms } from "../utils/responsive";

export interface CompactStackHeaderRightAction {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  tint?: string;
  accessibilityLabel?: string;
}

export interface CompactStackHeaderProps {
  title?: string;
  subtitle?: string;
  rightAction?: CompactStackHeaderRightAction | ReactNode | null;
  /** Override back handler. Defaults to `navigation.goBack()`. */
  onBack?: () => void;
  /** Hide the back chevron. Defaults to true. */
  showBack?: boolean;
}

export const CompactStackHeader = ({
  title,
  subtitle,
  rightAction = null,
  onBack,
  showBack = true,
}: CompactStackHeaderProps) => {
  const { theme } = useTheme();
  const navigation = useNavigation();

  const handleBack = onBack ?? (() => navigation.goBack());

  const renderRight = () => {
    if (rightAction == null) return <View style={styles.iconSlot} />;
    if (
      typeof rightAction === "object" &&
      rightAction !== null &&
      "icon" in (rightAction as object)
    ) {
      const ra = rightAction as CompactStackHeaderRightAction;
      return (
        <TouchableOpacity
          onPress={ra.onPress}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.iconSlot}
          accessibilityRole="button"
          accessibilityLabel={ra.accessibilityLabel ?? ra.icon}
        >
          <Ionicons name={ra.icon} size={20} color={ra.tint ?? theme.textSecondary} />
        </TouchableOpacity>
      );
    }
    return <View style={styles.iconSlot}>{rightAction as ReactNode}</View>;
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.background,
          borderBottomColor: theme.divider,
        },
      ]}
    >
      <View style={styles.bar}>
        {showBack ? (
          <TouchableOpacity
            onPress={handleBack}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.iconSlot}
            accessibilityRole="button"
            accessibilityLabel="back"
          >
            <Ionicons
              name={Platform.OS === "ios" ? "chevron-back" : "arrow-back"}
              size={22}
              color={theme.textMain}
            />
          </TouchableOpacity>
        ) : (
          <View style={styles.iconSlot} />
        )}

        <View style={styles.titleWrap}>
          <Text
            style={[styles.title, { color: theme.textMain }]}
            numberOfLines={1}
          >
            {title ?? ""}
          </Text>
          {subtitle && (
            <Text
              style={[styles.subtitle, { color: theme.textSecondary }]}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          )}
        </View>

        {renderRight()}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  bar: {
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.xs,
  },
  iconSlot: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  titleWrap: {
    flex: 1,
    justifyContent: "center",
  },
  title: {
    fontSize: ms(15, 0.3),
    fontWeight: "700",
    letterSpacing: -0.1,
  },
  subtitle: {
    fontSize: ms(11, 0.3),
    fontWeight: "500",
    marginTop: 1,
  },
});
