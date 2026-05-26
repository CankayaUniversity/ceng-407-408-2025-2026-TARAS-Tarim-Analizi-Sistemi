// Centralized label mapping helpers.
// Maps backend enum/string values to user-facing translated labels
// using the existing StringDictionary from strings.ts.

import type { StringDictionary } from "./strings";

type IrrigationStrings = StringDictionary["irrigation"];

const URGENCY_KEY_MAP: Record<string, keyof IrrigationStrings> = {
  low: "urgencyLow",
  medium: "urgencyMedium",
  high: "urgencyHigh",
  critical: "urgencyCritical",
};

/**
 * Map a backend urgency_level value to a translated label.
 * Returns the translated string or the raw value as fallback.
 */
export const getUrgencyLabel = (
  urgency: string | null | undefined,
  irrigationStrings: IrrigationStrings,
): string => {
  if (!urgency) return "—";
  const key = URGENCY_KEY_MAP[urgency];
  return key ? (irrigationStrings[key] as string) : urgency;
};

/**
 * Return a semantic color token name for a given urgency level.
 * Consumer maps this to actual theme color (e.g. theme[color]).
 */
export const getUrgencyColor = (
  urgency: string | null | undefined,
): "danger" | "warning" | "success" => {
  switch (urgency) {
    case "critical":
    case "high":
      return "danger";
    case "medium":
      return "warning";
    case "low":
    default:
      return "success";
  }
};
