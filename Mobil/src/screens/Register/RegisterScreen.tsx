// Kayit ekrani — tek adim (sadece hesap bilgileri)

import { useCallback, useEffect, useState } from "react";
import {
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { authAPI, healthAPI } from "../../utils/api";
import { usePopupMessage } from "../../context/PopupMessageContext";
import { useLanguage } from "../../context/LanguageContext";
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

    // Register — creates user only (no farm)
    const response = await authAPI.register(
      state.username.trim(),
      state.email.trim(),
      state.password,
      state.roleId,
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
    <KeyboardAvoidingView
      className="flex-1 bg-porcelain dark:bg-carbonBlack"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: "center",
          width: "100%",
          paddingVertical: 20,
        }}
        style={{ width: "100%" }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {theme.isDark ? (
          <LogoDark width={160} height={160} />
        ) : (
          <LogoLight width={160} height={160} />
        )}

        <UserInfoStep
          theme={theme}
          state={state}
          onUpdate={onUpdate}
          onSubmit={handleSubmit}
          onBack={onBackToLogin}
          isLoading={isLoading}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
};
