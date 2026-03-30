import { Theme } from "../../types";

export type ThemeMode = 'light' | 'dark' | 'system' | 'weather';

export interface SettingsScreenProps {
  theme: Theme;
  isDark: boolean;
  themeMode: ThemeMode;
  onThemeModeChange: (mode: ThemeMode) => void;
  onLogout: () => void;
  onHardwareSetup: () => void;
}

export interface ThemeOption {
  mode: ThemeMode;
  label: string;
  icon: string;
}
