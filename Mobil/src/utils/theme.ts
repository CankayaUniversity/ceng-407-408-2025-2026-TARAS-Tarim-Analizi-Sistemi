// Theme system — imports from colors.ts (single source of truth).
// Change a hex in colors.ts → updates both Tailwind classes and this JS object.

import { light, dark } from '../styles/colors';

export type Theme = typeof light & { isDark: boolean };

export const getTheme = (isDark: boolean): Theme => ({
  ...(isDark ? dark : light),
  isDark,
});

