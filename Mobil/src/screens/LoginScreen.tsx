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
import { appStyles } from "../styles";
import { authAPI } from "../utils/api";
import { useKeyboard } from "../hooks/useKeyboard";

import LogoLight from "../assets/Taras-logo-light.svg";
import LogoDark from "../assets/Taras-logo-dark.svg";

interface LoginScreenProps {
  theme: any;
  onLoginSuccess: () => void;
  onSkip: () => void;
}

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
      Alert.alert("Hata", "Lütfen kullanıcı adı ve şifre giriniz.");
      return;
    }

    setIsLoading(true);
    const response = await authAPI.login(username.trim(), password);
    setIsLoading(false);

    if (response.success) {
      Alert.alert("Başarılı", `Hoş geldiniz, ${response.data?.user.username}!`);
      setUsername("");
      setPassword("");
      onLoginSuccess();
    } else {
      Alert.alert(
        "Giriş Başarısız",
        response.error || "Kullanıcı adı/e-posta veya şifre hatalı.",
      );
    }
  };

  const handleRegister = async () => {
    if (
      !username.trim() ||
      !email.trim() ||
      !password.trim() ||
      !confirmPassword.trim()
    ) {
      Alert.alert("Hata", "Lütfen tüm alanları doldurunuz.");
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert("Hata", "Şifreler eşleşmiyor. Lütfen kontrol ediniz.");
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
      Alert.alert(
        "Başarılı",
        `Hesabınız oluşturuldu, hoş geldiniz ${response.data?.user.username}!`,
      );
      setEmail("");
      setPassword("");
      setConfirmPassword("");
      setUsername("");
      onLoginSuccess();
    } else {
      Alert.alert(
        "Kayıt Başarısız",
        response.error || "Kayıt işlemi başarısız oldu.",
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
          placeholder="Kullanıcı Adı (testuser)"
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
          placeholder="Şifre (test123)"
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
            placeholder="Şifre Tekrar"
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
              {isRegisterMode ? "Kayıt Ol" : "Giriş Yap"}
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
              ? "Zaten hesabınız var mı? Giriş Yap"
              : "Hesabınız yok mu? Kayıt Ol"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={{ marginTop: 8 }}
          onPress={handleSkip}
          disabled={isLoading}
        >
          <Text style={[appStyles.skipButtonText, { color: theme.accentDim }]}>
            Şimdilik Atla
          </Text>
        </TouchableOpacity>
      </Animated.ScrollView>
    </KeyboardAvoidingView>
  );
};
