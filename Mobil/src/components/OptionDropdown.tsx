// Universal OptionDropdown — Modal overlay-based dropdown.
//
// Tasarim notlari:
//   - Inline expansion DEGIL: panel acildiginda Modal'a bir overlay olarak render edilir
//     ve sayfa icerigini asagi itmez.
//   - Trigger'in ekrandaki konumu `measureInWindow` ile olculur, panel triggerin tam
//     altina (PANEL_GAP=0 ile yapisik) yerlesir. Asagida yer yoksa yukari acilir.
//   - openUpwards safety: yalnizca anchor TRIGGER ekranin alt yarisindaysa ve asagida yer azsa
//     yukari acar; aksi durumda her zaman asagi acar (toolbar dropdownlari yanlislikla
//     yukari acmasin diye).
//   - Backdrop'a dokununca kapanir; arka plan saydam koyu.
//   - Acilis/kapanma: tek bir Animated.Value (openProgress) hem Modal opaklik hem trigger
//     kose radyusunu suruyor — boylece panel fade-out'la trigger kose radyusu sync ic gozukur.
//   - Modal'a animationType="none" verdik; opaklik ve diger animasyonlari elde yonetiyoruz.
//
// API:
//   <OptionDropdown
//     theme={theme}
//     label="Aralık"
//     value={"24h"}
//     options={[{ value: "24h", label: "24 Saat" }, ...]}
//     onChange={(v) => setRange(v)}
//     displayLabel={isCustom ? "Özel" : undefined}
//     showLabel={false}  // trigger icindeki kucuk key-chip etiketini gizle
//   />

import { memo, useCallback, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  ScrollView,
  Dimensions,
  Platform,
  Animated,
  StyleSheet,
} from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Theme } from "../utils/theme";
import { IS_EXPO_GO } from "../utils/runtimeEnv";

export interface DropdownOption<V extends string | number> {
  value: V;
  label: string;
  /** Optional MaterialCommunityIcons icon next to the label */
  icon?: string;
  /** Optional ikinci satir — label altinda kucuk gri yazi (orn. tarla sayisi, buyume gunu). */
  subtitle?: string;
  /** Optional satir sonu elemani (orn. sil butonu). Secili check'inden sonra gelir.
      Kendi onPress'inde e.stopPropagation() cagir ki satir secimi tetiklenmesin. */
  trailing?: ReactNode;
}

export interface OptionDropdownProps<V extends string | number> {
  theme: Theme;
  /** Kucuk key-chip etiketi (acik) — gosterilmek istenmiyorsa showLabel=false yap. */
  label: string;
  value: V;
  options: DropdownOption<V>[];
  onChange: (next: V) => void;
  /** Trigger button sizing/positioning */
  style?: StyleProp<ViewStyle>;
  /** Disable opening (read-only) */
  disabled?: boolean;
  /** Trigger label'i value'nun option'i ile uyumsuzsa zorla (orn. ozel tarih araligi) */
  displayLabel?: string;
  /** Trigger icindeki kucuk key-chip etiketi gosterilsin mi (varsayilan true). */
  showLabel?: boolean;
  /** Panel modal'i status bar altina uzansin mi (Android). Yalnizca dropdown, status bar'i
      KAPLAYAN bir host icinde (statusBarTranslucent modal ya da presentationStyle:fullScreen)
      render ediliyorsa true ver — boylece panel trigger ile hizali kalir. Varsayilan false
      (kok ekran ve normal modal hostlari window-relative olcer; panel de status bar altina inmemeli). */
  statusBarTranslucent?: boolean;
  /** Trigger yuksekligi (px). Varsayilan 44 — toolbar/quick-settings butonlariyla hizali.
      Header gibi daha ince yerlerde daha kucuk bir deger verilebilir. */
  triggerHeight?: number;
  /** Trigger icinde, label ile chevron arasinda gosterilen ek eleman (orn. ciftlik rol rozeti).
      Boylece rozet ayri bir satir olmadan dropdown'un kendi icinde durur. */
  triggerAccessory?: ReactNode;
}

