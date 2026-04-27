import { Theme } from "../../utils/theme";
import { DashboardData, FieldSummary } from "../../utils/api";

/**
 * Subset of IrrigationJob fields the home-screen card needs to display.
 * Sourced from: GET /api/irrigation/zone/:zoneId/jobs
 * Map the PENDING job with should_irrigate=true into this shape.
 */
export interface IrrigationSuggestion {
  job_id: string;
  status: string;
  reasoning: string | null;
  water_amount_ml: number | null;
  start_time: string | null;
  urgency_level: "low" | "medium" | "high" | null;
}

/**
 * Display model for the FeaturedZoneCard.
 * Aggregates zone sensor data + the optional pending suggestion.
 */
export interface ZoneCardData {
  zoneName: string;
  currentMoisture: number | null;
  /** ISO string of the most recently EXECUTED job's actual_start_time or start_time */
  lastIrrigationTime: string | null;
  pendingSuggestion: IrrigationSuggestion | null;
}

/**
 * Payload sent to the backend when the user confirms actual irrigation.
 * Endpoint: PATCH /api/irrigation/jobs/:jobId/actual
 * Fields:
 *   actual_water_amount_ml — either the suggested value (Yes path) or user-entered (No path)
 *   actual_start_time      — either the suggested start_time (Yes path) or user-entered (No path)
 */
export interface ActualIrrigationPayload {
  actual_water_amount_ml: number;
  actual_start_time: string;
}

export interface HomeScreenProps {
  theme: Theme;
  isDark: boolean;
  dashboardData: DashboardData | null;
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
