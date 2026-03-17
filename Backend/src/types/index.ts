export interface SensorCoordinates {
  x: number;
  y: number;
  z: number;
}

export interface SensorReading {
  value: number;
  type: ReadingType;
  unit: string;
  timestamp: Date;
  quality?: number;
  metadata?: Record<string, unknown>;
}

export type ReadingType =
  | 'MOISTURE'
  | 'TEMPERATURE'
  | 'PH'
  | 'NITROGEN'
  | 'PHOSPHORUS'
  | 'POTASSIUM'
  | 'HUMIDITY'
  | 'LIGHT_INTENSITY';

export type SensorType =
  | 'SOIL_MOISTURE'
  | 'TEMPERATURE'
  | 'PH'
  | 'NPK'
  | 'HUMIDITY'
  | 'LIGHT'
  | 'MULTI_SENSOR';

export type SensorStatus = 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE' | 'ERROR';

export interface MQTTSensorPayload {
  value: number;
  type: string;
  unit?: string;
  timestamp?: string;
  batteryLevel?: number;
  metadata?: Record<string, unknown>;
}

export interface SensorUpdateEvent {
  readingId: string;
  sensorNodeId: string;
  fieldId: string;
  macAddress: string;
  value: number;
  type: ReadingType;
  unit: string;
  timestamp: Date;
}

export interface SubscriptionData {
  farmId?: string;
  fieldId?: string;
}

export interface AIPredictionRequest {
  sensorData: SensorReading[];
  fieldId: string;
  predictionType: 'irrigation' | 'fertilizer' | 'disease' | 'harvest';
}

export interface AIPredictionResponse {
  predictionType: string;
  recommendation: string;
  confidence: number;
  data: Record<string, unknown>;
  timestamp: Date;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  phone?: string;
}

export interface ReadingQueryParams {
  sensorNodeId?: string;
  fieldId?: string;
  type?: ReadingType;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  page?: number;
}

export interface SensorNodeQueryParams {
  fieldId?: string;
  status?: SensorStatus;
  type?: SensorType;
}

export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface AlertData {
  title: string;
  message: string;
  severity: AlertSeverity;
  type: string;
  metadata?: Record<string, unknown>;
}

// Dashboard Types
export interface PolygonData {
  exterior: [number, number][];
  holes: [number, number][][];
}

export interface FieldListItem {
  id: string;
  name: string;
  area: number;
}

export interface DashboardWeather {
  airTemperature: number;
  airHumidity: number;
}

export interface DashboardIrrigation {
  nextIrrigationTime: string | null;
  isScheduled: boolean;
}

export interface DashboardSensors {
  soilMoisture: number;
  nodeCount: number;
  lastReadingTime: string | null;
}


export interface DashboardNode {
  id: string;
  x: number;
  z: number;
  moisture: number;
  airTemperature: number;
  airHumidity: number;
}

export interface DashboardFieldData {
  polygon: PolygonData;
  nodes: DashboardNode[];
}

export interface DashboardResponse {
  weather: DashboardWeather;
  irrigation: DashboardIrrigation;
  sensors: DashboardSensors;
  field: DashboardFieldData;
}
