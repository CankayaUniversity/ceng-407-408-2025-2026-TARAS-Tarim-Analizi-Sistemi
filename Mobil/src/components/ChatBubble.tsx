// LLM navigasyon sonrasi bildirim baloncugu
// Sohbet penceresiyle ayni estetik: ince cerceve, arka plan rengi, avatar yok
import { useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Animated,
  useWindowDimensions,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Theme } from "../types";
import { s, vs, ms } from "../utils/responsive";
import { useLanguage } from "../context/LanguageContext";

interface ChatBubbleProps {
  message: string;
  visible: boolean;
  theme: Theme;
  bottom: number;
  onPress: () => void;
  onDismiss: () => void;
}

const AUTO_DISMISS_MS = 8000;

export const ChatBubble = ({
  message,
  visible,
  theme,
  bottom,
  onPress,
  onDismiss,
}: ChatBubbleProps) => {
  const { height: windowHeight } = useWindowDimensions();
  const { t } = useLanguage();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();

      timerRef.current = setTimeout(() => dismiss(), AUTO_DISMISS_MS);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [visible]);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 20,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => onDismiss());
  };

  if (!visible) return null;

  // Maksimum yukseklik: ekranin %40'i
  const maxBubbleHeight = windowHeight * 0.4;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          bottom,
          maxHeight: maxBubbleHeight,
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <TouchableOpacity
        style={[
          styles.bubble,
          {
            backgroundColor: theme.background,
            borderColor: theme.accent + "18",
            shadowColor: theme.isDark ? "#000" : "#334155",
          },
        ]}
        onPress={onPress}
        activeOpacity={0.9}
      >
        {/* Ince header — sohbet penceresiyle ayni */}
        <View style={[styles.header, { borderBottomColor: theme.accent + "15" }]}>
          <View style={[styles.dot, { backgroundColor: theme.accent }]} />
          <Text style={[styles.headerText, { color: theme.textSecondary }]}>
            {t.chat.title}
          </Text>
          <TouchableOpacity
            onPress={dismiss}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialCommunityIcons
              name="close"
              size={14}
              color={theme.textSecondary + "80"}
            />
          </TouchableOpacity>
        </View>

        {/* Mesaj icerigi — scroll edilebilir */}
        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <Text style={[styles.text, { color: theme.text }]}>
            {message}
          </Text>
        </ScrollView>

        {/* Alt ipucu */}
        <Text style={[styles.hint, { color: theme.textSecondary + "60" }]}>
          {t.chat.tapToOpen}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    right: s(12),
    left: s(48),
    zIndex: 999,
    alignItems: "flex-end",
  },
  bubble: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    elevation: 12,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: s(12),
    paddingVertical: vs(8),
    borderBottomWidth: 1,
    gap: s(6),
  },
  dot: {
    width: s(5),
    height: s(5),
    borderRadius: 2.5,
  },
  headerText: {
    flex: 1,
    fontSize: ms(11, 0.3),
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  content: {
    paddingHorizontal: s(12),
    paddingVertical: vs(10),
  },
  text: {
    fontSize: ms(14, 0.3),
    lineHeight: ms(19, 0.3),
  },
  hint: {
    fontSize: ms(10, 0.3),
    textAlign: "center",
    paddingBottom: vs(8),
  },
});
