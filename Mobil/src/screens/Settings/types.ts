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
  selectedFieldId: string | null;
  onSelectField: (fieldId: string) => void;
  hasFarms: boolean;
  // Secili ciftligi DIREKT sahipleniyor muyum — yapisal/yonetsel affordance'lar (field/hardware
  // olustur-sil, davet paylas) bununla gizlenir. Operasyonel haklar (sulama/karbon) Settings'te yok.
  canManageSelectedFarm: boolean;
  onCreateFarm: () => void;
  onCreateField: () => void;
  onDeleteFarm: (farmId: string) => Promise<void>;
  onDeleteField: (fieldId: string) => Promise<void>;
  // Secili ciftligin uyelerini gor (herkes) / davet kodlarini paylas (yalnizca sahip)
  onManageMembers: () => void;
  onShareInvites: () => void;
  onProfileUpdated: (username: string, email: string) => void;
  // Kilitli canli demo: profil duzenleme + ciftlik/tarla olustur-sil gizlenir
  // (paylasilan demo hesabi korunur). Cikis ve goruntuleme acik kalir.
  readOnly?: boolean;
}

export interface ThemeOption {
  mode: ThemeMode;
  label: string;
  icon: string;
}
