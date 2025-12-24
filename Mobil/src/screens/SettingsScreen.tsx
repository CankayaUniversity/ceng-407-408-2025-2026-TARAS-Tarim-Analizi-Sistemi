import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { appStyles } from '../styles';
import { HEADER_TEXT } from '../constants';

export type ThemeMode = 'light' | 'dark' | 'system' | 'weather';

interface SettingsScreenProps {
  theme: any;
  effectiveIsDark: boolean;
  themeMode: ThemeMode;
  onThemeModeChange: (mode: ThemeMode) => void;
  onLogout: () => void;
}

export const SettingsScreen = ({
  theme,
  effectiveIsDark,
  themeMode,
  onThemeModeChange,
  onLogout,
}: SettingsScreenProps) => {
  const getModeDescription = (mode: ThemeMode) => {
    switch (mode) {
      case 'light':
        return 'Açık';
      case 'dark':
        return 'Koyu';
      case 'system':
        return `Sistem (${effectiveIsDark ? 'Koyu' : 'Açık'})`;
      case 'weather':
        return 'Hava Durumu';
    }
  };

  const themeOptions: { mode: ThemeMode; label: string; icon: string }[] = [
    { mode: 'light', label: 'Açık', icon: 'white-balance-sunny' },
    { mode: 'dark', label: 'Koyu', icon: 'moon-waning-crescent' },
    { mode: 'system', label: 'Sistem', icon: 'cog' },
    { mode: 'weather', label: 'Hava Durumu', icon: 'cloud' },
  ];

  return (
    <ScrollView style={[appStyles.settingsContainer, { backgroundColor: theme.background }]}>
      <Text style={[appStyles.placeholderText, { color: theme.text }]}>{HEADER_TEXT.settings}</Text>
      <Text style={[appStyles.placeholderSub, { color: theme.textSecondary, marginBottom: 32 }]}>
        Tercihlerinizi yönetin
      </Text>
      <View style={[appStyles.settingItem, { borderBottomColor: theme.surface }]}>
        <View style={appStyles.settingLeft}>
          <MaterialCommunityIcons
            name={effectiveIsDark ? 'moon-waning-crescent' : 'white-balance-sunny'}
            size={24}
            color={theme.accent}
            style={{ marginRight: 12 }}
          />
          <View>
            <Text style={[appStyles.settingLabel, { color: theme.text }]}>Tema Modu</Text>
            <Text style={[appStyles.settingDesc, { color: theme.textSecondary }]}>
              {getModeDescription(themeMode)}
            </Text>
          </View>
        </View>
      </View>
      <View style={{ paddingHorizontal: 16, paddingVertical: 16 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {themeOptions.map((option) => (
            <TouchableOpacity
              key={option.mode}
              style={[
                {
                  flex: 0.47,
                  borderRadius: 8,
                  padding: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor:
                    themeMode === option.mode ? theme.accent : theme.surface,
                  borderWidth: themeMode === option.mode ? 2 : 1,
                  borderColor: themeMode === option.mode ? theme.accent : theme.accentDim,
                },
              ]}
              onPress={() => onThemeModeChange(option.mode)}
            >
              <MaterialCommunityIcons
                name={option.icon as any}
                size={24}
                color={themeMode === option.mode ? '#fff' : theme.accent}
                style={{ marginBottom: 4 }}
              />
              <Text
                style={{
                  color: themeMode === option.mode ? '#fff' : theme.text,
                  fontSize: 12,
                  fontWeight: '600',
                }}
              >
                {option.label}
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
