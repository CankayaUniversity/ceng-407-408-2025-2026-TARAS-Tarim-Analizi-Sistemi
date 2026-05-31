// Sensor verisi cekme hook'u — field/zone history + zone metadata join
// Cache key: fieldId + range (preset hours veya custom from/to)
// Backend zone metadata field/sensors endpointinden ayri cekilir, client'ta join edilir

import { useCallback, useEffect, useRef, useState } from "react";
import { sensorAPI, isDemoToken } from "../utils/api";
import { secureGet } from "../utils/secureStorage";
import { useLanguage } from "../context/LanguageContext";
import type {
  JoinedReading,
  NodeMeta,
  SoilMoistureThresholds,
  TimeRange,
  UseSensorDataResult,
  ZoneMeta,
} from "../screens/Timetable/types";

interface UseSensorDataArgs {
  fieldId: string | null | undefined;
  range: TimeRange;
  enabled?: boolean;
}

interface FetchResult {
  fieldName: string;
  readings: JoinedReading[];
  nodes: NodeMeta[];
  zones: ZoneMeta[];
  dataSource: "aws" | "demo";
  // Per-zone irrigation esikleri (zoneId -> { min critical, max saturation }).
  // TimetableScreen tek zone seciliyse o zone'un degerlerini SM grafigine pass eder; aksi durumda null.
  soilThresholdsByZone: Map<string, SoilMoistureThresholds>;
}

const EMPTY: FetchResult = {
  fieldName: "",
  readings: [],
  nodes: [],
  zones: [],
  dataSource: "demo",
  soilThresholdsByZone: new Map(),
};

// Range -> hours sayisi (custom range icin from/to araligini saatte donustur)
function rangeToHours(range: TimeRange): number {
  if (range.preset) return range.preset;
  if (range.from && range.to) {
    const diff = range.to.getTime() - range.from.getTime();
    return Math.max(1, Math.ceil(diff / (60 * 60 * 1000)));
  }
  return 24;
}

function rangeCacheKey(fieldId: string | null | undefined, range: TimeRange): string {
  const f = fieldId ?? "none";
  if (range.preset) return `${f}_p${range.preset}`;
  return `${f}_c${range.from?.getTime() ?? 0}_${range.to?.getTime() ?? 0}`;
}

