// Tam ekran modal primitifi — BUYUK BASLIK duzeni + YANDAN kayan giris (disease stack gibi).
//
// Animasyon: Modal animationType="none" + elle translateX (sagdan iceri kayar, cikarken saga).
// Modal "slide"i (alttan) yerine push-navigasyon hissi icin manuel; cikis animasyonu icin
// mounted state (Modal visible=mounted; visible false olunca once kay, sonra unmount).
// Modal transparent → kayma sirasinda arkadaki uygulama gorunur (push efekti). presentationStyle
// kullanilmaz (transparent ile cakisir).
//
// Renk varyansi: header zone IKINCIL zemin (theme.surface, status bar altina kadar) — buyuk
// baslik + kontrol satiri orada; icerik birincil zemin (theme.background). Iki tonlu derinlik.
//
// Butonlar: minimal (cerceve/daire YOK) — yalin ikon, hitSlop ile dokunma alani.
//
// SafeAreaView + paddingTop: iOS notch RN SafeAreaView, Android status bar StatusBar.currentHeight.

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Platform,
  Animated,
  Easing,
  Dimensions,
} from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Theme } from "../utils/theme";
import { s, vs, ms } from "../utils/responsive";
import { GlobalToast } from "../context/PopupMessageContext";

// Disease native-stack "simple_push" hizi (~100ms) gibi snappy yandan giris.
const ANIM_IN = 180;
const ANIM_OUT = 150;

export interface FullScreenModalProps {
  visible: boolean;
  theme: Theme;
  /** Donanim geri tusu / required dismiss. */
  onRequestClose: () => void;
  /** Buyuk baslik. Verilmezse baslik blogu cizilmez. */
  title?: string;
  /** Baslik altinda muted satir (orn. "Adım 2/4"). */
  caption?: string;
  /** 0..1 ince ilerleme cubugu. Verilmezse cizilmez. */
  progress?: number;
  /** Sol geri chevron — yalnizca verilince gosterilir (orn. wizard ilk adimda yok). */
  onBack?: () => void;
  /** Sag kapat (X). Verilmezse onRequestClose'a duser. */
  onClose?: () => void;
  /** Kapat (X) butonunun SOLUNA eklenen ekstra kontroller (orn. chat gecmis/yeni). */
  headerRight?: ReactNode;
  /** Header duzeni. "big" (varsayilan) = ust kontrol satiri + altinda BUYUK baslik blogu (wizard
      tarzi). "inline" = baslik kapat (X) ile AYNI satirda; alt sayfasi olmayan basit ekranlarda
      sol ust kosede bosluk olmasin diye (orn. Uyeler/Paylas/Bildirimler/Hesap Duzenle). */
  variant?: "big" | "inline";
  children: ReactNode;
}

// Minimal ikon butonu — daire/cerceve yok, yalin ikon + hitSlop.
const IconButton = ({
  theme,
  icon,
  onPress,
}: {
  theme: Theme;
  icon: string;
  onPress: () => void;
}) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.6}
    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
  >
    <MaterialCommunityIcons name={icon as any} size={26} color={theme.textMain} />
  </TouchableOpacity>
);

