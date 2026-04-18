// Tema context — themeMode state, persistlemek, NativeWind senkronu, OS-flip takibi
// Tum ekranlar theme/isDark/themeMode'u buradan okur

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useColorScheme as useSystemColorScheme } from "react-native";
import * as SystemUI from "expo-system-ui";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colorScheme as nativeWindScheme } from "react-native-css-interop/dist/runtime/native/appearance-observables";
import { getTheme, Theme } from "../utils/theme";
import { ThemeMode } from "../screens/Settings/types";

interface ThemeContextValue {
  theme: Theme;
  isDark: boolean;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "@taras_theme_mode";

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const systemColorScheme = useSystemColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>("system");

  // Kayitli themeMode'u yukle + NativeWind'i senkron et
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        const mode: ThemeMode =
          stored === "light" || stored === "dark" || stored === "system"
            ? stored
            : "system";
        // colorScheme.set() calls Appearance.setColorScheme() natively, so the
        // choice survives app resume (css-interop reads it back via
        // appearance.getColorScheme() in its own AppState listener).
        nativeWindScheme.set(mode);
        if (mode !== "system") {
          setThemeModeState(mode);
        }
      } catch {
        nativeWindScheme.set("system");
      }
    })();
  }, []);

  const setThemeMode = (mode: ThemeMode) => {
    // "dark"/"light" → Appearance.setColorScheme(mode) persists across resume.
    // "system"       → Appearance.setColorScheme(null) restores OS control.
    nativeWindScheme.set(mode);
    setThemeModeState(mode);
    AsyncStorage.setItem(STORAGE_KEY, mode).catch(() => {});
  };

  // system modundayken OS temasi degisirse React-side isDark'i guncelle.
  // NativeWind tarafini css-interop kendi AppState/Appearance listener'lari ile
  // otomatik olarak yonetiyor (colorScheme.set("system") cagrisi yapildi).

  const isDark =
    themeMode === "dark" ||
    (themeMode === "system" && systemColorScheme === "dark");

  const theme = useMemo(() => getTheme(isDark), [isDark]);

  // Sistem arka plan rengini tema ile esle
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.background);
  }, [theme.background]);

  const value = useMemo(
    () => ({ theme, isDark, themeMode, setThemeMode }),
    [theme, isDark, themeMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): ThemeContextValue => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
};
