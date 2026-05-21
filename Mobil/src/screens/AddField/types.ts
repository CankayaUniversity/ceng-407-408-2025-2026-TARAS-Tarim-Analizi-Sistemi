// Tarla ekleme akisi tipleri — sera ve saksi alani icin wizard state
// Backend entegrasyonunda ayni tipler API payload'a donusturulecek

import type { Theme } from "../../utils/theme";

export type FieldType = "greenhouse" | "pot";

export type ZoneType = "POLYGON" | "POT";

export interface ZoneDraft {
  id: string;
  name: string;
  zoneType: ZoneType;
  polygonPoints: [number, number][];
  potIndex?: number;
}

export interface WizardState {
  fieldType: FieldType | null;
  fieldName: string;
  cropName: string;
  outerPolygon: [number, number][];
  zones: ZoneDraft[];
  potCount: number;
}

export type WizardStep =
  | "fieldType"
  | "fieldInfo"
  | "greenhousePolygon"
  | "greenhouseZones"
  | "potCount"
  | "preview";

export const INITIAL_WIZARD_STATE: WizardState = {
  fieldType: null,
  fieldName: "",
  cropName: "",
  outerPolygon: [],
  zones: [],
  potCount: 0,
};

// Step bilesenlerinin ortak prop'lari
export interface StepProps {
  theme: Theme;
  state: WizardState;
  onUpdate: (partial: Partial<WizardState>) => void;
  onNext: () => void;
  onBack: () => void;
}
