import { Theme } from "../../types";

export interface TimetableScreenProps {
  theme: Theme;
  isActive?: boolean;
  selectedFieldId?: string | null;
}

export interface ChartDataPoint {
  value: number;
  label?: string;
}

export interface ChartCardProps {
  theme: Theme;
  title: string;
  icon: string;
  color: string;
  data: ChartDataPoint[];
  rawReadings?: SensorReading[];
}

export interface SensorReading {
  id: string;
  node_id: string;
  created_at: string;
  temperature: number;
  humidity: number;
  sm_percent: number;
  raw_sm_value: number;
  et0_instant: number | null;
}
