// Birincil / ikincil CTA butonu — Uygula, Kaydet, Paylas vb. icin.
// Variantlar:
//   primary  : dolgulu (bg=theme.primary, text=theme.textOnPrimary)
//   secondary: cerceveli (bg=transparent, text=theme.primary, 1.5px primary border)
// disabled iken opaklik 0.4 + dokunulamaz; metin/cerceve degismez, hala okunabilir.

import { memo } from "react";
import { Text } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { PressableDark } from "./PressableDark";
import { Theme } from "../utils/theme";

export type ActionButtonVariant = "primary" | "secondary";

export interface ActionButtonProps {
  theme: Theme;
  label: string;
  onPress: () => void;
  variant?: ActionButtonVariant;
  disabled?: boolean;
  /** MaterialCommunityIcons icon name. */
  icon?: string;
  /** Outer style overrides (flex, margin, width). */
  style?: StyleProp<ViewStyle>;
  fontSize?: number;
  iconSize?: number;
  paddingV?: number;
  paddingH?: number;
}

export const ActionButton = memo(function ActionButton({
  theme,
  label,
  onPress,
  variant = "primary",
  disabled = false,
  icon,
  style,
  fontSize = 14,
  iconSize = 16,
  paddingV = 12,
  paddingH = 16,
}: ActionButtonProps) {
  const isPrimary = variant === "primary";
  const bg = isPrimary ? theme.primary : "transparent";
  const fg = isPrimary ? theme.textOnPrimary : theme.primary;
  const borderColor = theme.primary;
  const borderWidth = isPrimary ? 0 : 1.5;

  return (
    <PressableDark
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      style={[
        {
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: paddingH,
          paddingVertical: paddingV,
          borderRadius: 12,
          backgroundColor: bg,
          borderWidth,
          borderColor,
          opacity: disabled ? 0.4 : 1,
          overflow: "hidden",
        },
        style,
      ]}
    >
      {icon && (
        <MaterialCommunityIcons
          name={icon as any}
          size={iconSize}
          color={fg}
          style={{ marginRight: 6 }}
        />
      )}
      <Text
        style={{
          fontSize,
          fontWeight: "700",
          textAlign: "center",
          color: fg,
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </PressableDark>
  );
});

export default ActionButton;
