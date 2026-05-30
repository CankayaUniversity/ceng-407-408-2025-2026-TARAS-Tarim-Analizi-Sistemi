// LLM navigasyon sonrasi bildirim baloncugu
// Sohbet penceresiyle ayni estetik: ince cerceve, arka plan rengi, avatar yok
// Metin 140 karaktere/bir cumleye kisaltilir — tam metin chat penceresinde
// 10 sn gosterilir; en altta azalan bir sayac cubugu kalan sureyi gosterir.
import { useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  Easing,
} from "react-native";
import Markdown from "@ronradtke/react-native-markdown-display";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Theme } from "../types";
import { s, vs, ms } from "../utils/responsive";
import { useLanguage } from "../context/LanguageContext";

interface ChatBubbleProps {
  message: string;
  visible: boolean;
  theme: Theme;
  bottom: number;
  // Sol kenar — AI buton + kamera butonuyla AYNI kenar boslugu (AppRouter fabRight=s(16)).
  left: number;
  onPress: () => void;
  onDismiss: () => void;
}

const AUTO_DISMISS_MS = 10000;
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
  left,
  onPress,
  onDismiss,
}: ChatBubbleProps) => {
  const { t } = useLanguage();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;
  // Sayac cubugu — 1 (dolu) -> 0 (bos). width/% animasyonu native driver kullanamaz.
  const progress = useRef(new Animated.Value(1)).current;
  // Geri sayim animasyonu referansi — kapanma bunun bitisine bagli (tek otorite).
  const countdownRef = useRef<Animated.CompositeAnimation | null>(null);

  const short = firstSentence(message);
  const hasMore = short.length < message.trim().length;

  const dismiss = () => {
    countdownRef.current?.stop();
    countdownRef.current = null;
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

      // Geri sayim cubugu — otomatik kapanmanin TEK otoritesi (eski setTimeout yerine).
      // finished:true ile bitince kapat; stop() ile iptal edilirse finished:false, kapatma.
      progress.setValue(1);
      const countdown = Animated.timing(progress, {
        toValue: 0,
        duration: AUTO_DISMISS_MS,
        easing: Easing.linear,
        useNativeDriver: false,
      });
      countdownRef.current = countdown;
      countdown.start(({ finished }) => {
        if (finished) dismiss();
      });
    }

    return () => {
      countdownRef.current?.stop();
    };
    // visible/message degisince sayac sifirlanir (yeni balon -> taze 10 sn + cubuk)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, message]);

  if (!visible) return null;

  const barWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <Animated.View
      style={{
        position: "absolute",
        // Popup sirasinda AI buton SOLA gectigi icin balon da SOLDA — buton'dan cikiyormus
        // gibi. left, ChatBubbleLayer'dan gelir (kamera + AI butonuyla ayni FAB_MARGIN).
        left,
        bottom,
        zIndex: 999,
        alignItems: "flex-start" as const,
        maxWidth: s(270),
        opacity,
        transform: [{ translateY }],
      }}
    >
      {/* Basliksiz, sade konusma balonu — AI buton'dan cikiyormus gibi: icerige gore
          daralir (full-width DEGIL), SOL-alt kose sivri (kuyruk asagidaki butona dogru),
          diger koseler genis yuvarlatma. Sohbet sekmesi balon idiomuyla ayni. */}
      <TouchableOpacity
        className="overflow-hidden"
        style={{
          alignSelf: "flex-start",
          maxWidth: "100%",
          backgroundColor: theme.surface,
          borderColor: theme.primary + "18",
          borderWidth: 1,
          borderTopLeftRadius: s(16),
          borderTopRightRadius: s(16),
          borderBottomLeftRadius: s(4),
          borderBottomRightRadius: s(16),
          shadowColor: theme.shadowColor,
          elevation: 12,
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.2,
          shadowRadius: 12,
        }}
        onPress={onPress}
        activeOpacity={0.9}
      >
        {/* Kapat (X) — sag ust kosede serbest */}
        <TouchableOpacity
          onPress={dismiss}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={{ position: "absolute", top: vs(5), right: s(6), zIndex: 2, padding: s(3) }}
        >
          <MaterialCommunityIcons
            name="close"
            size={15}
            color={theme.textSecondary + "99"}
          />
        </TouchableOpacity>

        {/* Mesaj icerigi — tek cumle, <= 140 karakter. Sag padding X'e yer acar. */}
        <View style={{ paddingLeft: s(12), paddingRight: s(28), paddingTop: vs(9), paddingBottom: vs(5) }}>
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

        {/* Tiklanabilir-ac ipucu */}
        <Text
          style={{
            paddingHorizontal: s(12),
            paddingBottom: vs(8),
            fontSize: ms(10, 0.3),
            color: theme.textSecondary + "70",
          }}
        >
          {t.chat.tapToOpen}
        </Text>

        {/* Geri sayim cubugu — kalan popup suresini gosterir, soldan saga azalir */}
        <View style={{ height: vs(3), backgroundColor: theme.primary + "12" }}>
          <Animated.View
            style={{ height: "100%", width: barWidth, backgroundColor: theme.primary }}
          />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};
