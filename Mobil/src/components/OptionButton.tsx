// Universal OptionButton — Settings ekranindaki secim butonu stilini her yerde tutarli kullanir.
// Aktif: bg=primary, beyaz metin/icon, 2px primary cerceve.
// Inaktif: bg=surface, koyu metin, 1px border cerceve.
// Yatay (icon yaninda) veya dikey (icon ustte) yerlesim destegi.

import { memo } from "react";
import { Text, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { PressableDark } from "./PressableDark";
import { Theme } from "../utils/theme";

export interface OptionButtonProps {
  theme: Theme;
  label: string;
  active: boolean;
  onPress: () => void;
  /** MaterialCommunityIcons icon name. */
  icon?: string;
  /** Layout: row (icon next to label) or column (icon above label). */
  layout?: "row" | "column";
  /** Vertical padding override. */
  paddingV?: number;
  /** Horizontal padding override. */
  paddingH?: number;
  /** Optional outer container style overrides (e.g. flex, margin). */
  style?: StyleProp<ViewStyle>;
  /** Font size override for the label text. */
  fontSize?: number;
  /** Icon size override. */
  iconSize?: number;
}

export const OptionButton = memo(function OptionButton({
  theme,
  label,
  active,
  onPress,
  icon,
  layout = "row",
  paddingV,
  paddingH,
  style,
  fontSize,
  iconSize,
}: OptionButtonProps) {
  const isColumn = layout === "column";
  const resolvedPaddingV = paddingV ?? (isColumn ? 8 : 10);
  const resolvedPaddingH = paddingH ?? (isColumn ? 6 : 12);
  const resolvedFontSize = fontSize ?? (isColumn ? 11 : 14);
  const resolvedIconSize = iconSize ?? (isColumn ? 18 : 18);

  return (
    <PressableDark
      onPress={onPress}
      style={[
        {
          flex: 1,
          flexDirection: isColumn ? "column" : "row",
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: resolvedPaddingH,
          paddingVertical: resolvedPaddingV,
          borderRadius: 10,
          backgroundColor: active ? theme.primary : theme.surface,
          // Border kalinligi HEP 1 — daha once active ise 2'ye cikiyordu, bu 1px layout kaymasina yol aciyordu
          // (kullanici "buton secilince boyutu buyuyor, hizalama bozuluyor" diye not etti). Renk degisikligiyle vurguluyoruz.
          borderWidth: 1,
          borderColor: active ? theme.primary : theme.border,
          overflow: "hidden",
        },
        style,
      ]}
    >
      {icon && (
        <MaterialCommunityIcons
          name={icon as any}
          size={resolvedIconSize}
          color={active ? theme.textOnPrimary : theme.primary}
          style={isColumn ? { marginBottom: 2 } : { marginRight: 6 }}
        />
      )}
      <Text
        style={{
          fontSize: resolvedFontSize,
          fontWeight: "700",
          textAlign: "center",
          color: active ? theme.textOnPrimary : theme.textMain,
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
      {/* Layout symmetry placeholder — keeps icon-less buttons aligned when paired */}
      {!icon && isColumn && <View style={{ height: 0 }} />}
    </PressableDark>
  );
});

export default OptionButton;
