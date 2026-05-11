// LLM navigate_to_section hedefi — wrapper section
// onLayout ile y pozisyonunu yakalar, focus eslesince scrollTo + border pulse
// scrollMode="scroll" (default): parent ScrollView'u hedefe kaydirir
// scrollMode="pulse-only": sadece border pulse (Home 3D gibi scroll olmayan yerler)
import { useEffect, useRef, useCallback, RefObject } from "react";
import { Animated, ScrollView, LayoutChangeEvent } from "react-native";
import { ScreenType } from "../constants";
import { Theme } from "../utils/theme";
import { useSectionFocus, useSectionFocusFor } from "../context/SectionFocusContext";

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

// Pulse timing — in/hold/out
const PULSE_IN_MS = 280;
const PULSE_HOLD_MS = 520;
const PULSE_OUT_MS = 600;

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
  const { clearFocus } = useSectionFocus();
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

  // Pulse animasyonu
  const runPulse = useCallback(() => {
    pulseAnim.setValue(0);
    Animated.sequence([
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: PULSE_IN_MS,
        useNativeDriver: false,
      }),
      Animated.delay(PULSE_HOLD_MS),
      Animated.timing(pulseAnim, {
        toValue: 0,
        duration: PULSE_OUT_MS,
        useNativeDriver: false,
      }),
    ]).start(() => {
      clearFocus();
    });
  }, [pulseAnim, clearFocus]);

  // Odak istegini dinle — screenFocus sadece bu ekrana ait focus'u tasir
  useEffect(() => {
    if (!screenFocus) return;
    if (screenFocus.section !== id) return;
    if (screenFocus.nonce === lastNonceRef.current) return;
    lastNonceRef.current = screenFocus.nonce;

    console.log("[FOCUS] hit:", screen, id, "#", screenFocus.nonce);

    // Scroll tetikle (eger mod scroll ise ve y biliniyorsa)
    if (scrollMode === "scroll" && scrollViewRef?.current) {
      if (yRef.current > 0) {
        doScroll();
      } else {
        // Henuz onLayout olmamissa pending flag'i ile bekle
        pendingScrollRef.current = true;
      }
    }

    // Pulse'u kisa bir delay ile baslat — scroll animasyonu once govdeyi getirsin
    const delay = setTimeout(() => runPulse(), 150);
    return () => clearTimeout(delay);
  }, [screenFocus, id, scrollMode, scrollViewRef, doScroll, runPulse]);

  // Border rengi interpolasyonu — saydam -> accent -> saydam
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
          borderRadius: 14,
          margin: -2,
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
};
