// Tema sistemi - acik/koyu mod renkleri
// getTheme(isDark) ile tema objesi alinir
// tw alani nativewind class isimleri icerir (tailwind.config.js ile eslesmeli)

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
  tw: {
    background: isDark ? "bg-onyx-950" : "bg-platinum-50",
    surface: isDark ? "bg-slate-grey-900" : "bg-platinum-100",
    text: isDark ? "text-slate-grey-50" : "text-platinum-950",
    textSecondary: isDark ? "text-slate-grey-300" : "text-slate-grey-600",
    accent: "text-slate-grey-500",
    accentBg: "bg-slate-grey-500",
    accentDim: isDark ? "text-slate-grey-400" : "text-slate-grey-600",
    accentDimBg: isDark ? "bg-slate-grey-400" : "bg-slate-grey-600",
  },
});
