// LLM navigate_to_section hedefi — wrapper section
// onLayout ile y pozisyonunu yakalar, focus eslesince scrollTo + border vurgusu.
// Vurgu, odak (focus) TEMIZLENENE kadar KALIR — yani LLM balonu (popup) acik oldugu
// surece bolum vurgulu kalir. Balon kapaninca ChatBubbleLayer clearFocus() cagirir,
// buradaki effect de vurguyu soldurur. (Eskiden kisa bir pulse oynayip kendini
// temizliyordu; artik kalici.)
// scrollMode="scroll" (default): parent ScrollView'u hedefe kaydirir
// scrollMode="pulse-only": sadece border vurgusu (Home 3D gibi scroll olmayan yerler)
import { useEffect, useRef, useCallback, RefObject } from "react";
import { Animated, ScrollView, LayoutChangeEvent } from "react-native";
import { ScreenType } from "../constants";
import { Theme } from "../utils/theme";
import { useSectionFocusFor } from "../context/SectionFocusContext";

interface FocusableSectionProps {
  id: string;
  screen: ScreenType;
  theme: Theme;
  scrollViewRef?: RefObject<ScrollView | null>;
  scrollMode?: "scroll" | "pulse-only";
  scrollOffset?: number;
  children: React.ReactNode;
  style?: object;
}

// Vurgu fade in/out sureleri
const HL_IN_MS = 280;
const HL_OUT_MS = 600;

export const FocusableSection = ({
  id,
  screen,
  theme,
  scrollViewRef,
  scrollMode = "scroll",
  scrollOffset = 16,
  children,
  style,
}: FocusableSectionProps) => {
  const screenFocus = useSectionFocusFor(screen);
  const yRef = useRef<number>(0);
  const lastNonceRef = useRef<number>(-1);
  const pendingScrollRef = useRef<boolean>(false);
  const pulseAnim = useRef(new Animated.Value(0)).current;

  // Scroll hedefine git
  const doScroll = useCallback(() => {
    scrollViewRef?.current?.scrollTo({
      y: Math.max(0, yRef.current - scrollOffset),
      animated: true,
    });
  }, [scrollViewRef, scrollOffset]);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    yRef.current = e.nativeEvent.layout.y;
    // Eger bir odak istegi beklerken layout gelirse scroll tetikle
    if (pendingScrollRef.current && scrollMode === "scroll" && scrollViewRef?.current) {
      doScroll();
      pendingScrollRef.current = false;
    }
  }, [scrollMode, scrollViewRef, doScroll]);

  // Odak istegini dinle — screenFocus sadece bu ekrana ait focus'u tasir.
  // Bu bolum odaktaysa: (yeni nonce'da) kaydir + vurguyu AC ve TUT.
  // Odak baska bolum/ekran ise ya da temizlendiyse: vurguyu soldur.
  useEffect(() => {
    if (!screenFocus || screenFocus.section !== id) {
      Animated.timing(pulseAnim, {
        toValue: 0,
        duration: HL_OUT_MS,
        useNativeDriver: false,
      }).start();
      return;
    }

    // Yeni odak istegi (nonce) ise bir kez kaydir
    if (screenFocus.nonce !== lastNonceRef.current) {
      lastNonceRef.current = screenFocus.nonce;
      console.log("[FOCUS] hit:", screen, id, "#", screenFocus.nonce);
      if (scrollMode === "scroll" && scrollViewRef?.current) {
        if (yRef.current > 0) {
          doScroll();
        } else {
          // Henuz onLayout olmamissa pending flag'i ile bekle
          pendingScrollRef.current = true;
        }
      }
    }

    // Vurguyu AC — scroll once govdeyi getirsin diye kisa gecikme, sonra fade-in ve TUT.
    const delay = setTimeout(() => {
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: HL_IN_MS,
        useNativeDriver: false,
      }).start();
    }, 150);
    return () => clearTimeout(delay);
  }, [screenFocus, id, screen, scrollMode, scrollViewRef, doScroll, pulseAnim]);

  // Border rengi interpolasyonu — saydam -> accent
  const borderColor = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.accent + "00", theme.accent],
  });

  return (
    <Animated.View
      onLayout={handleLayout}
      style={[
        {
          borderWidth: 2,
          borderColor,
          borderRadius: 10,
          margin: -2,
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
};
