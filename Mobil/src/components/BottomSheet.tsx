// Alt sayfa (bottom sheet) primitifi — alttan kayan, arka plani karartilmis/bulanik panel.
// FilterMenu ve CreateFolderModal gibi baglamsal form/secicilerin ortak iskeleti.
//
// Onemli kurallar:
//   - statusBarTranslucent (Android): icine konan OptionDropdown'in panel hizasi icin sart.
//     Sheet status bar'i kapladigindan, dropdown'a da statusBarTranslucent vermeyi unutma.
//   - ANIMASYON elle yonetilir (Modal animationType="none"): BACKDROP FADE eder (opacity),
//     SHEET KAYAR (translateY). Modal'in "slide"i her seyi (backdrop dahil) birlikte
//     kaydiriyordu — karartma sheet ile beraber yukari suzuluyordu (kullanici: "fade etmeli").
//     Tek bir Animated.Value (progress 0=kapali,1=acik) ikisini de surer; cikis animasyonu
//     bitince Modal unmount olur (mounted state).
//   - Backdrop KAV'in DISINDA: klavye icerigi yukari ittiginde backdrop pencereye sabit kalir.
//   - Sheet zemini theme.background: ic OptionDropdown trigger'lari/input'lari (theme.surface)
//     uzerinde belirgin dursun diye (surface sheet'te birbirine karisirdi).

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Modal,
  View,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  StyleSheet,
  Animated,
  Dimensions,
} from "react-native";
import type { StyleProp, ViewStyle, LayoutChangeEvent } from "react-native";
import { BlurView } from "expo-blur";
import { Theme } from "../utils/theme";
import { vs } from "../utils/responsive";
import { ModalHeader } from "./ModalHeader";

const ANIM_IN = 240;
const ANIM_OUT = 200;

export interface BottomSheetProps {
  visible: boolean;
  theme: Theme;
  onClose: () => void;
  /** Verilirse ModalHeader (baslik + kapat X) cizilir. */
  title?: string;
  headerRight?: ReactNode;
  /** Arka plan: true → BlurView, false → theme.overlay karartma. Varsayilan false. */
  blur?: boolean;
  /** Icerikte TextInput varsa true ver — KeyboardAvoidingView'a sarar. */
  avoidKeyboard?: boolean;
  /** Backdrop'a dokununca kapansin mi. false ise yalnizca klavye kapanir. Varsayilan true. */
  closeOnBackdropPress?: boolean;
  /** Body'i ScrollView'a sar (uzun icerik). Varsayilan false. */
  scroll?: boolean;
  /** Sabit alt cubuk (scroll disinda, sheet'in dibinde). Stil cagirana ait. */
  footer?: ReactNode;
  /** Sheet maksimum yuksekligi (ekran yuzdesi). Varsayilan 85. */
  maxHeightPct?: number;
  /** Body sarmalayicisina/ScrollView contentContainer'a uygulanan stil (orn. padding). */
  contentContainerStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
}

