import { Theme } from "../../types";

export interface TimetableScreenProps {
  theme: Theme;
  isActive?: boolean;
  selectedFieldId?: string | null;
}

export interface ChartDataPoint {
  value: number;
  label?: string;
  ts?: string; // ISO timestamp for the aggregated point
}

export interface ChartCardProps {
  theme: Theme;
  title: string;
  icon: string;
  color: string;
  data: ChartDataPoint[];
  onTouchStart?: () => void;
  onTouchEnd?: () => void;
}

export interface SensorReading {
  id: string;
  node_id: string;
  created_at: string;
  temperature: number | null;
  humidity: number | null;
  sm_percent: number | null;
  raw_sm_value: number | null;
  et0_instant: number | null;
}
