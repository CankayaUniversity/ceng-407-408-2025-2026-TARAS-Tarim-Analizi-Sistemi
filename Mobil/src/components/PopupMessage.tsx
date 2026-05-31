// Popup mesaj (toast) — uygulama tasarimina uygun kart stili bildirim.
// SAF gorunum bilesenidir: gosterim/sure mantigi PopupMessageContext'te (tek
// kaynak). Boylece birden fazla yerde (kok + acik FullScreenModal ici) ayni
// durumu senkron yansitabilir. Layering: RN Modal ayri pencere actigi icin
// koktekı toast modallarin ALTINDA kalir; FullScreenModal kendi icinde de bir
// kopya cizer (bkz. GlobalToast / PopupMessageContext).
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../context/ThemeContext";
import { useKeyboard } from "../hooks/useKeyboard";
import { s, vs, ms } from "../utils/responsive";

interface PopupMessageProps {
  message: string;
  visible: boolean;
}

export const PopupMessage = ({ message, visible }: PopupMessageProps) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { keyboardHeight } = useKeyboard();
  const [mounted, setMounted] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;

  // visible true -> fade+slide in; false -> out, sonra unmount. Sure context'te.
  useEffect(() => {
    if (visible && message && message.trim()) {
      setMounted(true);
      Animated.timing(anim, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(anim, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible, message, anim]);

  if (!mounted || !message) return null;

  // Klavye aciksa onun hemen uzerine (form submit toast'lari klavye acikken gelir),
  // degilse: kokte alt nav bar'i, modal icinde alt kenari gececek bosluk. insets.bottom
  // modal penceresinde 0 okunabilir — fallback ile guvenli.
  const bottom =
    keyboardHeight > 0 ? keyboardHeight + vs(12) : (insets.bottom || 0) + vs(80);
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [vs(14), 0] });

  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom,
        alignItems: "center",
        paddingHorizontal: s(24),
        zIndex: 9999,
      }}
    >
      <Animated.View
        style={{
          opacity: anim,
          transform: [{ translateY }],
          maxWidth: "100%",
          backgroundColor: theme.surface,
          borderColor: theme.border,
          borderWidth: 1,
          borderRadius: s(14),
          paddingVertical: vs(12),
          paddingHorizontal: s(18),
          shadowColor: theme.shadowColor,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.16,
          shadowRadius: 16,
          elevation: 12,
        }}
      >
        <Text
          style={{
            color: theme.textMain,
            fontSize: ms(14, 0.3),
            fontWeight: "600",
            lineHeight: ms(19, 0.3),
            textAlign: "center",
          }}
        >
          {message}
        </Text>
      </Animated.View>
    </View>
  );
};
