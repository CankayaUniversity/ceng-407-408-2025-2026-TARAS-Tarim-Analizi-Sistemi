import { useState } from "react";
import {
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  LayoutAnimation,
  Platform,
  KeyboardAvoidingView,
  Animated,
} from "react-native";
import { appStyles } from "../../styles";
import { authAPI } from "../../utils/api";
import { useKeyboard } from "../../hooks/useKeyboard";
import { LoginScreenProps } from "./types";

import LogoLight from "../../assets/Taras-logo-light.svg";
import LogoDark from "../../assets/Taras-logo-dark.svg";

export const LoginScreen = ({
  theme,
  onLoginSuccess,
  onSkip,
}: LoginScreenProps) => {
  const { animatedPadding } = useKeyboard();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [username, setUsername] = useState("");

  const animatedPaddingTop = animatedPadding.interpolate({
    inputRange: [0, 1],
    outputRange: [160, 8],
  });

  const toggleRegisterMode = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsRegisterMode(!isRegisterMode);
    setConfirmPassword("");
  };

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert("Hata", "Lutfen kullanici adi ve sifre giriniz.");
      return;
    }

    setIsLoading(true);
    const response = await authAPI.login(username.trim(), password);
    setIsLoading(false);

    console.log("Login response:", response);
    console.log("User data:", response.data?.user);

    if (response.success) {
      setUsername("");
      setPassword("");
      // Pass user's username to onLoginSuccess (no fullName field in User type)
      const displayName = response.data?.user.username || "";
      console.log("Calling onLoginSuccess with:", displayName);
      onLoginSuccess(displayName);
    } else {
      Alert.alert(
        "Giris Basarisiz",
        response.error || "Kullanici adi/e-posta veya sifre hatali.",
      );
      // Always call onLoginSuccess with empty string to avoid type error
      // onLoginSuccess("");
    }
  };

  const handleRegister = async () => {
    if (
      !username.trim() ||
      !email.trim() ||
      !password.trim() ||
      !confirmPassword.trim()
    ) {
      Alert.alert("Hata", "Lutfen tum alanlari doldurunuz.");
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert("Hata", "Sifreler eslesmilor. Lutfen kontrol ediniz.");
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
      Alert.alert(
        "Kayit Basarisiz",
        response.error || "Kayit islemi basarisiz oldu.",
      );
    }
  };

  const handleSkip = () => {
    setEmail("");
    setPassword("");
    onSkip();
  };

  return (
    <KeyboardAvoidingView
      style={[appStyles.loginContainer, { backgroundColor: theme.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
    >
      <Animated.ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "flex-start",
          alignItems: "center",
          paddingBottom: 80,
          width: "100%",
        }}
        style={{ width: "100%", paddingTop: animatedPaddingTop }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {theme.isDark ? (
          <LogoDark width={220} height={220} style={{ marginBottom: 8 }} />
        ) : (
          <LogoLight width={220} height={220} style={{ marginBottom: 8 }} />
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
            placeholder="E-posta"
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
          placeholder="Kullanici Adi (testuser / ahmet_ciftci)"
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
          placeholder="Sifre (test123 / password123)"
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
            placeholder="Sifre Tekrar"
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
              {isRegisterMode ? "Kayit Ol" : "Giris Yap"}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={{ marginTop: 16 }}
          onPress={toggleRegisterMode}
          disabled={isLoading}
        >
          <Text style={[appStyles.skipButtonText, { color: theme.accent }]}>
            {isRegisterMode
              ? "Zaten hesabiniz var mi? Giris Yap"
              : "Hesabiniz yok mu? Kayit Ol"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={{ marginTop: 8 }}
           onPress={() => {
             handleSkip();
             onLoginSuccess("");
           }}
          disabled={isLoading}
        >
          <Text style={[appStyles.skipButtonText, { color: theme.accentDim }]}>
            Simdilik Atla
          </Text>
        </TouchableOpacity>
      </Animated.ScrollView>
    </KeyboardAvoidingView>
  );
};
