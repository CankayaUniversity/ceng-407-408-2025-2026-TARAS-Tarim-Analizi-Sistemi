// Sabitler - ekran tipleri, navigasyon ogeleri, basliklar
// SCREEN_TYPE, NAV_ITEMS, HEADER_TEXT, SCREEN_TO_INDEX

export const SCREEN_TYPE = {
  LOGIN: "login",
  CARBON: "carbon",
  TIMETABLE: "timetable",
  HOME: "home",
  DISEASE: "disease",
  SETTINGS: "settings",
} as const;

export type ScreenType = (typeof SCREEN_TYPE)[keyof typeof SCREEN_TYPE];

export const NAV_ITEMS = [
  { id: "carbon", icon: "calculator" },
  { id: "timetable", icon: "calendar-month" },
  { id: "home", icon: "home" },
  { id: "disease", icon: "leaf" },
  { id: "settings", icon: "cog" },
] as const;

export const HEADER_TEXT: Record<Exclude<ScreenType, "login">, string> = {
  carbon: "Karbon Ayak İzi",
  timetable: "Çizelge",
  home: "TarasMobil",
  disease: "Hastalık Tespiti",
  settings: "Ayarlar",
};

export const SCREEN_TO_INDEX: Record<Exclude<ScreenType, "login">, number> = {
  carbon: 0,
  timetable: 1,
  home: 2,
  disease: 3,
  settings: 4,
};
