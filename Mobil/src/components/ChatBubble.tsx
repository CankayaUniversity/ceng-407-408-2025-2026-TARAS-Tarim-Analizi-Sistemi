// LLM navigasyon sonrasi bildirim baloncugu
// Sohbet penceresiyle ayni estetik: ince cerceve, arka plan rengi, avatar yok
import { useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Animated,
  useWindowDimensions,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Markdown from "@ronradtke/react-native-markdown-display";
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
      style={{
        position: "absolute",
        right: s(12),
        left: s(48),
        bottom,
        maxHeight: maxBubbleHeight,
        zIndex: 999,
        alignItems: "flex-end" as const,
        opacity,
        transform: [{ translateY }],
      }}
    >
      <TouchableOpacity
        className="w-full rounded-2xl border overflow-hidden"
        style={{
          backgroundColor: theme.background,
          borderColor: theme.primary + "18",
          shadowColor: theme.shadowColor,
          elevation: 12,
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.2,
          shadowRadius: 12,
        }}
        onPress={onPress}
        activeOpacity={0.9}
      >
        {/* Ince header — sohbet penceresiyle ayni */}
        <View
          className="row border-b"
          style={{
            paddingHorizontal: s(12),
            paddingVertical: vs(8),
            gap: s(6),
            borderBottomColor: theme.primary + "15",
          }}
        >
          <View className="rounded-full bg-olive-800 dark:bg-olive-700" style={{ width: s(5), height: s(5) }} />
          <Text
            className="flex-1 font-semibold uppercase tracking-wider"
            style={{ fontSize: ms(11, 0.3), color: theme.textSecondary }}
          >
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
          style={{ paddingHorizontal: s(12), paddingVertical: vs(10) }}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <Markdown style={{
            body: { color: theme.textMain, fontSize: ms(14, 0.3), lineHeight: ms(19, 0.3) },
            strong: { fontWeight: "700", color: theme.textMain },
            bullet_list: { marginVertical: vs(2) },
            ordered_list: { marginVertical: vs(2) },
            list_item: { marginVertical: vs(1) },
            paragraph: { marginVertical: vs(2) },
          }}>
            {message}
          </Markdown>
        </ScrollView>

        {/* Alt ipucu */}
        <Text
          className="text-center"
          style={{ fontSize: ms(10, 0.3), paddingBottom: vs(8), color: theme.textSecondary + "60" }}
        >
          {t.chat.tapToOpen}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
};
