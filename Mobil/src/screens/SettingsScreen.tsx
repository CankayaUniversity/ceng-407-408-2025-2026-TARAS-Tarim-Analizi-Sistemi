import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { appStyles } from '../styles';
import { HEADER_TEXT } from '../constants';
import { Theme } from '../types';

export type ThemeMode = 'light' | 'dark' | 'system' | 'weather';

interface SettingsScreenProps {
  theme: Theme;
  isDark: boolean;
  themeMode: ThemeMode;
  onThemeModeChange: (mode: ThemeMode) => void;
  onLogout: () => void;
}

const THEME_OPTIONS: { mode: ThemeMode; label: string; icon: string }[] = [
  { mode: 'light', label: 'Açık', icon: 'white-balance-sunny' },
  { mode: 'dark', label: 'Koyu', icon: 'moon-waning-crescent' },
  { mode: 'system', label: 'Sistem', icon: 'cog' },
  { mode: 'weather', label: 'Hava Durumu', icon: 'cloud' },
];

export const SettingsScreen = ({
  theme,
  isDark,
  themeMode,
  onThemeModeChange,
  onLogout,
}: SettingsScreenProps) => {
  return (
    <ScrollView style={[appStyles.settingsContainer, { backgroundColor: theme.background }]}>
      <Text style={[appStyles.placeholderText, { color: theme.text }]}>{HEADER_TEXT.settings}</Text>
      <View style={[appStyles.settingItem, { borderBottomColor: theme.surface, alignItems: "center" },]}>
        <View style={[appStyles.settingLeft, { flex: 1 }]}>
          <MaterialCommunityIcons
            name={isDark ? 'moon-waning-crescent' : 'white-balance-sunny'}
            size={20}
            color={theme.accent}
            style={{ marginRight: 12 }}
          />
          <View>
            <Text style={[appStyles.settingLabel, { color: theme.text }]}>Tema Modu</Text>
          </View>
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "flex-end",
          }}
        >
          {THEME_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.mode}
              style={{
                marginLeft: 8,
                borderRadius: 8,
                paddingHorizontal: 8,
                paddingVertical: 6,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor:
                  themeMode === opt.mode ? theme.accent : theme.surface,
                borderWidth: themeMode === opt.mode ? 2 : 1,
                borderColor:
                  themeMode === opt.mode ? theme.accent : theme.accentDim,
                minWidth: 64,
                flexShrink: 0,
              }}
              onPress={() => onThemeModeChange(opt.mode)}
            >
              <MaterialCommunityIcons
                name={opt.icon as any}
                size={16}
                color={themeMode === opt.mode ? '#fff' : theme.accent}
                style={{ marginBottom: 2 }}
              />
              <Text style={{ color: themeMode === opt.mode ? '#fff' : theme.text, fontSize: 11, fontWeight: '600' }}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <TouchableOpacity
        style={[appStyles.logoutButton, { backgroundColor: "#ef4444" }]}
        onPress={onLogout}
      >
        <MaterialCommunityIcons name="logout" size={20} color="#fff" style={{ marginRight: 8 }} />
        <Text style={appStyles.logoutButtonText}>Çıkış Yap</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};
