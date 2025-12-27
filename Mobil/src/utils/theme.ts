import { Theme } from '../types';

export const getTheme = (isDark: boolean): Theme => ({
  isDark,
  background: isDark ? '#0f172a' : '#ffffff',
  surface: isDark ? '#1e293b' : '#f8fafc',
  text: isDark ? '#f1f5f9' : '#0f172a',
  textSecondary: isDark ? '#cbd5e1' : '#64748b',
  accent: '#06b6d4',
  accentDim: isDark ? '#00d9ff' : '#0891b2',
});
