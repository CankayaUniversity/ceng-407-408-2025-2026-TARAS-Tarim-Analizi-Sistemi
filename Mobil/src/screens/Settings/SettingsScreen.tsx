// Ayarlar ekrani - tema, dil, ag testi ve cikis
// Props: theme, isDark, themeMode, onThemeModeChange, onLogout

import { View, Text, TouchableOpacity, ScrollView, Alert } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { appStyles } from "../../styles";
import { SettingsScreenProps, ThemeOption } from "./types";
import { runNetworkDiagnostics } from "../../utils/networkDiagnostics";
import { usePopupMessage } from "../../context/PopupMessageContext";
import { useLanguage } from "../../context/LanguageContext";
import { Language } from "../../utils/strings";

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
    { mode: "system", label: t.settings.themeSystem, icon: "cog" },
    { mode: "weather", label: t.settings.themeWeather, icon: "cloud" },
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
              console.log("Network Diagnostics Report:\n", report);

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
      style={[
        appStyles.settingsContainer,
        { backgroundColor: theme.background, paddingTop: 4 },
      ]}
    >
      <Text style={[appStyles.placeholderText, { color: theme.text }]}>
        {t.settings.title}
      </Text>

      {/* Theme Mode */}
      <View
        style={[
          appStyles.settingItem,
          {
            borderBottomColor: theme.surface,
            flexDirection: "column",
            alignItems: "stretch",
          },
        ]}
      >
        <View style={[appStyles.settingLeft, { marginBottom: 12 }]}>
          <MaterialCommunityIcons
            name={isDark ? "moon-waning-crescent" : "white-balance-sunny"}
            size={20}
            color={theme.accent}
            style={{ marginRight: 12 }}
          />
          <Text style={[appStyles.settingLabel, { color: theme.text }]}>
            {t.settings.themeMode}
          </Text>
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 4,
          }}
        >
          {themeOptions.map((opt) => (
            <TouchableOpacity
              key={opt.mode}
              style={{
                flex: 1,
                borderRadius: 8,
                paddingHorizontal: 4,
                paddingVertical: 8,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor:
                  themeMode === opt.mode ? theme.accent : theme.surface,
                borderWidth: themeMode === opt.mode ? 2 : 1,
                borderColor:
                  themeMode === opt.mode ? theme.accent : theme.accentDim,
              }}
              onPress={() => onThemeModeChange(opt.mode)}
            >
              <MaterialCommunityIcons
                name={opt.icon as any}
                size={16}
                color={themeMode === opt.mode ? "#fff" : theme.accent}
                style={{ marginBottom: 2 }}
              />
              <Text
                style={{
                  color: themeMode === opt.mode ? "#fff" : theme.text,
                  fontSize: 9,
                  fontWeight: "600",
                  textAlign: "center",
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
        style={[
          appStyles.settingItem,
          {
            borderBottomColor: theme.surface,
            flexDirection: "column",
            alignItems: "stretch",
          },
        ]}
      >
        <View style={[appStyles.settingLeft, { marginBottom: 12 }]}>
          <MaterialCommunityIcons
            name="translate"
            size={20}
            color={theme.accent}
            style={{ marginRight: 12 }}
          />
          <Text style={[appStyles.settingLabel, { color: theme.text }]}>
            {t.settings.language}
          </Text>
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          {LANGUAGE_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.code}
              style={{
                flex: 1,
                borderRadius: 8,
                paddingHorizontal: 8,
                paddingVertical: 12,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor:
                  language === opt.code ? theme.accent : theme.surface,
                borderWidth: language === opt.code ? 2 : 1,
                borderColor:
                  language === opt.code ? theme.accent : theme.accentDim,
              }}
              onPress={() => setLanguage(opt.code)}
            >
              <Text
                style={{
                  color: language === opt.code ? "#fff" : theme.text,
                  fontSize: 13,
                  fontWeight: "600",
                  textAlign: "center",
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
        style={[
          appStyles.settingItem,
          {
            borderBottomColor: theme.surface,
            backgroundColor: theme.surface,
            borderRadius: 8,
            marginBottom: 12,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingVertical: 16,
            paddingHorizontal: 16,
          },
        ]}
        onPress={handleRunDiagnostics}
      >
        <View style={[appStyles.settingLeft]}>
          <MaterialCommunityIcons
            name="network-strength-4"
            size={20}
            color={theme.accent}
            style={{ marginRight: 12 }}
          />
          <Text style={[appStyles.settingLabel, { color: theme.text }]}>
            {t.settings.awsConnectionTest}
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
        style={[appStyles.logoutButton, { backgroundColor: "#ef4444" }]}
        onPress={onLogout}
      >
        <MaterialCommunityIcons
          name="logout"
          size={20}
          color="#fff"
          style={{ marginRight: 8 }}
        />
        <Text style={appStyles.logoutButtonText}>{t.settings.logout}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};
