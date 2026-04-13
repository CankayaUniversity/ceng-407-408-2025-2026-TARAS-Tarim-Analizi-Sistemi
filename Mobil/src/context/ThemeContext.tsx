// Tema context — themeMode state, persistlemek, NativeWind senkronu, OS-flip takibi
// Tum ekranlar theme/isDark/themeMode'u buradan okur

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useColorScheme as useSystemColorScheme, Appearance } from "react-native";
import * as SystemUI from "expo-system-ui";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { systemColorScheme as nativeWindSystemScheme } from "react-native-css-interop/dist/runtime/native/appearance-observables";
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

const resolveEffective = (
  mode: ThemeMode,
  systemScheme: "light" | "dark" | null | undefined,
): "light" | "dark" =>
  mode === "dark"
    ? "dark"
    : mode === "light"
    ? "light"
    : systemScheme === "dark"
    ? "dark"
    : "light";

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
        const osIsDark = Appearance.getColorScheme() === "dark";
        const effective = resolveEffective(mode, osIsDark ? "dark" : "light");
        nativeWindSystemScheme.set(effective);
        if (mode !== "system") {
          setThemeModeState(mode);
        }
      } catch {
        nativeWindSystemScheme.set(
          Appearance.getColorScheme() === "dark" ? "dark" : "light",
        );
      }
    })();
  }, []);

  const setThemeMode = (mode: ThemeMode) => {
    const effective = resolveEffective(
      mode,
      systemColorScheme === "dark" ? "dark" : "light",
    );
    nativeWindSystemScheme.set(effective);
    setThemeModeState(mode);
    AsyncStorage.setItem(STORAGE_KEY, mode).catch(() => {});
  };

  // system modundayken OS temasi degisirse NativeWind'i guncelle
  useEffect(() => {
    if (themeMode === "system") {
      nativeWindSystemScheme.set(systemColorScheme === "dark" ? "dark" : "light");
    }
  }, [themeMode, systemColorScheme]);

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