export const FullScreenModal = ({
  visible,
  theme,
  onRequestClose,
  title,
  caption,
  progress,
  onBack,
  onClose,
  headerRight,
  variant = "big",
  children,
}: FullScreenModalProps) => {
  // progress: 0 kapali, 1 acik. translateX'i surer (sagdan iceri).
  const anim = useRef(new Animated.Value(0)).current;
  // mounted: cikis animasyonu bitene kadar Modal acik kalsin.
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(anim, {
        toValue: 1,
        duration: ANIM_IN,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(anim, {
        toValue: 0,
        duration: ANIM_OUT,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const closeHandler = onClose ?? onRequestClose;
  const clamped = progress != null ? Math.max(0, Math.min(1, progress)) : null;
  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [Dimensions.get("window").width, 0],
  });

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent={Platform.OS === "android"}
      onRequestClose={onRequestClose}
    >
      <Animated.View style={{ flex: 1, transform: [{ translateX }] }}>
        {/* SafeAreaView zemini = surface → status bar alti + header band ayni ton (varyans). */}
        <SafeAreaView
          style={{
            flex: 1,
            backgroundColor: theme.surface,
            paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
          }}
        >
          {/* HEADER ZONE — ikincil zemin (surface). variant="big": ust kontrol satiri + altinda
              BUYUK baslik blogu (wizard hissi). variant="inline": baslik kapat (X) ile AYNI satirda
              — alt sayfasi olmayan basit ekranlarda sol ust kose bos kalmasin. */}
          <View
            style={{
              paddingHorizontal: s(20),
              paddingTop: vs(6),
              paddingBottom:
                variant === "big" && title != null
                  ? vs(16)
                  : variant === "inline" && (caption != null || clamped != null)
                    ? vs(12)
                    : vs(6),
              borderBottomWidth: 1,
              borderBottomColor: theme.border,
            }}
          >
            {/* Kontrol satiri — opsiyonel geri + (inline ise) baslik + sag grup (headerRight + kapat). */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                height: s(34),
              }}
            >
              {onBack ? <IconButton theme={theme} icon="chevron-left" onPress={onBack} /> : null}
              {variant === "inline" && title != null ? (
                <Text
                  style={{
                    flex: 1,
                    fontSize: ms(26, 0.3),
                    fontWeight: "800",
                    color: theme.textMain,
                    marginLeft: onBack ? s(12) : 0,
                    marginRight: s(12),
                  }}
                  numberOfLines={1}
                >
                  {title}
                </Text>
              ) : (
                <View style={{ flex: 1 }} />
              )}
              <View style={{ flexDirection: "row", alignItems: "center", gap: s(14) }}>
                {headerRight}
                <IconButton theme={theme} icon="close" onPress={closeHandler} />
              </View>
            </View>

            {/* Buyuk baslik blogu — yalnizca "big" varyantta. */}
            {variant === "big" && title != null && (
              <View style={{ marginTop: vs(6) }}>
                <Text
                  style={{ fontSize: ms(26, 0.3), fontWeight: "800", color: theme.textMain }}
                  numberOfLines={2}
                >
                  {title}
                </Text>
                {caption ? (
                  <Text
                    style={{ fontSize: ms(13, 0.3), color: theme.textSecondary, marginTop: vs(3) }}
                  >
                    {caption}
                  </Text>
                ) : null}
                {clamped != null ? (
                  <View
                    style={{
                      height: 4,
                      borderRadius: 999,
                      backgroundColor: theme.border,
                      marginTop: vs(12),
                      overflow: "hidden",
                    }}
                  >
                    <View
                      style={{
                        height: 4,
                        borderRadius: 999,
                        backgroundColor: theme.primary,
                        width: `${clamped * 100}%`,
                      }}
                    />
                  </View>
                ) : null}
              </View>
            )}

            {/* Inline varyant: caption / progress varsa kontrol satirinin altinda kompakt sekilde. */}
            {variant === "inline" && (caption != null || clamped != null) && (
              <View style={{ marginTop: vs(6) }}>
                {caption ? (
                  <Text style={{ fontSize: ms(12, 0.3), color: theme.textSecondary }}>
                    {caption}
                  </Text>
                ) : null}
                {clamped != null ? (
                  <View
                    style={{
                      height: 4,
                      borderRadius: 999,
                      backgroundColor: theme.border,
                      marginTop: caption ? vs(8) : 0,
                      overflow: "hidden",
                    }}
                  >
                    <View
                      style={{
                        height: 4,
                        borderRadius: 999,
                        backgroundColor: theme.primary,
                        width: `${clamped * 100}%`,
                      }}
                    />
                  </View>
                ) : null}
              </View>
            )}
          </View>

          {/* ICERIK — birincil zemin (background). */}
          <View style={{ flex: 1, backgroundColor: theme.background }}>{children}</View>

          {/* Toast — RN Modal ayri pencere actigi icin koktekı toast bunun ALTINDA
              kalir; modal penceresinde de cizip en uste tasiyoruz (ayni context durumu,
              klavyenin uzerine konumlanir). */}
          <GlobalToast />
        </SafeAreaView>
      </Animated.View>
    </Modal>
  );
};

export default FullScreenModal;
