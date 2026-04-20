// LLM navigasyon sonrasi bildirim baloncugu
// Sohbet penceresiyle ayni estetik: ince cerceve, arka plan rengi, avatar yok
// Metin 140 karaktere/bir cumleye kisaltilir — tam metin chat penceresinde
import { useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
} from "react-native";
import Markdown from "@ronradtke/react-native-markdown-display";
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
const MAX_BUBBLE_CHARS = 140;

// Ilk cumleyi cikar — nokta/soru isareti/unlem sonrasi kesmeyi dener
const firstSentence = (text: string, max = MAX_BUBBLE_CHARS): string => {
  const cleaned = text.trim();
  if (cleaned.length === 0) return cleaned;
  if (cleaned.length <= max) return cleaned;
  const match = cleaned.match(/^[^.!?]+[.!?]/);
  const candidate = match ? match[0].trim() : cleaned;
  if (candidate.length <= max) return candidate;
  return candidate.slice(0, max - 1).trimEnd().replace(/\.+$/, "") + "…";
};

export const ChatBubble = ({
  message,
  visible,
  theme,
  bottom,
  onPress,
  onDismiss,
}: ChatBubbleProps) => {
  const { t } = useLanguage();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const short = firstSentence(message);
  const hasMore = short.length < message.trim().length;

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

  return (
    <Animated.View
      style={{
        position: "absolute",
        right: s(12),
        left: s(48),
        bottom,
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

        {/* Mesaj icerigi — tek cumle, <= 140 karakter */}
        <View style={{ paddingHorizontal: s(12), paddingVertical: vs(10) }}>
          <Markdown style={{
            body: { color: theme.textMain, fontSize: ms(14, 0.3), lineHeight: ms(19, 0.3) },
            strong: { fontWeight: "700", color: theme.textMain },
            em: { color: theme.textMain },
            paragraph: { marginVertical: 0 },
          }}>
            {short}
          </Markdown>
          {hasMore && (
            <Text
              style={{
                marginTop: vs(4),
                fontSize: ms(12, 0.3),
                fontWeight: "600",
                color: theme.primary,
              }}
            >
              {t.chat.readMore}
            </Text>
          )}
        </View>

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
