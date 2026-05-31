// Modal/sheet ortak baslik cubugu — geri/kapat butonu + baslik (+ ops. sag eleman)
// FullScreenModal ve BottomSheet bunu kullanir; her modal kendi header'ini yeniden
// yazmasin diye tek yerde toplandi.
//
// Yerlesim 3 sutun: [sol slot][baslik (flex)][sag slot].
//   - variant="primary": olive zemin + ortalanmis baslik (donanim kurulum tarzi).
//   - variant="plain":   saydam zemin + sola yasli baslik (varsayilan).
//   - onBack verilince sol slotta geri/kapat butonu; onClose/right verilince sag slotta kapat (X).

import type { ReactNode } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Theme } from "../utils/theme";
import { s, vs, ms } from "../utils/responsive";

export interface ModalHeaderProps {
  theme: Theme;
  title: string;
  /** "primary" = renkli (olive) zemin + ortalanmis baslik; "plain" = saydam + sola yasli. */
  variant?: "plain" | "primary";
  /** Baslik hizasi — verilmezse variant'a gore (primary→center, plain→left). */
  align?: "left" | "center";
  /** Sol bas butonu (geri/kapat). Verilmezse sol slot bos. */
  onBack?: () => void;
  /** Sol buton ikonu — varsayilan "arrow-left". */
  backIcon?: string;
  /** Sag bas kapat (X) butonu. `right` verilirse o oncelikli. */
  onClose?: () => void;
  /** Ozel sag eleman (onClose X yerine). */
  right?: ReactNode;
  /** Alt cizgi (yalnizca plain). */
  bordered?: boolean;
}

const SLOT = s(40);
const HIT = { top: 10, bottom: 10, left: 10, right: 10 };

export const ModalHeader = ({
  theme,
  title,
  variant = "plain",
  align,
  onBack,
  backIcon = "arrow-left",
  onClose,
  right,
  bordered = false,
}: ModalHeaderProps) => {
  const onPrimary = variant === "primary";
  const fg = onPrimary ? theme.textOnPrimary : theme.textMain;
  const resolvedAlign = align ?? (onPrimary ? "center" : "left");
  const centered = resolvedAlign === "center";

  const leftEl = onBack ? (
    <TouchableOpacity
      onPress={onBack}
      hitSlop={HIT}
      style={{ width: SLOT, height: SLOT, alignItems: "flex-start", justifyContent: "center" }}
    >
      <MaterialCommunityIcons name={backIcon as any} size={24} color={fg} />
    </TouchableOpacity>
  ) : (
    // Ortali baslikta sag X ile dengelemek icin bos slot; sola yasli baslikta yer kaplamasin.
    <View style={{ width: centered ? SLOT : 0 }} />
  );

  const rightEl =
    right ??
    (onClose ? (
      <TouchableOpacity
        onPress={onClose}
        hitSlop={HIT}
        style={{ width: SLOT, height: SLOT, alignItems: "flex-end", justifyContent: "center" }}
      >
        <MaterialCommunityIcons name="close" size={24} color={fg} />
      </TouchableOpacity>
    ) : (
      <View style={{ width: centered ? SLOT : 0 }} />
    ));

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: s(16),
        paddingVertical: vs(12),
        backgroundColor: onPrimary ? theme.primary : "transparent",
        borderBottomWidth: bordered ? 1 : 0,
        borderBottomColor: theme.divider,
      }}
    >
      {leftEl}
      <Text
        numberOfLines={1}
        style={{
          flex: 1,
          fontSize: ms(18, 0.3),
          fontWeight: "700",
          color: fg,
          textAlign: centered ? "center" : "left",
          // Sola yasli + geri butonu varsa baslik ile buton arasi bosluk.
          marginLeft: !centered && onBack ? s(12) : 0,
        }}
      >
        {title}
      </Text>
      {rightEl}
    </View>
  );
};

export default ModalHeader;
