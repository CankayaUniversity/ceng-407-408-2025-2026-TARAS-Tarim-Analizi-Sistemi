// Ayarlar ekrani - tema, dil ve cikis
// Props: theme, isDark, themeMode, onThemeModeChange, onLogout

import { memo, useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, Switch, Alert } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Constants from "expo-constants";
import { SettingsScreenProps, ThemeOption } from "./types";
import { useLanguage } from "../../context/LanguageContext";
import { FocusableSection } from "../../components/FocusableSection";
import { PressableDark } from "../../components/PressableDark";
import { OptionButton } from "../../components/OptionButton";
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

// Shared section vertical padding so every Settings row breathes the same way
const SECTION_PADDING_V = 18;

const SettingRow = memo(function SettingRow({
  icon,
  label,
  onPress,
  theme,
}: SettingRowProps) {
  return (
    <PressableDark
      className="row-between"
      style={{
        paddingVertical: vs(SECTION_PADDING_V),
        borderBottomWidth: 1,
        borderBottomColor: theme.border,
      }}
      onPress={onPress}
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
    </PressableDark>
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

  const applyDatasetConsent = async (next: boolean) => {
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

  const handleToggleDatasetConsent = (next: boolean) => {
    if (next) {
      // Opt-in is harmless; apply immediately
      void applyDatasetConsent(true);
      return;
    }
    // Opt-out: confirm to avoid accidental taps
    Alert.alert(
      t.settings.datasetConsentDisableTitle,
      t.settings.datasetConsentDisableMessage,
      [
        { text: t.common.cancel, style: "cancel" },
        {
          text: t.settings.datasetConsentDisableConfirm,
          style: "destructive",
          onPress: () => {
            void applyDatasetConsent(false);
          },
        },
      ],
    );
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

  const sectionStyle = {
    paddingVertical: vs(SECTION_PADDING_V),
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  } as const;

  return (
    <ScrollView
      ref={scrollViewRef}
      className="screen-bg"
      style={{ paddingHorizontal: s(24) }}
      contentContainerStyle={{ paddingTop: vs(8), paddingBottom: vs(24) }}
    >
      {/* Theme Mode */}
      <FocusableSection
        id="themeMode"
        screen="settings"
        theme={theme}
        scrollViewRef={scrollViewRef}
      >
        <View style={sectionStyle}>
          <View className="row mb-3">
            <MaterialCommunityIcons
              name={isDark ? "moon-waning-crescent" : "white-balance-sunny"}
              size={20}
              color={theme.primary}
              style={{ marginRight: 12 }}
            />
            <Text
              className="text-primary font-semibold"
              style={{ fontSize: ms(16, 0.3) }}
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
                layout="column"
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
        <View style={sectionStyle}>
          <View className="row mb-3">
            <MaterialCommunityIcons
              name="translate"
              size={20}
              color={theme.primary}
              style={{ marginRight: 12 }}
            />
            <Text
              className="text-primary font-semibold"
              style={{ fontSize: ms(16, 0.3) }}
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
        <View className="row-between" style={sectionStyle}>
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
                style={{ fontSize: ms(16, 0.3) }}
              >
                {t.settings.datasetConsentTitle}
              </Text>
              <Text
                style={{
                  color: theme.textSecondary,
                  fontSize: ms(12, 0.3),
                  marginTop: 4,
                  lineHeight: ms(16, 0.3),
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
        <PressableDark
          className="row justify-center rounded-xl"
          style={{
            backgroundColor: theme.danger,
            paddingVertical: vs(12),
            paddingHorizontal: s(24),
            marginTop: vs(24),
            overflow: "hidden",
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
        </PressableDark>
      </FocusableSection>

      {/* Surum bilgisi */}
      <Text
        className="text-center"
        style={{
          marginTop: vs(20),
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
