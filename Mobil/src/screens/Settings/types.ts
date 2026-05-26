import { Theme } from "../../types";
import type { FarmInfo } from "../../context/DashboardContext";

export type ThemeMode = 'light' | 'dark' | 'system';

export interface SettingsScreenProps {
  theme: Theme;
  isDark: boolean;
  themeMode: ThemeMode;
  onThemeModeChange: (mode: ThemeMode) => void;
  onLogout: () => void;
  onHardwareSetup: () => void;
  // Account
  username: string;
  email: string | null;
  role: string | null;
  // Farm
  farms: FarmInfo[];
  selectedFarmId: string | null;
  onSelectFarm: (farmId: string) => void;
  fields: Array<{ id: string; name: string; farm_id?: string }>;
  hasFarms: boolean;
  onCreateFarm: () => void;
  onDeleteFarm: (farmId: string) => Promise<void>;
  onDeleteField: (fieldId: string) => Promise<void>;
  onProfileUpdated: (username: string, email: string) => void;
}

export interface ThemeOption {
  mode: ThemeMode;
  label: string;
  icon: string;
}
