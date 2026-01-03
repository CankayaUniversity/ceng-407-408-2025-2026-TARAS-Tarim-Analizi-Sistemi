import { Theme } from "../../types";

export interface TimetableScreenProps {
  theme: Theme;
  isActive?: boolean;
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
}

export interface SensorReading {
  sensor_node_id: string;
  sensor_type: string;
  value: number;
  unit: string;
  timestamp: string;
}
