// Ayarlar ekrani - tema, dil, ag testi ve cikis
// Props: theme, isDark, themeMode, onThemeModeChange, onLogout

import { View, Text, TouchableOpacity, ScrollView, Alert } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { SettingsScreenProps, ThemeOption } from "./types";
import { runNetworkDiagnostics } from "../../utils/networkDiagnostics";
import { usePopupMessage } from "../../context/PopupMessageContext";
import { useLanguage } from "../../context/LanguageContext";
import { Language } from "../../utils/strings";
import { s, vs, ms } from "../../utils/responsive";

// Surum bilgisi — app.config.js'den okunur
const APP_NAME = Constants.expoConfig?.name ?? "App";
const APP_VERSION = Constants.expoConfig?.version ?? "?";
const APP_BUILD = Constants.expoConfig?.android?.versionCode ?? Constants.expoConfig?.ios?.buildNumber ?? "?";

interface LanguageOption {
  code: Language;
  icon: string;
}

const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: "tr", icon: "flag" },
  { code: "en", icon: "flag-outline" },
];

export const SettingsScreen = ({
  theme,
  isDark,
  themeMode,
  onThemeModeChange,
  onLogout,
  onHardwareSetup,
}: SettingsScreenProps) => {
  const { showPopup } = usePopupMessage();
  const { language, setLanguage, t } = useLanguage();

  const themeOptions: ThemeOption[] = [
    {
      mode: "light",
      label: t.settings.themeLight,
      icon: "white-balance-sunny",
    },
    { mode: "dark", label: t.settings.themeDark, icon: "moon-waning-crescent" },
    { mode: "system", label: t.settings.themeSystem, icon: "cellphone" },
  ];

  const handleRunDiagnostics = async () => {
    Alert.alert(
      t.settings.diagnosticsTitle,
      t.settings.diagnosticsConfirmation,
      [
        { text: t.common.cancel, style: "cancel" },
        {
          text: t.settings.diagnosticsStart,
          onPress: async () => {
            try {
              const report = await runNetworkDiagnostics();
              console.log("[NETDIAG] report:", report.length, "results");

              // Count successes and failures
              const lines = report.split("\n");
              const passedLine = lines.find((l) => l.includes("passed"));

              showPopup(
                `${t.settings.diagnosticsCompleted}: ${passedLine || ""}`,
              );
            } catch (error) {
              showPopup(`${t.settings.diagnosticsFailed}: ${error}`);
            }
          },
        },
      ],
    );
  };

  return (
    <ScrollView
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
            <TouchableOpacity
              key={opt.mode}
              className="flex-1 center rounded-lg"
              style={{
                paddingHorizontal: 4,
                paddingVertical: 8,
                backgroundColor:
                  themeMode === opt.mode ? theme.primary : theme.surface,
                borderWidth: themeMode === opt.mode ? 2 : 1,
                borderColor:
                  themeMode === opt.mode ? theme.primary : theme.border,
              }}
              onPress={() => onThemeModeChange(opt.mode)}
            >
              <MaterialCommunityIcons
                name={opt.icon as any}
                size={16}
                color={themeMode === opt.mode ? theme.textOnPrimary : theme.primary}
                style={{ marginBottom: 2 }}
              />
              <Text
                className="text-center font-semibold"
                style={{
                  color: themeMode === opt.mode ? theme.textOnPrimary : theme.textMain,
                  fontSize: 9,
                }}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Language */}
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
            <TouchableOpacity
              key={opt.code}
              className="flex-1 center rounded-lg"
              style={{
                paddingHorizontal: 8,
                paddingVertical: 12,
                backgroundColor:
                  language === opt.code ? theme.primary : theme.surface,
                borderWidth: language === opt.code ? 2 : 1,
                borderColor:
                  language === opt.code ? theme.primary : theme.border,
              }}
              onPress={() => setLanguage(opt.code)}
            >
              <Text
                className="text-center font-semibold text-[13px]"
                style={{
                  color: language === opt.code ? theme.textOnPrimary : theme.textMain,
                }}
              >
                {opt.code === "tr"
                  ? t.settings.languageTurkish
                  : t.settings.languageEnglish}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* AWS Connection Test */}
      <TouchableOpacity
        className="row-between surface-bg rounded-lg mb-3"
        style={{ paddingVertical: 16, paddingHorizontal: 16 }}
        onPress={handleRunDiagnostics}
      >
        <View className="row">
          <MaterialCommunityIcons
            name="network-strength-4"
            size={20}
            color={theme.primary}
            style={{ marginRight: 12 }}
          />
          <Text
            className="text-primary font-semibold"
            style={{ fontSize: ms(16, 0.3) }}
          >
            {t.settings.awsConnectionTest}
          </Text>
        </View>
        <MaterialCommunityIcons
          name="chevron-right"
          size={20}
          color={theme.textSecondary}
        />
      </TouchableOpacity>

      {/* Donanim Kurulumu */}
      <TouchableOpacity
        className="row-between surface-bg rounded-lg mb-3"
        style={{ paddingVertical: 16, paddingHorizontal: 16 }}
        onPress={onHardwareSetup}
      >
        <View className="row">
          <MaterialCommunityIcons
            name="access-point"
            size={20}
            color={theme.primary}
            style={{ marginRight: 12 }}
          />
          <Text
            className="text-primary font-semibold"
            style={{ fontSize: ms(16, 0.3) }}
          >
            {t.hardware.title}
          </Text>
        </View>
        <MaterialCommunityIcons
          name="chevron-right"
          size={20}
          color={theme.textSecondary}
        />
      </TouchableOpacity>

      {/* Logout */}
      <TouchableOpacity
        className="row justify-center rounded-xl mt-6"
        style={{
          backgroundColor: "#ef4444",
          paddingVertical: vs(12),
          paddingHorizontal: s(24),
        }}
        onPress={onLogout}
      >
        <MaterialCommunityIcons
          name="logout"
          size={20}
          color="#fff"
          style={{ marginRight: 8 }}
        />
        <Text style={{ fontSize: ms(16, 0.3), fontWeight: "700", color: "#fff" }}>
          {t.settings.logout}
        </Text>
      </TouchableOpacity>

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
};