export function useSensorData({
  fieldId,
  range,
  enabled = true,
}: UseSensorDataArgs): UseSensorDataResult {
  const { t } = useLanguage();
  const [state, setState] = useState<FetchResult>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Mevcut fetch'i iptal edebilmek + ayni anahtara tekrar fetch atlamak icin
  const cancelRef = useRef({ current: false });
  const lastKeyRef = useRef<string | null>(null);

  const runFetch = useCallback(
    async (isRefresh: boolean) => {
      cancelRef.current = { current: false };
      const myCancel = cancelRef.current;

      if (!isRefresh) setLoading(true);
      setError(null);

      try {
        const token = await secureGet("auth_token");
        const isDemoMode = !token || isDemoToken(token);

        if (!fieldId) {
          if (!myCancel.current) {
            setError(t.timetable.noFieldSelected);
            setLoading(false);
            setRefreshing(false);
          }
          return;
        }

        const hours = rangeToHours(range);

        // Custom takvim araligi (preset YOK + from/to var) -> backend'e ISO startDate/endDate
        // gonder ki dogru gecmis pencereyi ceksin (yoksa rolling now-hours yanlis/bos doner).
        const customDates =
          !range.preset && range.from && range.to
            ? {
                startDate: range.from.toISOString(),
                endDate: range.to.toISOString(),
              }
            : undefined;

        // History + zones paralel cek
        const [historyRes, zonesRes] = await Promise.all([
          sensorAPI.getFieldHistory(fieldId, hours, customDates),
          sensorAPI.getUserZones(),
        ]);

        if (myCancel.current) return;

        if (!historyRes.success || !historyRes.data) {
          setError(historyRes.error || t.timetable.loadFailed);
          setLoading(false);
          setRefreshing(false);
          return;
        }

        const { readings: rawReadings, field_name } = historyRes.data;
        const zonesList = zonesRes.success && zonesRes.data ? zonesRes.data.zones : [];

        // Node -> zone meta map (sadece bu field'in zone'lari)
        const nodeToZone = new Map<string, { zone_id: string; zone_name: string; field_id: string }>();
        const zonesMetaMap = new Map<string, ZoneMeta>();
        for (const z of zonesList) {
          if (fieldId !== z.field_id) continue;
          const nodeIds: string[] = [];
          for (const s of (z as any).sensors ?? []) {
            const nid = s.node_id;
            if (!nid) continue;
            nodeToZone.set(nid, {
              zone_id: z.zone_id,
              zone_name: z.zone_name,
              field_id: z.field_id,
            });
            nodeIds.push(nid);
          }
          zonesMetaMap.set(z.zone_id, {
            zone_id: z.zone_id,
            zone_name: z.zone_name,
            field_id: z.field_id,
            field_name: z.field_name,
            node_ids: nodeIds,
          });
        }

        // Demo zone meta yoksa readings'ten cikar (her node_id kendi zone'unda sayar)
        const fallbackZones = new Map<string, ZoneMeta>();
        if (isDemoMode && zonesMetaMap.size === 0) {
          const demoZoneId = `demo-zone-${fieldId}`;
          const demoNodes = Array.from(new Set(rawReadings.map((r) => r.node_id)));
          fallbackZones.set(demoZoneId, {
            zone_id: demoZoneId,
            zone_name: "Demo Bölge",
            field_id: fieldId,
            field_name: field_name || "Demo",
            node_ids: demoNodes,
          });
          for (const nid of demoNodes) {
            nodeToZone.set(nid, {
              zone_id: demoZoneId,
              zone_name: "Demo Bölge",
              field_id: fieldId,
            });
          }
        }

        const effectiveZones = zonesMetaMap.size > 0 ? zonesMetaMap : fallbackZones;

        // Readings sortla + zone meta join
        const joined: JoinedReading[] = [...rawReadings]
          .filter((r) => r.created_at && !isNaN(new Date(r.created_at).getTime()))
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
          .map((r) => {
            const meta = nodeToZone.get(r.node_id);
            return {
              ...r,
              zone_id: meta?.zone_id,
              zone_name: meta?.zone_name,
            };
          });

        // Node metalari readings'te gozuken node id'lerden cikar
        const nodeMetaMap = new Map<string, NodeMeta>();
        for (const r of joined) {
          if (!nodeMetaMap.has(r.node_id)) {
            const meta = nodeToZone.get(r.node_id);
            nodeMetaMap.set(r.node_id, {
              node_id: r.node_id,
              zone_id: meta?.zone_id,
              zone_name: meta?.zone_name,
              field_id: meta?.field_id ?? fieldId,
            });
          }
        }

        // Bu field'in zone'lari icin sulama esikleri (critical/target sm_percent), per-zone.
        // Backend /sensors/zones bu degerleri vermedigi icin per-zone details paralel cekiyoruz.
        // Demo'da target=60 / critical=30 default.
        // 2026-05-20: aggregated yerine per-zone map donduruyoruz; bands sadece tek zone seciliyse gosteriliyor.
        const zoneIds = Array.from(effectiveZones.keys());
        const soilThresholdsByZone = new Map<string, SoilMoistureThresholds>();
        if (zoneIds.length > 0) {
          try {
            const detailsList = await Promise.all(
              zoneIds.map((zid) => sensorAPI.getZoneDetails(zid).catch(() => null)),
            );
            if (myCancel.current) return;
            detailsList.forEach((d, idx) => {
              if (!d || !d.success || !d.data) return;
              const cfg = d.data.adaptive_config;
              if (!cfg) return;
              const criticalRaw = cfg.critical_sm_percent;
              const targetRaw = cfg.target_sm_percent;
              const critical =
                criticalRaw != null && isFinite(criticalRaw) ? criticalRaw : 30;
              const target =
                targetRaw != null && isFinite(targetRaw) ? targetRaw : 60;
              // Upper bound = target + (target - critical), [target+5..100] arasinda
              const derivedMax = Math.min(100, 2 * target - critical);
              const max = Math.max(target + 5, derivedMax);
              const zoneId = zoneIds[idx];
              if (zoneId) {
                soilThresholdsByZone.set(zoneId, {
                  min: Math.max(0, Math.min(100, critical)),
                  max: Math.max(0, Math.min(100, max)),
                });
              }
            });
          } catch {
            // sessizce yut — esik gostermesi zorunlu degil
          }
        }

        if (myCancel.current) return;

        setState({
          fieldName: field_name || "",
          readings: joined,
          nodes: Array.from(nodeMetaMap.values()),
          zones: Array.from(effectiveZones.values()),
          dataSource: isDemoMode ? "demo" : "aws",
          soilThresholdsByZone,
        });
        setLastUpdated(new Date());
        setLoading(false);
        setRefreshing(false);
      } catch (e) {
        if (myCancel.current) return;
        console.log("[TIMETABLE] err:", e instanceof Error ? e.message : "unknown");
        setError(
          t.timetable.connectionError +
            (e instanceof Error ? e.message : t.timetable.unknownError),
        );
        setLoading(false);
        setRefreshing(false);
      }
    },
    [fieldId, range.preset, range.from, range.to, t],
  );

  // Ana effect — fieldId / range degisince fetch
  useEffect(() => {
    if (!enabled) return;
    const key = rangeCacheKey(fieldId, range);
    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;

    void runFetch(false);

    return () => {
      cancelRef.current.current = true;
    };
  }, [enabled, fieldId, range.preset, range.from, range.to, runFetch]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    lastKeyRef.current = null; // cache invalidate
    void runFetch(true);
  }, [runFetch]);

  return {
    readings: state.readings,
    nodes: state.nodes,
    zones: state.zones,
    fieldName: state.fieldName,
    dataSource: state.dataSource,
    loading,
    refreshing,
    error,
    lastUpdated,
    refresh,
    soilThresholdsByZone: state.soilThresholdsByZone,
  };
}
