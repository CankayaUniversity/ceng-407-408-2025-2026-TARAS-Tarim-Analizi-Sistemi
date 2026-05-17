// Ayarlar ekrani - tema, dil ve cikis
// Props: theme, isDark, themeMode, onThemeModeChange, onLogout

import { memo, useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, Switch } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Constants from "expo-constants";
import { SettingsScreenProps, ThemeOption } from "./types";
import { useLanguage } from "../../context/LanguageContext";
import { FocusableSection } from "../../components/FocusableSection";
import { Language } from "../../utils/strings";
import { Theme } from "../../utils/theme";
import { s, vs, ms } from "../../utils/responsive";

// Surum bilgisi — app.config.js'den okunur
const APP_NAME = Constants.expoConfig?.name ?? "App";
const APP_VERSION = Constants.expoConfig?.version ?? "?";
const APP_BUILD =
  Constants.expoConfig?.android?.versionCode ??
  Constants.expoConfig?.ios?.buildNumber ??
  "?";

interface LanguageOption {
  code: Language;
  icon: string;
}

const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: "tr", icon: "flag" },
  { code: "en", icon: "flag-outline" },
];

interface SettingRowProps {
  icon: string;
  label: string;
  onPress: () => void;
  theme: Theme;
}

interface OptionButtonProps {
  label: string;
  active: boolean;
  onPress: () => void;
  theme: Theme;
  icon?: string;
  paddingV?: number;
}

