// Tema sistemi - acik/koyu mod renkleri
// getTheme(isDark) ile tema objesi alinir

import { Theme } from "../types";

export type { Theme };

export const getTheme = (isDark: boolean): Theme => ({
  isDark,
  background: isDark ? "#0e1215" : "#f0f0f5",
  surface: isDark ? "#15191e" : "#e0e0eb",
  text: isDark ? "#f0f2f5" : "#0e0e15",
  textSecondary: isDark ? "#a4b1c1" : "#536379",
  accent: "#677c98",
  accentDim: isDark ? "#8696ac" : "#536379",
});
