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

export const SettingsScreen = ({ theme, isDark, themeMode, onThemeModeChange, onLogout }: SettingsScreenProps) => {
  const getModeLabel = (mode: ThemeMode) => {
    if (mode === 'light') return 'Açık';
    if (mode === 'dark') return 'Koyu';
    if (mode === 'system') return `Sistem (${isDark ? 'Koyu' : 'Açık'})`;
    return 'Hava Durumu';
  };

  return (
    <ScrollView style={[appStyles.settingsContainer, { backgroundColor: theme.background }]}>
      <Text style={[appStyles.placeholderText, { color: theme.text }]}>{HEADER_TEXT.settings}</Text>
      <Text style={[appStyles.placeholderSub, { color: theme.textSecondary, marginBottom: 32 }]}>
        Tercihlerinizi yönetin
      </Text>
      <View style={[appStyles.settingItem, { borderBottomColor: theme.surface }]}>
        <View style={appStyles.settingLeft}>
          <MaterialCommunityIcons
            name={isDark ? 'moon-waning-crescent' : 'white-balance-sunny'}
            size={24}
            color={theme.accent}
            style={{ marginRight: 12 }}
          />
          <View>
            <Text style={[appStyles.settingLabel, { color: theme.text }]}>Tema Modu</Text>
            <Text style={[appStyles.settingDesc, { color: theme.textSecondary }]}>{getModeLabel(themeMode)}</Text>
          </View>
        </View>
      </View>
      <View style={{ paddingHorizontal: 16, paddingVertical: 16 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {THEME_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.mode}
              style={{
                flex: 0.47,
                borderRadius: 8,
                padding: 12,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: themeMode === opt.mode ? theme.accent : theme.surface,
                borderWidth: themeMode === opt.mode ? 2 : 1,
                borderColor: themeMode === opt.mode ? theme.accent : theme.accentDim,
              }}
              onPress={() => onThemeModeChange(opt.mode)}
            >
              <MaterialCommunityIcons
                name={opt.icon as any}
                size={24}
                color={themeMode === opt.mode ? '#fff' : theme.accent}
                style={{ marginBottom: 4 }}
              />
              <Text style={{ color: themeMode === opt.mode ? '#fff' : theme.text, fontSize: 12, fontWeight: '600' }}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <TouchableOpacity
        style={[appStyles.logoutButton, { backgroundColor: '#ef4444' }]}
        onPress={onLogout}
      >
        <MaterialCommunityIcons name="logout" size={20} color="#fff" style={{ marginRight: 8 }} />
        <Text style={appStyles.logoutButtonText}>Çıkış Yap</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};