const OptionButton = memo(function OptionButton({
  label,
  active,
  onPress,
  theme,
  icon,
  paddingV = 8,
}: OptionButtonProps) {
  return (
    <TouchableOpacity
      className="flex-1 center rounded-lg"
      style={{
        paddingHorizontal: icon ? 4 : 8,
        paddingVertical: paddingV,
        backgroundColor: active ? theme.primary : theme.surface,
        borderWidth: active ? 2 : 1,
        borderColor: active ? theme.primary : theme.border,
      }}
      onPress={onPress}
    >
      {icon && (
        <MaterialCommunityIcons
          name={icon as any}
          size={16}
          color={active ? theme.textOnPrimary : theme.primary}
          style={{ marginBottom: 2 }}
        />
      )}
      <Text
        className="text-center font-semibold"
        style={{
          color: active ? theme.textOnPrimary : theme.textMain,
          fontSize: icon ? 9 : 13,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
});

const SettingRow = memo(function SettingRow({
  icon,
  label,
  onPress,
  theme,
}: SettingRowProps) {
  return (
    <TouchableOpacity
      className="row-between surface-bg rounded-lg mb-3"
      style={{ paddingVertical: 16, paddingHorizontal: 16 }}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View className="row">
        <MaterialCommunityIcons
          name={icon as any}
          size={20}
          color={theme.primary}
          style={{ marginRight: 12 }}
        />
        <Text
          className="text-primary font-semibold"
          style={{ fontSize: ms(16, 0.3) }}
        >
          {label}
        </Text>
      </View>
      <MaterialCommunityIcons
        name="chevron-right"
        size={20}
        color={theme.textSecondary}
      />
    </TouchableOpacity>
  );
});

export const SettingsScreen = memo(function SettingsScreen({
  theme,
  isDark,
  themeMode,
  onThemeModeChange,
  onLogout,
  onHardwareSetup,
}: SettingsScreenProps) {
  const { language, setLanguage, t } = useLanguage();
  const scrollViewRef = useRef<ScrollView>(null);
  const [datasetConsent, setDatasetConsent] = useState<boolean>(true);

  useEffect(() => {
    (async () => {
      const { loadDatasetConsent, saveDatasetConsent } = await import(
        "../../utils/captureMetadata"
      );
      try {
        const { authAPI } = await import("../../utils/api");
        const res = await authAPI.getProfile();
        if (res.success && typeof res.data?.dataset_consent === "boolean") {
          setDatasetConsent(res.data.dataset_consent);
          await saveDatasetConsent(res.data.dataset_consent);
          return;
        }
      } catch {
        // Sunucu erisilemez — yerel cache'e dus
      }
      setDatasetConsent(await loadDatasetConsent());
    })();
  }, []);

  const handleToggleDatasetConsent = async (next: boolean) => {
    setDatasetConsent(next);
    const { saveDatasetConsent } = await import("../../utils/captureMetadata");
    await saveDatasetConsent(next);
    try {
      const { authAPI } = await import("../../utils/api");
      const res = await authAPI.updateDatasetConsent(next);
      if (!res.success) {
        setDatasetConsent(!next);
        await saveDatasetConsent(!next);
      }
    } catch {
      // Offline — optimistic deger AsyncStorage'da, sonraki acilis senkron eder
    }
  };

  const themeOptions: ThemeOption[] = [
    {
      mode: "light",
      label: t.settings.themeLight,
      icon: "white-balance-sunny",
    },
    { mode: "dark", label: t.settings.themeDark, icon: "moon-waning-crescent" },
    { mode: "system", label: t.settings.themeSystem, icon: "cellphone" },
  ];

  return (
    <ScrollView
      ref={scrollViewRef}
      className="screen-bg"
      style={{ paddingHorizontal: s(24), paddingTop: vs(24) }}
    >
      <Text
        className="text-primary font-bold"
        style={{ fontSize: ms(24, 0.3), marginBottom: vs(6) }}
      >
        {t.settings.title}
      </Text>

      {/* Theme Mode */}
      <FocusableSection
        id="themeMode"
        screen="settings"
        theme={theme}
        scrollViewRef={scrollViewRef}
      >
        <View
          className="mb-5"
          style={{
            paddingVertical: vs(20),
            borderBottomWidth: 1,
            borderBottomColor: theme.surface,
          }}
        >
          <View className="row mb-3">
            <MaterialCommunityIcons
              name={isDark ? "moon-waning-crescent" : "white-balance-sunny"}
              size={20}
              color={theme.primary}
              style={{ marginRight: 12 }}
            />
            <Text
              className="text-primary font-semibold"
              style={{ fontSize: ms(16, 0.3), marginBottom: vs(4) }}
            >
              {t.settings.themeMode}
            </Text>
          </View>

          <View className="row-between" style={{ gap: 4 }}>
            {themeOptions.map((opt) => (
              <OptionButton
                key={opt.mode}
                label={opt.label}
                icon={opt.icon}
                active={themeMode === opt.mode}
                onPress={() => onThemeModeChange(opt.mode)}
                theme={theme}
              />
            ))}
          </View>
        </View>
      </FocusableSection>

      {/* Language */}
      <FocusableSection
        id="language"
        screen="settings"
        theme={theme}
        scrollViewRef={scrollViewRef}
      >
        <View
          className="mb-5"
          style={{
            paddingVertical: vs(20),
            borderBottomWidth: 1,
            borderBottomColor: theme.surface,
          }}
        >
          <View className="row mb-3">
            <MaterialCommunityIcons
              name="translate"
              size={20}
              color={theme.primary}
              style={{ marginRight: 12 }}
            />
            <Text
              className="text-primary font-semibold"
              style={{ fontSize: ms(16, 0.3), marginBottom: vs(4) }}
            >
              {t.settings.language}
            </Text>
          </View>

          <View className="row-between" style={{ gap: 8 }}>
            {LANGUAGE_OPTIONS.map((opt) => (
              <OptionButton
                key={opt.code}
                label={
                  opt.code === "tr"
                    ? t.settings.languageTurkish
                    : t.settings.languageEnglish
                }
                active={language === opt.code}
                onPress={() => setLanguage(opt.code)}
                theme={theme}
                paddingV={12}
              />
            ))}
          </View>
        </View>
      </FocusableSection>

      {/* Dataset opt-in */}
      <FocusableSection
        id="datasetConsent"
        screen="settings"
        theme={theme}
        scrollViewRef={scrollViewRef}
      >
        <View
          className="row-between"
          style={{
            paddingVertical: vs(14),
            borderBottomWidth: 1,
            borderBottomColor: theme.surface,
          }}
        >
          <View className="row" style={{ flex: 1, marginRight: 12 }}>
            <MaterialCommunityIcons
              name="image-multiple-outline"
              size={20}
              color={theme.primary}
              style={{ marginRight: 12 }}
            />
            <View style={{ flex: 1 }}>
              <Text
                className="text-primary font-semibold"
                style={{ fontSize: ms(15, 0.3) }}
              >
                {t.settings.datasetConsentTitle}
              </Text>
              <Text
                style={{
                  color: theme.textSecondary,
                  fontSize: ms(12, 0.3),
                  marginTop: 2,
                }}
              >
                {t.settings.datasetConsentSubtitle}
              </Text>
            </View>
          </View>
          <Switch
            value={datasetConsent}
            onValueChange={handleToggleDatasetConsent}
            trackColor={{
              false: theme.textSecondary + "55",
              true: theme.primary + "AA",
            }}
            thumbColor={datasetConsent ? theme.primary : theme.surface}
          />
        </View>
      </FocusableSection>

      {/* Donanim Kurulumu */}
      <FocusableSection
        id="hardwareSetup"
        screen="settings"
        theme={theme}
        scrollViewRef={scrollViewRef}
      >
        <SettingRow
          icon="access-point"
          label={t.hardware.title}
          onPress={onHardwareSetup}
          theme={theme}
        />
      </FocusableSection>

      {/* Logout */}
      <FocusableSection
        id="logout"
        screen="settings"
        theme={theme}
        scrollViewRef={scrollViewRef}
      >
        <TouchableOpacity
          className="row justify-center rounded-xl mt-6"
          style={{
            backgroundColor: theme.danger,
            paddingVertical: vs(12),
            paddingHorizontal: s(24),
          }}
          onPress={onLogout}
        >
          <MaterialCommunityIcons
            name="logout"
            size={20}
            color={theme.textOnPrimary}
            style={{ marginRight: 8 }}
          />
          <Text
            style={{ fontSize: ms(16, 0.3), fontWeight: "700", color: theme.textOnPrimary }}
          >
            {t.settings.logout}
          </Text>
        </TouchableOpacity>
      </FocusableSection>

      {/* Surum bilgisi */}
      <Text
        className="text-center"
        style={{
          marginTop: vs(20),
          marginBottom: vs(12),
          fontSize: ms(11, 0.3),
          color: theme.textSecondary,
          opacity: 0.6,
        }}
      >
        {APP_NAME} v{APP_VERSION} ({APP_BUILD})
      </Text>
    </ScrollView>
  );
});
