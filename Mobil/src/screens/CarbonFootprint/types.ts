import { Theme } from "../../utils/theme";

export interface CarbonFootprintScreenProps {
  theme: Theme;
  isActive?: boolean;
}

export interface ActivityType {
  activity_type_id: number;
  name: string;
  unit: string;
}

export interface CarbonLog {
  carbon_log_id: string;
  farm_id: string;
  activity_type_id: number;
  activity_date: string;
  activity_amount: number;
  emission_amount: number;
  notes: string | null;
  created_at: string;
  activity_type: {
    name: string;
    category: string;
    unit: string;
  };
}

export interface CarbonSummary {
  total_emission: number;
  by_category: Array<{
    category: string;
    total: number;
    count: number;
  }>;
}

export type CategoryKey = "YAKIT" | "GUBRE" | "ELEKTRIK";
