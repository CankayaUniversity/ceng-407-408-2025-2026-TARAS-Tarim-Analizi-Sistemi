export const SCREEN_TYPE = {
  LOGIN: 'login',
  HOME: 'home',
  DISEASE: 'disease',
  TIMETABLE: 'timetable',
  SETTINGS: 'settings',
} as const;

export type ScreenType = typeof SCREEN_TYPE[keyof typeof SCREEN_TYPE];

export const NAV_ITEMS = [
  { id: 'timetable', label: 'Çizelge', icon: 'calendar-month' },
  { id: 'home', label: 'Ana Sayfa', icon: 'home' },
  { id: 'disease', label: 'Hastalık', icon: 'flask' },
  { id: 'settings', label: 'Ayarlar', icon: 'cog' },
] as const;

export const HEADER_TEXT: Record<Exclude<ScreenType, 'login'>, string> = {
  home: 'TarasMobil',
  disease: 'Hastalık Tespiti',
  timetable: 'Çizelge',
  settings: 'Ayarlar',
};