export const BottomSheet = ({
  visible,
  theme,
  onClose,
  title,
  headerRight,
  blur = false,
  avoidKeyboard = false,
  closeOnBackdropPress = true,
  scroll = false,
  footer,
  maxHeightPct = 85,
  contentContainerStyle,
  children,
}: BottomSheetProps) => {
  // progress: 0 kapali, 1 acik. Backdrop opacity + sheet translateY'yi birlikte surer.
  const progress = useRef(new Animated.Value(0)).current;
  // mounted: cikis animasyonu bitene kadar Modal'i acik tut (visible false olsa bile).
  const [mounted, setMounted] = useState(visible);
  // Sheet yuksekligi — kayma mesafesi. Hem state (interpolasyon icin) hem ref (effect icin senkron).
  const [sheetH, setSheetH] = useState(0);
  const sheetHRef = useRef(0);
  // Yukseklik henuz olculmediginde acilis istegi — onLayout olcunce baslatilir.
  const pendingOpenRef = useRef(false);

  const animateIn = useCallback(() => {
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: ANIM_IN,
      useNativeDriver: true,
    }).start();
  }, [progress]);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      // Giris animasyonunu yalnizca yukseklik BILINIYORSA hemen baslat; bilinmiyorsa onLayout
      // olcunce baslat. Boylece interpolasyon outputRange'i animasyon ORTASINDA degisip
      // sheet'in ziplamasi (ilk acilis "malfunction"i) engellenir.
      if (sheetHRef.current > 0) animateIn();
      else pendingOpenRef.current = true;
    } else {
      Animated.timing(progress, {
        toValue: 0,
        duration: ANIM_OUT,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handleBackdrop = (): void => {
    Keyboard.dismiss();
    if (closeOnBackdropPress) onClose();
  };

  const onSheetLayout = useCallback(
    (e: LayoutChangeEvent): void => {
      const h = e.nativeEvent.layout.height;
      if (h <= 0) return;
      sheetHRef.current = h;
      setSheetH((prev) => (prev === h ? prev : h));
      // Olcum gelince bekleyen acilis varsa simdi baslat (dogru yukseklikle).
      if (pendingOpenRef.current) {
        pendingOpenRef.current = false;
        animateIn();
      }
    },
    [animateIn],
  );

  // Olculene kadar TAM EKRAN kadar asagida (tamamen gizli) — olcum oncesi bir kare bile gozukmez.
  const slide = sheetH > 0 ? sheetH : Dimensions.get("window").height;
  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [slide, 0],
  });

  const body = scroll ? (
    // flexShrink:1 SART — maxHeight ile sinirli sheet icinde ScrollView'in kuculup kaydirilabilmesi
    // icin. Olmadan uzun icerik footer'i ekran disina itiyor ve scroll calismiyordu.
    <ScrollView
      bounces={false}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      style={{ flexShrink: 1 }}
      contentContainerStyle={contentContainerStyle}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={contentContainerStyle}>{children}</View>
  );

  const sheet = (
    <Animated.View
      onLayout={onSheetLayout}
      // maxHeight BURADA (sheet wrapper) — parent (container/KAV) flex:1 = kesin yukseklik, yuzde
      // boylece ekran yuksekligine gore COZULUR. Pressable'a konunca parent auto-height oldugundan
      // yuzde cozulemiyor, uzun icerik cap'lenmeden footer'i ekran disina itiyordu.
      style={{ transform: [{ translateY }], maxHeight: `${maxHeightPct}%`, width: "100%" }}
    >
      <Pressable
        onPress={(e) => e.stopPropagation()}
        style={{
          // Wrapper cap'ine sigsin (default flexShrink 0) — boylece uzun icerikte sheet 85%'te
          // durur ve ic ScrollView (flexShrink:1) kaydirilabilir hale gelir, footer gorunur kalir.
          flexShrink: 1,
          backgroundColor: theme.background,
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          paddingBottom: vs(20),
        }}
      >
        {title != null && (
          <ModalHeader theme={theme} title={title} onClose={onClose} right={headerRight} />
        )}
        {body}
        {footer != null ? footer : null}
      </Pressable>
    </Animated.View>
  );

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent={Platform.OS === "android"}
      onRequestClose={onClose}
    >
      {/* Backdrop FADE eder (opacity), sheet ile birlikte kaymaz. KAV DISINDA. */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: progress }]}>
        {blur ? (
          <BlurView
            intensity={40}
            tint={theme.isDark ? "dark" : "light"}
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.overlay }]} />
        )}
      </Animated.View>
      <Pressable style={StyleSheet.absoluteFill} onPress={handleBackdrop} />

      {avoidKeyboard ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
          style={styles.container}
          pointerEvents="box-none"
        >
          {sheet}
        </KeyboardAvoidingView>
      ) : (
        <View style={styles.container} pointerEvents="box-none">
          {sheet}
        </View>
      )}
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "flex-end",
  },
});

export default BottomSheet;
