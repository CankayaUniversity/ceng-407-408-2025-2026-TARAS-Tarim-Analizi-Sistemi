// Giris ekrani - kullanici girisi ve kayit islemi
// Props: theme, onLoginSuccess, onSkip

import { useState } from "react";
import Constants from "expo-constants";
import {
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  LayoutAnimation,
  View,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { appStyles } from "../../styles";
import { authAPI, healthAPI } from "../../utils/api";
import { LoginScreenProps } from "./types";
import { usePopupMessage } from "../../context/PopupMessageContext";
import { useLanguage } from "../../context/LanguageContext";

import LogoLight from "../../assets/Taras-logo-light.svg";
import LogoDark from "../../assets/Taras-logo-dark.svg";

export const LoginScreen = ({
  theme,
  onLoginSuccess,
  onSkip,
}: LoginScreenProps) => {
  const { showPopup } = usePopupMessage();
  const { t, language, setLanguage } = useLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [username, setUsername] = useState("");
  const [serverStatus, setServerStatus] = useState<string | null>(null);

  // AWS demo credentials from env
  const awsDemoUsername = Constants.expoConfig?.extra?.awsDemoUsername || "";
  const awsDemoPassword = Constants.expoConfig?.extra?.awsDemoPassword || "";

  const toggleRegisterMode = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsRegisterMode(!isRegisterMode);
    setConfirmPassword("");
  };

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      showPopup(t.login.errorEmptyCredentials);
      return;
    }

    setIsLoading(true);
    setServerStatus(t.login.connectingToServer);

    // Check server health first
    const healthCheck = await healthAPI.check();
    if (!healthCheck.success) {
      setIsLoading(false);
      setServerStatus(t.login.serverOffline);
      showPopup(t.login.errorConnectionFailed);
      return;
    }

    setServerStatus(t.login.loggingIn);
    const response = await authAPI.login(username.trim(), password);
    setIsLoading(false);
    setServerStatus(null);

    if (response.success) {
      setUsername("");
      setPassword("");
      const displayName = response.data?.user.username || "";
      console.log("[LOGIN] ok:", displayName);
      onLoginSuccess(displayName);
    } else {
      showPopup(response.error || t.login.errorLoginFailed);
    }
  };

  const handleRegister = async () => {
    if (
      !username.trim() ||
      !email.trim() ||
      !password.trim() ||
      !confirmPassword.trim()
    ) {
      showPopup(t.login.errorEmptyFields);
      return;
    }

    if (password !== confirmPassword) {
      showPopup(t.login.errorPasswordMismatch);
      return;
    }

    setIsLoading(true);
    const response = await authAPI.register(
      username.trim(),
      email.trim(),
      password,
    );
    setIsLoading(false);

    if (response.success) {
      setEmail("");
      setPassword("");
      setConfirmPassword("");
      setUsername("");
      const displayName = response.data?.user.username || "";
      onLoginSuccess(displayName);
    } else {
      showPopup(response.error || t.login.errorRegistrationFailed);
    }
  };

  const handleSkip = () => {
    setEmail("");
    setPassword("");
    onSkip();
  };

  // AWS demo login - sunucuya baglanir
  const handleAwsDemo = async () => {
    if (!awsDemoUsername || !awsDemoPassword) {
      showPopup("AWS demo credentials not configured");
      return;
    }

    setIsLoading(true);
    setServerStatus(t.login.connectingToServer);

    await authAPI.logout();

    const response = await authAPI.login(awsDemoUsername, awsDemoPassword);
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
      style={[appStyles.loginContainer, { backgroundColor: theme.background }]}
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
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {theme.isDark ? (
          <LogoDark width={220} height={220} />
        ) : (
          <LogoLight width={220} height={220} />
        )}

        {serverStatus && (
          <Text
            style={{
              color: theme.textSecondary,
              marginBottom: 12,
              fontSize: 14,
            }}
          >
            {serverStatus}
          </Text>
        )}

        {isRegisterMode && (
          <TextInput
            style={[
              appStyles.loginInput,
              {
                backgroundColor: theme.surface,
                color: theme.text,
                borderColor: theme.accentDim,
              },
            ]}
            placeholder={t.login.emailPlaceholder}
            placeholderTextColor={theme.textSecondary}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            editable={!isLoading}
          />
        )}

        <TextInput
          style={[
            appStyles.loginInput,
            {
              backgroundColor: theme.surface,
              color: theme.text,
              borderColor: theme.accentDim,
            },
          ]}
          placeholder={t.login.usernamePlaceholder}
          placeholderTextColor={theme.textSecondary}
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          editable={!isLoading}
        />
        <TextInput
          style={[
            appStyles.loginInput,
            {
              backgroundColor: theme.surface,
              color: theme.text,
              borderColor: theme.accentDim,
            },
          ]}
          placeholder={t.login.passwordPlaceholder}
          placeholderTextColor={theme.textSecondary}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          editable={!isLoading}
        />
        {isRegisterMode && (
          <TextInput
            style={[
              appStyles.loginInput,
              {
                backgroundColor: theme.surface,
                color: theme.text,
                borderColor: theme.accentDim,
              },
            ]}
            placeholder={t.login.confirmPasswordPlaceholder}
            placeholderTextColor={theme.textSecondary}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            editable={!isLoading}
          />
        )}
        <TouchableOpacity
          style={[
            appStyles.loginButton,
            { backgroundColor: theme.accent },
            isLoading && { opacity: 0.6 },
          ]}
          onPress={isRegisterMode ? handleRegister : handleLogin}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={[appStyles.loginButtonText, { color: "#fff" }]}>
              {isRegisterMode ? t.login.registerButton : t.login.loginButton}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={{ marginTop: 16 }}
          onPress={toggleRegisterMode}
          disabled={isLoading}
        >
          <Text style={[appStyles.skipButtonText, { color: theme.accent }]}>
            {isRegisterMode ? t.login.switchToLogin : t.login.switchToRegister}
          </Text>
        </TouchableOpacity>

        <View
          style={{
            flexDirection: "row",
            marginTop: 16,
            gap: 12,
          }}
        >
          <TouchableOpacity
            style={{
              paddingVertical: 10,
              paddingHorizontal: 16,
              borderWidth: 1,
              borderColor: theme.accentDim,
              borderRadius: 8,
            }}
            onPress={() => {
              handleSkip();
              onLoginSuccess("");
            }}
            disabled={isLoading}
          >
            <Text
              style={[appStyles.skipButtonText, { color: theme.accentDim }]}
            >
              {t.login.localDemoButton}
            </Text>
          </TouchableOpacity>

          {awsDemoUsername && awsDemoPassword && (
            <TouchableOpacity
              style={{
                paddingVertical: 10,
                paddingHorizontal: 16,
                borderWidth: 1,
                borderColor: theme.accentDim,
                borderRadius: 8,
              }}
              onPress={handleAwsDemo}
              disabled={isLoading}
            >
              <Text
                style={[appStyles.skipButtonText, { color: theme.accentDim }]}
              >
                {t.login.awsDemoButton}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginTop: 16,
            marginBottom: 20,
            gap: 6,
          }}
          onPress={() => setLanguage(language === "tr" ? "en" : "tr")}
          disabled={isLoading}
        >
          <Ionicons
            name="globe-outline"
            size={18}
            color={theme.textSecondary}
          />
          <Text
            style={[appStyles.skipButtonText, { color: theme.textSecondary }]}
          >
            {language === "tr" ? "English" : "Türkçe"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};
