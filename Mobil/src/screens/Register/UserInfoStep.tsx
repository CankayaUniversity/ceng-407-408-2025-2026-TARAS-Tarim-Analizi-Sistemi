// Hesap bilgileri — kullanici adi, e-posta, sifre, rol

import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useLanguage } from "../../context/LanguageContext";
import { s, vs, ms } from "../../utils/responsive";
import type { RegisterStepProps } from "./types";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const UserInfoStep = ({
  theme,
  state,
  onUpdate,
  onSubmit,
  onBack,
  isLoading,
}: RegisterStepProps) => {
  const { t } = useLanguage();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    if (
      !state.username.trim() ||
      !state.email.trim() ||
      !state.password.trim() ||
      !state.confirmPassword.trim()
    ) {
      setError(t.register.errorEmptyFields);
      return;
    }
    if (!EMAIL_REGEX.test(state.email.trim())) {
      setError(t.register.errorInvalidEmail);
      return;
    }
    if (state.password.length < 8) {
      setError(t.register.errorPasswordTooShort);
      return;
    }
    if (state.password !== state.confirmPassword) {
      setError(t.register.errorPasswordMismatch);
      return;
    }
    setError(null);
    onSubmit();
  };

  return (
    <View className="w-full">
      {/* Error banner */}
      {error && (
        <View
          className="w-full rounded-xl row mb-3"
          style={{
            backgroundColor: theme.danger + "20",
            paddingVertical: vs(10),
            paddingHorizontal: s(16),
          }}
        >
          <MaterialCommunityIcons
            name="alert-circle"
            size={18}
            color={theme.danger}
            style={{ marginRight: s(8) }}
          />
          <Text
            style={{ flex: 1, fontSize: ms(13, 0.3), color: theme.danger }}
          >
            {error}
          </Text>
        </View>
      )}

      {/* Username */}
      <TextInput
        className="w-full rounded-xl border mb-3 surface-bg text-primary"
        style={{
          paddingVertical: vs(12),
          paddingHorizontal: s(16),
          borderColor: theme.border,
          fontSize: ms(16, 0.3),
        }}
        placeholder={t.register.usernamePlaceholder}
        placeholderTextColor={theme.textSecondary}
        value={state.username}
        onChangeText={(text) => {
          onUpdate({ username: text });
          if (error) setError(null);
        }}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!isLoading}
      />

      {/* Email */}
      <TextInput
        className="w-full rounded-xl border mb-3 surface-bg text-primary"
        style={{
          paddingVertical: vs(12),
          paddingHorizontal: s(16),
          borderColor: theme.border,
          fontSize: ms(16, 0.3),
        }}
        placeholder={t.register.emailPlaceholder}
        placeholderTextColor={theme.textSecondary}
        value={state.email}
        onChangeText={(text) => {
          onUpdate({ email: text });
          if (error) setError(null);
        }}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        editable={!isLoading}
      />

      {/* Password */}
      <TextInput
        className="w-full rounded-xl border mb-3 surface-bg text-primary"
        style={{
          paddingVertical: vs(12),
          paddingHorizontal: s(16),
          borderColor: theme.border,
          fontSize: ms(16, 0.3),
        }}
        placeholder={t.register.passwordPlaceholder}
        placeholderTextColor={theme.textSecondary}
        value={state.password}
        onChangeText={(text) => {
          onUpdate({ password: text });
          if (error) setError(null);
        }}
        secureTextEntry
        editable={!isLoading}
      />

      {/* Confirm password */}
      <TextInput
        className="w-full rounded-xl border mb-3 surface-bg text-primary"
        style={{
          paddingVertical: vs(12),
          paddingHorizontal: s(16),
          borderColor: theme.border,
          fontSize: ms(16, 0.3),
        }}
        placeholder={t.register.confirmPasswordPlaceholder}
        placeholderTextColor={theme.textSecondary}
        value={state.confirmPassword}
        onChangeText={(text) => {
          onUpdate({ confirmPassword: text });
          if (error) setError(null);
        }}
        secureTextEntry
        editable={!isLoading}
      />

      {/* Submit button */}
      <TouchableOpacity
        className="w-full rounded-xl center mt-6"
        style={{
          backgroundColor: theme.primary,
          paddingVertical: vs(14),
          paddingHorizontal: s(24),
          opacity: isLoading ? 0.6 : 1,
        }}
        onPress={handleSubmit}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color={theme.textOnPrimary} />
        ) : (
          <Text
            className="text-center font-bold"
            style={{ color: theme.textOnPrimary, fontSize: ms(16, 0.3) }}
          >
            {t.register.createAccountButton}
          </Text>
        )}
      </TouchableOpacity>

      {/* Back to login */}
      <TouchableOpacity
        className="mt-4"
        onPress={onBack}
        disabled={isLoading}
      >
        <Text
          className="text-center font-semibold"
          style={{ color: theme.primary, fontSize: ms(14, 0.3) }}
        >
          {t.register.backToLogin}
        </Text>
      </TouchableOpacity>
    </View>
  );
};
