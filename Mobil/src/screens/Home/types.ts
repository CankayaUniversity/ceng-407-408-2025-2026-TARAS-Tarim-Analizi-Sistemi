import { Theme } from "../../utils/theme";
import { DashboardData, FieldSummary } from "../../utils/api";

export interface HomeScreenProps {
  theme: Theme;
  isDark: boolean;
  windowHeight?: number;
  isActive?: boolean;
}

export interface MetricCardProps {
  title: string;
  value: string | null | React.ReactNode;
  unit?: string;
  icon: React.ReactNode;
  theme: Theme;
  loading: boolean;
}

export interface StatusCardProps {
  theme: Theme;
  dashboardData: DashboardData | null;
  loading: boolean;
}

export interface FieldSelectorProps {
  theme: Theme;
  fields: FieldSummary[];
  selectedFieldId: string | null;
  onSelectField: (fieldId: string) => void;
}

export interface NodePopupProps {
  theme: Theme;
  selectedNode: {
    id: string;
    moisture: number;
    airTemperature: number;
    airHumidity: number;
  } | null;
  fadeAnim: any;
  onClose: () => void;
}

export interface CameraConfig {
  position: [number, number, number];
  fov: number;
}
