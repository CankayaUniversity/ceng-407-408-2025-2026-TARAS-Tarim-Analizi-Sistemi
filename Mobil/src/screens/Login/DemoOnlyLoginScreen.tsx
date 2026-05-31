import { useState } from "react";
import Constants from "expo-constants";
import {
  Text,
  TouchableOpacity,
  ActivityIndicator,
  View,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { authAPI } from "../../utils/api";
import { LoginScreenProps } from "./types";
import { usePopupMessage } from "../../context/PopupMessageContext";
import { useLanguage } from "../../context/LanguageContext";
import { vs, ms, s } from "../../utils/responsive";

import LogoLight from "../../assets/Taras-logo-light.svg";
import LogoDark from "../../assets/Taras-logo-dark.svg";

export const DemoOnlyLoginScreen = ({
  theme,
  onLoginSuccess,
  onSkip,
}: LoginScreenProps) => {
  const { showPopup } = usePopupMessage();
  const { t, language, setLanguage } = useLanguage();
  const [isLoading, setIsLoading] = useState(false);
  const [serverStatus, setServerStatus] = useState<string | null>(null);

  // Canli demo butonu yalnizca bir gorunurluk bayragiyla acilir — kimlik bilgisi
  // uygulamada YOK; giris sunucudan (authAPI.demoLogin) token alir.
  const hasAwsDemo = Constants.expoConfig?.extra?.liveDemoEnabled === true;

  // Local demo — backend gerek yok, AuthContext handleSkip token + user yaziyor
  const handleLocalDemo = () => {
    void onSkip();
  };

  // Live server demo — sunucu DEMO_READONLY_USER_ID hesabi icin token uretir
  // (parola istemcide degil). authAPI.demoLogin token+user'i saklar.
  const handleAwsDemo = async () => {
    if (!hasAwsDemo) {
      showPopup("Canlı demo yapılandırılmadı");
      return;
    }
    setIsLoading(true);
    setServerStatus(t.login.connectingToServer);
    await authAPI.logout();
    const response = await authAPI.demoLogin();
    setIsLoading(false);
    setServerStatus(null);
    if (response.success) {
      const displayName = response.data?.user.username || "";
      console.log("[LOGIN] ok:", displayName);
      onLoginSuccess(displayName);
    } else {
      showPopup(response.error || t.login.errorLoginFailed);
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 center px-6 bg-porcelain dark:bg-carbonBlack"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          alignItems: "center",
          width: "100%",
          paddingVertical: 20,
        }}
        style={{ width: "100%" }}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {theme.isDark ? (
          <LogoDark width={220} height={220} />
        ) : (
          <LogoLight width={220} height={220} />
        )}

        {serverStatus && (
          <Text className="text-secondary text-sm mb-3">{serverStatus}</Text>
        )}

        {/* Iki demo CTA — yan yana, sade. Tek demo var ise tek buton full-width. */}
        <View
          style={{
            flexDirection: "row",
            width: "100%",
            gap: s(12),
            marginTop: vs(8),
          }}
        >
          {/* Local Demo — primary (filled) */}
          <TouchableOpacity
            style={{
              flex: 1,
              backgroundColor: theme.primary,
              borderRadius: 10,
              paddingVertical: vs(18),
              paddingHorizontal: s(12),
              alignItems: "center",
              justifyContent: "center",
              opacity: isLoading ? 0.6 : 1,
            }}
            onPress={handleLocalDemo}
            disabled={isLoading}
          >
            <Ionicons
              name="phone-portrait-outline"
              size={28}
              color={theme.textOnPrimary}
            />
            <Text
              style={{
                color: theme.textOnPrimary,
                fontSize: ms(15, 0.3),
                fontWeight: "700",
                marginTop: vs(8),
                textAlign: "center",
              }}
            >
              {t.login.localDemoButton}
            </Text>
          </TouchableOpacity>

          {/* Live Server Demo — secondary (outlined) */}
          {hasAwsDemo && (
            <TouchableOpacity
              style={{
                flex: 1,
                backgroundColor: "transparent",
                borderWidth: 2,
                borderColor: theme.primary,
                borderRadius: 10,
                paddingVertical: vs(16),
                paddingHorizontal: s(12),
                alignItems: "center",
                justifyContent: "center",
                opacity: isLoading ? 0.6 : 1,
              }}
              onPress={handleAwsDemo}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color={theme.primary} />
              ) : (
                <Ionicons
                  name="cloud-outline"
                  size={28}
                  color={theme.primary}
                />
              )}
              <Text
                style={{
                  color: theme.primary,
                  fontSize: ms(15, 0.3),
                  fontWeight: "700",
                  marginTop: vs(8),
                  textAlign: "center",
                }}
              >
                {t.login.awsDemoButton}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Dil degistirici */}
        <TouchableOpacity
          className="row mt-8 mb-5 gap-1.5"
          onPress={() => setLanguage(language === "tr" ? "en" : "tr")}
          disabled={isLoading}
        >
          <Ionicons
            name="globe-outline"
            size={18}
            color={theme.textSecondary}
          />
          <Text
            className="text-center font-semibold"
            style={{ color: theme.textSecondary, fontSize: ms(14, 0.3) }}
          >
            {language === "tr" ? "English" : "Türkçe"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};
