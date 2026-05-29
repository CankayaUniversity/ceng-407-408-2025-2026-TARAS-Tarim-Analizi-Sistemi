// Yeniden kullanilabilir ince ayirici cizgi — bolumler arasi gorsel ayrim.
// theme prop ile gelir (ev konvansiyonu), hairlineWidth ile en keskin cizgi.
// Props: orientation (yatay/dikey), spacing (ana eksende ust/alt veya sol/sag bosluk),
//        inset (karsi eksende ic cekme), color (varsayilan theme.divider).

import { memo } from "react";
import { View, StyleSheet } from "react-native";
import type { Theme } from "../utils/theme";

interface DividerProps {
  theme: Theme;
  orientation?: "horizontal" | "vertical";
  spacing?: number;
  inset?: number;
  color?: string;
}

export const Divider = memo(function Divider({
  theme,
  orientation = "horizontal",
  spacing = 0,
  inset = 0,
  color,
}: DividerProps) {
  const lineColor = color ?? theme.divider;

  if (orientation === "vertical") {
    return (
      <View
        style={{
          width: StyleSheet.hairlineWidth,
          alignSelf: "stretch",
          backgroundColor: lineColor,
          marginHorizontal: spacing,
          marginVertical: inset,
        }}
      />
    );
  }

  return (
    <View
      style={{
        height: StyleSheet.hairlineWidth,
        backgroundColor: lineColor,
        marginVertical: spacing,
        marginHorizontal: inset,
      }}
    />
  );
});

export default Divider;
