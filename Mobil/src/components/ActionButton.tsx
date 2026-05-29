// Birincil / ikincil CTA butonu — Uygula, Kaydet, Paylas vb. icin.
// Variantlar:
//   primary  : dolgulu (bg=theme.primary, text=theme.textOnPrimary)
//   secondary: cerceveli (bg=transparent, text=theme.primary, 1.5px primary border)
// disabled iken opaklik 0.4 + dokunulamaz; metin/cerceve degismez, hala okunabilir.

import { memo } from "react";
import { Text, ActivityIndicator } from "react-native";
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
  /** MaterialCommunityIcons icon name (label SOLUNDA). */
  icon?: string;
  /** MaterialCommunityIcons icon name (label SAGINDA — orn. "ileri" chevron'u). */
  trailingIcon?: string;
  /** Outer style overrides (flex, margin, width). */
  style?: StyleProp<ViewStyle>;
  fontSize?: number;
  iconSize?: number;
  paddingV?: number;
  paddingH?: number;
  /** true iken label/icon yerine spinner gosterir + dokunulamaz (devam eden islem). */
  loading?: boolean;
}

export const ActionButton = memo(function ActionButton({
  theme,
  label,
  onPress,
  variant = "primary",
  disabled = false,
  icon,
  trailingIcon,
  style,
  fontSize = 14,
  iconSize = 16,
  paddingV = 12,
  paddingH = 16,
  loading = false,
}: ActionButtonProps) {
  const isPrimary = variant === "primary";
  const bg = isPrimary ? theme.primary : "transparent";
  const fg = isPrimary ? theme.textOnPrimary : theme.primary;
  const borderColor = theme.primary;
  const borderWidth = isPrimary ? 0 : 1.5;

  return (
    <PressableDark
      onPress={disabled || loading ? undefined : onPress}
      disabled={disabled || loading}
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
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <>
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
          {trailingIcon && (
            <MaterialCommunityIcons
              name={trailingIcon as any}
              size={iconSize}
              color={fg}
              style={{ marginLeft: 6 }}
            />
          )}
        </>
      )}
    </PressableDark>
  );
});

export default ActionButton;