// Trigger sabit yuksekligi — toolbar'daki OptionButton ve kare butonlarla ayni hizada dursun diye.
const TRIGGER_HEIGHT = 44;
// Modal panelinin yukseklik ve pay sabitleri
// PANEL_GAP=0: trigger ile panel "yapisik" gozukur (kullanici talebi: floaty degil, bagli).
const PANEL_GAP = 0;
const PANEL_MARGIN = 16; // ekran kenarindan en az bu kadar uzak dursun
const ITEM_H = 44; // tek bir secim ogesinin yaklasik yuksekligi
const PANEL_MAX_H = 320;
// Acilis/kapanma animasyonu suresi (ms). Modal'in default fade'i degil; bu, hem Modal opaklik
// hem trigger kose radyusu icin ortak suredir. JS-thread driver kullaniyoruz (radyus icin gerekli).
const ANIM_DURATION = 200;

function OptionDropdownInner<V extends string | number>({
  theme,
  label,
  value,
  options,
  onChange,
  style,
  disabled,
  displayLabel,
  showLabel = true,
  statusBarTranslucent = false,
  triggerHeight = TRIGGER_HEIGHT,
  triggerAccessory,
}: OptionDropdownProps<V>) {
  const [open, setOpen] = useState(false);
  // Trigger'in ekrandaki konumu (window-relative)
  const [anchor, setAnchor] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const triggerWrapRef = useRef<View>(null);
  const insets = useSafeAreaInsets();

  // Acilma/kapanma ilerleme animasyonu — 0=kapali, 1=acik.
  // Hem Modal opacity'sini hem trigger kose radyusunu/border rengini bu deger suruyor.
  // Bu sayede panel fade-out'u ile trigger kose duzlesmesi tam senkron.
  const openProgress = useRef(new Animated.Value(0)).current;
  // Press darken overlay (PressableDark'i bagimsiz Animated ile yeniden uretiyoruz).
  const pressOverlay = useRef(new Animated.Value(0)).current;

  const current = options.find((o) => o.value === value);
  // displayLabel verildiyse o oncelikli (orn. ozel tarih araligi label'i value=-1'in "Custom" label'inden once gozuksun).
  const triggerLabel = displayLabel ?? current?.label ?? "—";

  const openDropdown = useCallback(() => {
    if (disabled) return;
    triggerWrapRef.current?.measureInWindow((x, y, w, h) => {
      setAnchor({ x, y, w, h });
      setOpen(true);
      Animated.timing(openProgress, {
        toValue: 1,
        duration: ANIM_DURATION,
        useNativeDriver: false,
      }).start();
    });
  }, [disabled, openProgress]);

  const closeDropdown = useCallback(() => {
    Animated.timing(openProgress, {
      toValue: 0,
      duration: ANIM_DURATION,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) setOpen(false);
    });
  }, [openProgress]);

  const handleSelect = useCallback(
    (v: V) => {
      onChange(v);
      closeDropdown();
    },
    [onChange, closeDropdown],
  );

  const handlePressIn = useCallback(() => {
    Animated.timing(pressOverlay, {
      toValue: 1,
      duration: 80,
      useNativeDriver: false,
    }).start();
  }, [pressOverlay]);
  const handlePressOut = useCallback(() => {
    Animated.timing(pressOverlay, {
      toValue: 0,
      duration: 180,
      useNativeDriver: false,
    }).start();
  }, [pressOverlay]);

  // Panel yerlesim hesabi
  const screenH = Dimensions.get("window").height;
  const idealH = Math.min(PANEL_MAX_H, options.length * ITEM_H + 2);
  // Android edge-to-edge (SDK 55 / Android 15) duzeltmesi: standalone build'de panel modal'i
  // tam ekran (status bar altina) cizilir ama measureInWindow trigger Y'sini ICERIK alanina gore
  // (status bar HARIC) dondurur -> panel status bar yuksekligi kadar YUKARI kayip trigger'in
  // ustune biner ("on top"). status bar'i KAPLAYAN host icindeyken (statusBarTranslucent=true)
  // measure zaten ekran-mutlak doner; ek pay GEREKMEZ. Expo Go (non-edge-to-edge) zaten dogru
  // hizaliyor -> ona dokunma (sadece native standalone'da pay ekle).
  const sbOffset =
    Platform.OS === "android" && !IS_EXPO_GO && !statusBarTranslucent ? insets.top : 0;
  const anchorTop = anchor.y + sbOffset;
  const spaceBelow = screenH - (anchorTop + anchor.h) - PANEL_MARGIN;
  const spaceAbove = anchorTop - PANEL_MARGIN;
  // Safety: yukari acilmasi icin trigger'in ekran alt yarisinda olmasi gerek.
  // (toolbar dropdownlari ekranin ust kisminda — burada yanlislikla yukari acmasinlar.)
  const inBottomHalf = anchorTop > screenH / 2;
  const openUpwards =
    inBottomHalf &&
    spaceBelow < Math.min(idealH, 160) &&
    spaceAbove > spaceBelow;
  const panelH = Math.max(80, Math.min(idealH, openUpwards ? spaceAbove : spaceBelow));
  const panelTop = openUpwards
    ? anchorTop - panelH - PANEL_GAP
    : anchorTop + anchor.h + PANEL_GAP;

  // Animasyonlu interpolasyonlar
  const radiusInterp = openProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [10, 0],
  });
  const borderColorAnim = openProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.border, theme.primary],
  });
  // Trigger'in panel-tarafindaki border'ini "gorunmez" yap (surface ile ayni renk) — boylece seam temiz gozukur.
  const seamColorAnim = openProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.border, theme.surface],
  });

  return (
    // Disardaki regular View ref ve measureInWindow icin —
    // Animated.View ref'i Android'de bazi durumlarda h=0 donduruyor (panel ust uste binmesi).
    // EXPLICIT height: toolbar'da style={{flex:1}} (acik yukseklik yok) verildiginde Android'de
    // measureInWindow h=0 donduruyordu -> panel trigger'in uzerine biniyordu. Sabit yukseklik bunu cozer.
    <View
      ref={triggerWrapRef}
      collapsable={false}
      style={[style, { height: triggerHeight }]}
    >
      <Animated.View
        style={{
          height: triggerHeight,
          justifyContent: "center",
          backgroundColor: theme.surface,
          borderWidth: 1,
          // Kalinligi hep 1 tutuyoruz (layout shift yok). Renkleri animated ile yumusatiyoruz.
          borderLeftColor: borderColorAnim,
          borderRightColor: borderColorAnim,
          // Panel-tarafindaki border yumusakca surface'a kayar (seam'i kapatir).
          borderTopColor: openUpwards ? seamColorAnim : borderColorAnim,
          borderBottomColor: openUpwards ? borderColorAnim : seamColorAnim,
          // Panel-tarafindaki koseler yumusakca duzlesir.
          borderTopLeftRadius: openUpwards ? radiusInterp : 10,
          borderTopRightRadius: openUpwards ? radiusInterp : 10,
          borderBottomLeftRadius: openUpwards ? 10 : radiusInterp,
          borderBottomRightRadius: openUpwards ? 10 : radiusInterp,
          overflow: "hidden",
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <Pressable
          onPress={openDropdown}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 12,
          }}
        >
          {/* Press darken overlay — PressableDark'in muadili (Animated.View'a tasidik). */}
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFillObject,
              { backgroundColor: "rgba(0,0,0,0.10)", opacity: pressOverlay },
            ]}
          />
          {showLabel && (
            <Text
              style={{
                fontSize: 10,
                fontWeight: "600",
                color: theme.textSecondary,
                marginRight: 6,
                textTransform: "uppercase",
                letterSpacing: 0.4,
              }}
            >
              {label}
            </Text>
          )}
          <Text
            style={{
              flex: 1,
              fontSize: 14,
              fontWeight: "700",
              color: theme.textMain,
            }}
            numberOfLines={1}
          >
            {triggerLabel}
          </Text>
          {triggerAccessory ? (
            <View style={{ marginRight: 8 }}>{triggerAccessory}</View>
          ) : null}
          <MaterialCommunityIcons
            name={open ? "chevron-up" : "chevron-down"}
            size={18}
            color={theme.primary}
          />
        </Pressable>
      </Animated.View>

      <Modal
        visible={open}
        transparent
        // animationType="none" — fade'i kendi Animated'imizla yoneterek trigger ile sync edebiliyoruz.
        animationType="none"
        // Native standalone'da panel modal'i HER ZAMAN tam ekran (status bar altina) olsun ki
        // yukaridaki sbOffset duzeltmesi tutarli bir referansa (D=0) dayansin. Expo Go'da prop'a
        // gore birak — mevcut dogru hizalama bozulmasin.
        statusBarTranslucent={
          Platform.OS === "android" && (statusBarTranslucent || !IS_EXPO_GO)
        }
        onRequestClose={closeDropdown}
      >
        {/* Backdrop + panel butun blogu opaklik animasyonuyla tek seferde fade in/out olur. */}
        <Animated.View style={{ flex: 1, opacity: openProgress }}>
          <Pressable
            onPress={closeDropdown}
            style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.12)" }}
          >
            {/* Panel — window-relative absolute konum.
                Pressable'i yutar ki panel uzerinde tikleme kapatmasin. */}
            <Pressable
              onPress={(e) => e.stopPropagation()}
              style={{
                position: "absolute",
                top: panelTop,
                left: anchor.x,
                width: anchor.w,
                maxHeight: panelH,
                // Trigger ile yapisik gozuksun diye: panel ASAGI aciliyorsa ust koseler duz,
                // YUKARI aciliyorsa alt koseler duz.
                borderTopLeftRadius: openUpwards ? 10 : 0,
                borderTopRightRadius: openUpwards ? 10 : 0,
                borderBottomLeftRadius: openUpwards ? 0 : 10,
                borderBottomRightRadius: openUpwards ? 0 : 10,
                backgroundColor: theme.surface,
                borderWidth: 1,
                borderColor: theme.primary,
                // Trigger ile birlestigimiz tarafi border'siz yap — yoksa seam'de cift border olur.
                borderTopWidth: openUpwards ? 1 : 0,
                borderBottomWidth: openUpwards ? 0 : 1,
                overflow: "hidden",
                elevation: 16,
                shadowColor: theme.shadowColor,
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.22,
                shadowRadius: 10,
              }}
            >
              <ScrollView
                bounces={false}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {options.map((opt, idx) => {
                  const selected = opt.value === value;
                  return (
                    <Pressable
                      key={String(opt.value)}
                      onPress={() => handleSelect(opt.value)}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingHorizontal: 12,
                        paddingVertical: 12,
                        backgroundColor: selected
                          ? theme.primary + "1A"
                          : "transparent",
                        borderBottomWidth: idx < options.length - 1 ? 1 : 0,
                        borderBottomColor: theme.divider,
                      }}
                    >
                      {opt.icon && (
                        <MaterialCommunityIcons
                          name={opt.icon as any}
                          size={16}
                          color={selected ? theme.primary : theme.textSecondary}
                          style={{ marginRight: 10 }}
                        />
                      )}
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            fontSize: 14,
                            fontWeight: selected ? "700" : "500",
                            color: selected ? theme.primary : theme.textMain,
                          }}
                          numberOfLines={1}
                        >
                          {opt.label}
                        </Text>
                        {opt.subtitle ? (
                          <Text
                            style={{
                              fontSize: 11,
                              color: theme.textSecondary,
                              marginTop: 1,
                            }}
                            numberOfLines={1}
                          >
                            {opt.subtitle}
                          </Text>
                        ) : null}
                      </View>
                      {selected && (
                        <MaterialCommunityIcons
                          name="check"
                          size={18}
                          color={theme.primary}
                        />
                      )}
                      {opt.trailing ? (
                        <View style={{ marginLeft: 8 }}>{opt.trailing}</View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Animated.View>
      </Modal>
    </View>
  );
}

// memo helps when the same dropdown re-renders unchanged
export const OptionDropdown = memo(OptionDropdownInner) as typeof OptionDropdownInner;

export default OptionDropdown;
