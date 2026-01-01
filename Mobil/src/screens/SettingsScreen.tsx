import { View, Text, TouchableOpacity, ScrollView, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const buttonWidth = Math.max((width - 48) / 4 - 6, 50); // Responsive button width
  
  return (
    <ScrollView style={[appStyles.settingsContainer, { backgroundColor: theme.background, paddingTop: Math.max(insets.top, 16) }]}>
      <Text style={[appStyles.placeholderText, { color: theme.text }]}>{HEADER_TEXT.settings}</Text>
      <View style={[appStyles.settingItem, { borderBottomColor: theme.surface, flexDirection: 'column', alignItems: 'stretch' }]}>
        <View style={[appStyles.settingLeft, { marginBottom: 12 }]}>
          <MaterialCommunityIcons
            name={isDark ? 'moon-waning-crescent' : 'white-balance-sunny'}
            size={20}
            color={theme.accent}
            style={{ marginRight: 12 }}
          />
          <Text style={[appStyles.settingLabel, { color: theme.text }]}>Tema Modu</Text>
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 4,
          }}
        >
          {THEME_OPTIONS.map((opt) => (
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
                color={themeMode === opt.mode ? '#fff' : theme.accent}
                style={{ marginBottom: 2 }}
              />
              <Text style={{ color: themeMode === opt.mode ? '#fff' : theme.text, fontSize: 9, fontWeight: '600', textAlign: 'center' }}>
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
