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

// Sensor okumalarina client-side eklenmis zone metadata
export interface JoinedReading extends SensorReading {
  zone_id?: string;
  zone_name?: string;
}

// Olcum tipi — yeni grafik mimarisinde 1 metrik = 1 grafik kart
// ET0 (et0_instant) intentionally dropped from selectable metrics — kullanici talebi 2026-05-20.
// JoinedReading hala et0_instant alanini icerir (CSV export bunu kullaniyor) ama UI'da gozukmez.
export type MetricKey =
  | "temperature"
  | "humidity"
  | "sm_percent";

export interface MetricDef {
  key: MetricKey;
  label: string;
  unit: string;
  icon: string;
  decimals: number;
}

// Filtre / mod
export type AggregationMode = "per_node" | "per_zone_avg" | "field_avg";

// Zaman araligi ya bir hours preset ya da custom from/to
export interface TimeRange {
  preset?: number; // hours
  from?: Date;
  to?: Date;
  label: string;
}

export interface NodeMeta {
  node_id: string;
  zone_id?: string;
  zone_name?: string;
  field_id?: string;
}

export interface ZoneMeta {
  zone_id: string;
  zone_name: string;
  field_id: string;
  field_name: string;
  node_ids: string[];
}

// Grafik icin serilesmis tek seri (cizgi)
export interface ChartSeries {
  id: string; // node_id veya zone_id
  label: string;
  color: string;
  points: { ts: number; value: number }[];
}

// Field-genelinde toplanmis sulama esikleri (% cinsinden soil moisture)
// min = kritik kuruluk (irrigation tetikleyici), max = saturasyon ust limiti
export interface SoilMoistureThresholds {
  min: number;
  max: number;
}

// useSensorData hook return
export interface UseSensorDataResult {
  readings: JoinedReading[];
  nodes: NodeMeta[];
  zones: ZoneMeta[];
  fieldName: string;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  dataSource: "aws" | "demo";
  lastUpdated: Date | null;
  refresh: () => void;
  // Per-zone sulama esikleri (zoneId -> { min critical, max saturation }).
  // TimetableScreen tek zone seciliyse o zone'un degerlerini SM grafigine pass eder.
  soilThresholdsByZone: Map<string, SoilMoistureThresholds>;
}
