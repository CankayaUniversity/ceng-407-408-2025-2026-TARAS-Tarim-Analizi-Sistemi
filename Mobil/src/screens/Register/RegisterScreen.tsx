// Kayit ekrani — tek adim (sadece hesap bilgileri)

import { useCallback, useEffect, useState } from "react";
import {
  Animated,
  BackHandler,
  ScrollView,
  View,
} from "react-native";
import { authAPI, healthAPI } from "../../utils/api";
import { usePopupMessage } from "../../context/PopupMessageContext";
import { useLanguage } from "../../context/LanguageContext";
import { useKeyboard } from "../../hooks/useKeyboard";
import { vs, s } from "../../utils/responsive";
import { UserInfoStep } from "./UserInfoStep";
import type { RegisterScreenProps, RegisterFormState } from "./types";
import { INITIAL_REGISTER_STATE } from "./types";

import LogoLight from "../../assets/Taras-logo-light.svg";
import LogoDark from "../../assets/Taras-logo-dark.svg";

export const RegisterScreen = ({
  theme,
  onRegisterSuccess,
  onBackToLogin,
}: RegisterScreenProps) => {
  const { showPopup } = usePopupMessage();
  const { t } = useLanguage();
  const [state, setState] = useState<RegisterFormState>(INITIAL_REGISTER_STATE);
  const [isLoading, setIsLoading] = useState(false);

  // Klavye yonetimi: LoginScreen ile ayni desen — KeyboardAvoidingView yok. Olculen
  // yukseklikten ust/alt bosluklar animate edilir; klavye acilinca logo en uste gelir
  // (ustunde bosluk yok). Logo TAM boyutta kalir — yalnizca tum icerik yukari kayar
  // (eski davranis logoyu 0'a indiriyordu, istenen bu degildi).
  const { animatedPadding, keyboardHeight } = useKeyboard();
  const [viewportH, setViewportH] = useState(0);
  const [columnH, setColumnH] = useState(0);
  const topSpace = animatedPadding.interpolate({
    inputRange: [0, 1],
    outputRange: [Math.max(vs(16), (viewportH - columnH) / 2), 0],
  });
  const bottomSpace = animatedPadding.interpolate({
    inputRange: [0, 1],
    outputRange: [vs(24), keyboardHeight + vs(24)],
  });

  const onUpdate = useCallback(
    (partial: Partial<RegisterFormState>) =>
      setState((prev) => ({ ...prev, ...partial })),
    [],
  );

  const handleSubmit = async () => {
    setIsLoading(true);

    // Server health check
    const health = await healthAPI.check();
    if (!health.success) {
      setIsLoading(false);
      showPopup(t.register.errorConnectionFailed);
      return;
    }

    // Register — creates user only (no farm, no role choice). Rol onboarding'de
    // (ilk ciftlik olustur / davet koduyla katil) belirlenir.
    const response = await authAPI.register(
      state.username.trim(),
      state.email.trim(),
      state.password,
    );
    setIsLoading(false);

    if (response.success) {
      const displayName = response.data?.user.username || "";
      console.log("[REGISTER] ok:", displayName);
      onRegisterSuccess(displayName);
    } else {
      console.log("[REGISTER] fail:", response.error);
      showPopup(response.error || t.register.errorRegistrationFailed);
    }
  };

  // Android hardware back button
  useEffect(() => {
    const handler = () => {
      if (isLoading) return true;
      onBackToLogin();
      return true;
    };
    const sub = BackHandler.addEventListener("hardwareBackPress", handler);
    return () => sub.remove();
  }, [isLoading]);

  return (
    <View className="flex-1 bg-porcelain dark:bg-carbonBlack">
      <ScrollView
        style={{ flex: 1, width: "100%" }}
        onLayout={(e) => setViewportH(e.nativeEvent.layout.height)}
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: "center",
          paddingHorizontal: s(24),
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Ust bosluk: klavye kapaliyken icerigi ortalar, acilinca 0'a iner (logo en uste). */}
        <Animated.View style={{ height: topSpace }} />

        {/* Olculen kolon (logo + form) — dikey ortalama hesabi icin yuksekligi olculur.
            Olculmeden once gizli (opacity 0) — boylece ilk karede ust-hizadan ortaya
            sicrama gorunmez (onLayout opacity'den bagimsiz tetiklenir). */}
        <View
          onLayout={(e) => setColumnH(e.nativeEvent.layout.height)}
          style={{
            width: "100%",
            alignItems: "center",
            opacity: viewportH && columnH ? 1 : 0,
          }}
        >
          {/* Logo — en ust eleman, ustunde bosluk yok. Tam boyutta kalir, sadece yukari kayar. */}
          <View style={{ alignItems: "center", justifyContent: "center" }}>
            {theme.isDark ? (
              <LogoDark width={220} height={220} />
            ) : (
              <LogoLight width={220} height={220} />
            )}
          </View>

          <UserInfoStep
            theme={theme}
            state={state}
            onUpdate={onUpdate}
            onSubmit={handleSubmit}
            onBack={onBackToLogin}
            isLoading={isLoading}
          />
        </View>

        {/* Alt bosluk: klavye acilinca formun alti klavyenin uzerine kaydirilabilir kalir. */}
        <Animated.View style={{ height: bottomSpace }} />
      </ScrollView>
    </View>
  );
};
