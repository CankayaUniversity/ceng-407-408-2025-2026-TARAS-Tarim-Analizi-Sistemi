import { View, Text, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { appStyles } from '../styles';
import { HEADER_TEXT } from '../constants';

interface SettingsScreenProps {
  theme: any;
  effectiveIsDark: boolean;
  overrideDarkMode: boolean | null;
  onDarkModeChange: (isDark: boolean | null) => void;
  onLogout: () => void;
}

export const SettingsScreen = ({
  theme,
  effectiveIsDark,
  overrideDarkMode,
  onDarkModeChange,
  onLogout,
}: SettingsScreenProps) => {
  return (
    <View style={[appStyles.settingsContainer, { backgroundColor: theme.background }]}>
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
            <Text style={[appStyles.settingLabel, { color: theme.text }]}>Koyu Mod</Text>
            <Text style={[appStyles.settingDesc, { color: theme.textSecondary }]}>
              {overrideDarkMode !== null
                ? (overrideDarkMode ? 'Açık' : 'Kapalı')
                : 'Sistem'}
            </Text>
          </View>
        </View>
        <View style={appStyles.themeButtons}>
          <TouchableOpacity
            style={[appStyles.themeButton, overrideDarkMode === false && { backgroundColor: theme.accent }]}
            onPress={() => onDarkModeChange(false)}
          >
            <Text style={[appStyles.themeButtonText, { color: overrideDarkMode === false ? '#fff' : theme.text }]}>
              Açık
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[appStyles.themeButton, overrideDarkMode === true && { backgroundColor: theme.accent }]}
            onPress={() => onDarkModeChange(true)}
          >
            <Text style={[appStyles.themeButtonText, { color: overrideDarkMode === true ? '#fff' : theme.text }]}>
              Koyu
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      <TouchableOpacity
        style={[appStyles.logoutButton, { backgroundColor: '#ef4444' }]}
        onPress={onLogout}
      >
        <MaterialCommunityIcons name="logout" size={20} color="#fff" style={{ marginRight: 8 }} />
        <Text style={appStyles.logoutButtonText}>Çıkış Yap</Text>
      </TouchableOpacity>
    </View>
  );
};
