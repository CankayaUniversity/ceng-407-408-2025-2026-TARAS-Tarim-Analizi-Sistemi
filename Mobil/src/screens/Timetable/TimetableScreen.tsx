// Cizelge ekrani — coklu seri grafikleri + optimize tablo
// Ozellikler:
//   - Coklu sensor node uzerinde overlay cizgi grafikler
//   - Mod: per-node / per-zone-avg / field-avg
//   - Zaman araligi presetleri + custom range
//   - Metric multi-select
//   - LTTB downsample ile gorsel detayi koruyarak yuk azaltir
//   - Tablo: virtualized FlatList, ekrana sigan compact + tap-to-expand

import { memo, useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Share,
  Pressable,
} from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Theme } from "../../utils/theme";
import { useLanguage } from "../../context/LanguageContext";
import { useTheme } from "../../context/ThemeContext";
import { useDashboard } from "../../context/DashboardContext";
import { useSensorData } from "../../hooks/useSensorData";
import { s, vs, ms, TAB_H_PADDING } from "../../utils/responsive";
import { OptionButton } from "../../components/OptionButton";
import { OptionDropdown } from "../../components/OptionDropdown";
import { MultiSeriesChart } from "./MultiSeriesChart";
import { OptimizedSensorTable } from "./OptimizedSensorTable";
import { FilterMenu } from "./FilterMenu";
import type {
  AggregationMode,
  ChartSeries,
  JoinedReading,
  MetricKey,
  MetricDef,
  TimeRange,
} from "./types";

interface TimetableScreenProps {
  theme?: Theme;
  selectedFieldId?: string | null;
}

// Toolbar buton yuksekligi — tum quick-settings elemanlari (OptionButton, OptionDropdown, kare butonlar)
// bu yukseklikte; satirlar hizali kalsin diye tek kaynak. OptionDropdown ic TRIGGER_HEIGHT'i ile ayni (44).
const TOOLBAR_BTN_H = 44;

// Deterministik palette — node_id / zone_id'a gore renk
const PALETTE = [
  "#2D5016", // olive primary
  "#D4AF37", // gold
  "#3B82F6", // info blue
  "#EF4444", // danger red
  "#A855F7", // purple
  "#0EA5E9", // sky
  "#F97316", // orange
  "#10B981", // emerald
  "#EC4899", // pink
  "#06B6D4", // cyan
];

const hashColor = (key: string): string => {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
};

// Bir metrigin sensor okumasindan degerini cek
const getMetricValue = (r: JoinedReading, m: MetricKey): number | null => {
  switch (m) {
    case "temperature":
      return r.temperature;
    case "humidity":
      return r.humidity;
    case "sm_percent":
      return r.sm_percent;
  }
};

interface BuildSeriesArgs {
  readings: JoinedReading[];
  metric: MetricKey;
  mode: AggregationMode;
  selectedZoneIds: Set<string> | null;
  zones: { zone_id: string; zone_name: string; node_ids: string[] }[];
  language: "tr" | "en";
}

// readings + filtre/mod -> grafik serileri
function buildSeries({
  readings,
  metric,
  mode,
  selectedZoneIds,
  zones,
  language,
}: BuildSeriesArgs): ChartSeries[] {
  // Once zone filtresi uygula
  const filtered =
    selectedZoneIds === null
      ? readings
      : readings.filter((r) => r.zone_id && selectedZoneIds.has(r.zone_id));

  if (filtered.length === 0) return [];

  if (mode === "per_node") {
    // node bazinda grupla, her node bir seri
    const map = new Map<string, { ts: number; value: number }[]>();
    for (const r of filtered) {
      const v = getMetricValue(r, metric);
      if (v == null || isNaN(v)) continue;
      const arr = map.get(r.node_id) ?? [];
      arr.push({ ts: new Date(r.created_at).getTime(), value: v });
      map.set(r.node_id, arr);
    }
    const series: ChartSeries[] = [];
    for (const [nodeId, pts] of map) {
      // ts'e gore sortla
      pts.sort((a, b) => a.ts - b.ts);
      series.push({
        id: nodeId,
        label: shortLabel(nodeId, language === "tr" ? "Düğüm" : "Node"),
        color: hashColor(nodeId),
        points: pts,
      });
    }
    series.sort((a, b) => a.id.localeCompare(b.id));
    return series;
  }

  if (mode === "per_zone_avg") {
    // her zone icin readings -> ts bucketed avg
    // bucket = 5 dk
    const series: ChartSeries[] = [];
    const zoneMap = new Map<string, ChartSeries>();
    for (const z of zones) {
      zoneMap.set(z.zone_id, {
        id: z.zone_id,
        label: z.zone_name,
        color: hashColor(z.zone_id),
        points: [],
      });
    }
    // ts/zone -> array
    const buckets = new Map<string, Map<number, number[]>>();
    for (const r of filtered) {
      const v = getMetricValue(r, metric);
      if (v == null || isNaN(v) || !r.zone_id) continue;
      const bucketTs = Math.floor(new Date(r.created_at).getTime() / (5 * 60 * 1000)) * 5 * 60 * 1000;
      let zb = buckets.get(r.zone_id);
      if (!zb) {
        zb = new Map();
        buckets.set(r.zone_id, zb);
      }
      const arr = zb.get(bucketTs) ?? [];
      arr.push(v);
      zb.set(bucketTs, arr);
    }
    for (const [zoneId, zb] of buckets) {
      const ser = zoneMap.get(zoneId);
      if (!ser) continue;
      const pts = Array.from(zb.entries())
        .map(([ts, vals]) => ({
          ts,
          value: vals.reduce((sum, v) => sum + v, 0) / vals.length,
        }))
        .sort((a, b) => a.ts - b.ts);
      ser.points = pts;
      series.push(ser);
    }
    return series;
  }

  // field_avg — tek seri
  {
    const buckets = new Map<number, number[]>();
    for (const r of filtered) {
      const v = getMetricValue(r, metric);
      if (v == null || isNaN(v)) continue;
      const bucketTs = Math.floor(new Date(r.created_at).getTime() / (5 * 60 * 1000)) * 5 * 60 * 1000;
      const arr = buckets.get(bucketTs) ?? [];
      arr.push(v);
      buckets.set(bucketTs, arr);
    }
    const pts = Array.from(buckets.entries())
      .map(([ts, vals]) => ({ ts, value: vals.reduce((s, v) => s + v, 0) / vals.length }))
      .sort((a, b) => a.ts - b.ts);
    return [
      {
        id: "field-avg",
        label: language === "tr" ? "Tarla Ortalama" : "Field Avg",
        color: PALETTE[0]!,
        points: pts,
      },
    ];
  }
}

const shortLabel = (id: string, prefix: string): string => {
  if (id.length <= 6) return `${prefix} ${id}`;
  return `${prefix} ${id.slice(-5)}`;
};

// readings'i ayrica custom range'in from/to'sune gore client-side daralt
function filterByRange(readings: JoinedReading[], range: TimeRange): JoinedReading[] {
  if (range.preset || !range.from || !range.to) return readings;
  const fromTs = range.from.getTime();
  const toTs = range.to.getTime();
  return readings.filter((r) => {
    const t = new Date(r.created_at).getTime();
    return t >= fromTs && t <= toTs;
  });
}

// Asagidaki TimetableScreen export'u eskiden props ile cagriliyordu (TimetableContainer)
// Yeni implementasyonda kendi hook'larini kullaniyor, ama eski sozlesmeyi de destekler
export const TimetableScreen = memo(function TimetableScreen(_props: TimetableScreenProps = {}) {
  const { theme } = useTheme();
  const { t, language } = useLanguage();
  const { selectedFieldId } = useDashboard();

  // Metric definitions — strings.ts ile baglandi. ET0 (et0_instant) kullanici talebi ile (2026-05-20)
  // metric seciminden kaldirildi; et0_instant alani veride hala mevcut, CSV export'a giriyor ama UI'da yer almiyor.
  const metricDefs: MetricDef[] = useMemo(
    () => [
      {
        key: "temperature",
        label: t.timetable.temperatureShort,
        unit: "°C",
        icon: "thermometer",
        decimals: 1,
      },
      {
        key: "humidity",
        label: t.timetable.humidityShort,
        unit: "%",
        icon: "water-percent",
        decimals: 1,
      },
      {
        key: "sm_percent",
        label: t.timetable.soilMoistureShort,
        unit: "%",
        icon: "flower",
        decimals: 1,
      },
    ],
    [t],
  );

  const presetRanges = useMemo(
    () => [
      { hours: 6, label: t.timetable.range6h },
      { hours: 24, label: t.timetable.range24h },
      { hours: 72, label: t.timetable.range3d },
      { hours: 168, label: t.timetable.range1w },
      { hours: 720, label: t.timetable.range1m },
    ],
    [t],
  );

  // Default'lar — Reset butonu icin
  const filterDefaults = useMemo(
    () => ({
      mode: "per_node" as AggregationMode,
      range: { preset: 24, label: t.timetable.range24h } as TimeRange,
      metrics: new Set<MetricKey>(["temperature", "humidity", "sm_percent"]),
      zones: null as Set<string> | null,
    }),
    [t],
  );

  // Filtre durumu — default'lardan baslar
  const [range, setRange] = useState<TimeRange>(filterDefaults.range);
  const [mode, setMode] = useState<AggregationMode>(filterDefaults.mode);
  const [selectedZoneIds, setSelectedZoneIds] = useState<Set<string> | null>(
    filterDefaults.zones,
  );
  const [selectedMetrics, setSelectedMetrics] = useState<Set<MetricKey>>(
    () => new Set(filterDefaults.metrics),
  );
  const [filterOpen, setFilterOpen] = useState(false);
  const [view, setView] = useState<"chart" | "table">("chart");
  // Grafik scrub'i (yatay) suruyor mu — true iken ScrollView dikey kaydirma KAPALI (Android'de
  // yalniz responder kilidi yetmiyor). Yatay scrub kilidi baslayinca true, gesture bitince false.
  const [chartScrubbing, setChartScrubbing] = useState(false);

  // Hook fetch — fieldName/dataSource artik AppHeader'in FieldSelector'i ile gosteriliyor
  const {
    readings,
    zones,
    loading,
    refreshing,
    error,
    lastUpdated,
    refresh,
    soilThresholdsByZone,
  } = useSensorData({
    fieldId: selectedFieldId,
    range,
    enabled: true,
  });

  // Soil moisture bantlari — kullanici kararina gore SADECE tek zone scope'undaysa goster:
  //   - filter null + zones.length === 1 (zaten tek zone var)
  //   - filter Set.size === 1
  // Coklu zone seciliyse crop tipi/uretici/esikler farkli olabilecegi icin band gostermiyoruz.
  const soilThresholds = useMemo(() => {
    let zoneId: string | null = null;
    if (selectedZoneIds === null) {
      if (zones.length === 1 && zones[0]) zoneId = zones[0].zone_id;
    } else if (selectedZoneIds.size === 1) {
      const first = Array.from(selectedZoneIds)[0];
      zoneId = first ?? null;
    }
    return zoneId ? soilThresholdsByZone.get(zoneId) ?? null : null;
  }, [soilThresholdsByZone, selectedZoneIds, zones]);

  // Client-side range daraltma (custom from/to icin)
  const filteredReadings = useMemo(
    () => filterByRange(readings, range),
    [readings, range],
  );

  // Table view'de zone filtresi de uygulanir (chart view kendi buildSeries icinde uyguluyor zaten).
  // selectedZoneIds=null -> tum zone'lar gosterilir, aksi durumda yalnizca secili zone'lar.
  const tableReadings = useMemo(() => {
    if (selectedZoneIds === null) return filteredReadings;
    return filteredReadings.filter(
      (r) => r.zone_id && selectedZoneIds.has(r.zone_id),
    );
  }, [filteredReadings, selectedZoneIds]);

  // Stats header — secili her metrik icin avg/min/max ozet.
  // Stats SADECE seciliyse hesaplanir, gosterimde de yine secililer kullanilir.
  const tableStats = useMemo(() => {
    type Stat = { count: number; avg: number; min: number; max: number };
    const acc: Record<MetricKey, number[]> = {
      temperature: [],
      humidity: [],
      sm_percent: [],
    };
    for (const r of tableReadings) {
      for (const key of Object.keys(acc) as MetricKey[]) {
        const v = getMetricValue(r, key);
        if (v != null && !isNaN(v)) acc[key].push(v);
      }
    }
    const out: Partial<Record<MetricKey, Stat>> = {};
    for (const key of Object.keys(acc) as MetricKey[]) {
      const arr = acc[key];
      if (arr.length === 0) continue;
      let mn = arr[0]!;
      let mx = arr[0]!;
      let sum = 0;
      for (const v of arr) {
        if (v < mn) mn = v;
        if (v > mx) mx = v;
        sum += v;
      }
      out[key] = { count: arr.length, avg: sum / arr.length, min: mn, max: mx };
    }
    return out;
  }, [tableReadings]);

  // Grafik serileri — memo'lu. scrub baslat/bitir (chartScrubbing) re-render'inde yeniden
  // hesaplanmasin diye: aksi halde her seri yeni referans olur, MultiSeriesChart memo'su kirilir
  // ve scrub aninda tum grafikler yeniden cizilerek hitch olur.
  const visibleCharts = useMemo(
    () =>
      metricDefs
        .filter((m) => selectedMetrics.has(m.key))
        .map((m) => ({
          def: m,
          series: buildSeries({
            readings: filteredReadings,
            metric: m.key,
            mode,
            selectedZoneIds,
            zones,
            language: language as "tr" | "en",
          }),
          isPercent: m.unit === "%",
          thresholds: m.key === "sm_percent" && soilThresholds ? soilThresholds : null,
        })),
    [metricDefs, selectedMetrics, filteredReadings, mode, selectedZoneIds, zones, language, soilThresholds],
  );

  // CSV export — Android'de Share.share({message}) buyuk verilerde patlar veya text olarak gonderir.
  // expo-sharing.shareAsync(uri, { mimeType }) hem iOS hem Android'de gercek dosya paylasimi yapar.
  // Zone filtresi de honor edilir (tableReadings).
  const handleExportCSV = useCallback(async () => {
    if (tableReadings.length === 0) return;
    const header = "timestamp,node_id,zone_id,zone_name,temperature_c,humidity_pct,soil_moisture_pct,raw_sm,et0";
    const rows = tableReadings.map((r) => {
      const ts = new Date(r.created_at).toISOString();
      return [
        ts,
        r.node_id,
        r.zone_id ?? "",
        r.zone_name ?? "",
        r.temperature ?? "",
        r.humidity ?? "",
        r.sm_percent ?? "",
        r.raw_sm_value ?? "",
        r.et0_instant ?? "",
      ].join(",");
    });
    const csv = `${header}\n${rows.join("\n")}\n`;
    try {
      // Cache dizinine yaz
      const fname = `taras_sensors_${selectedFieldId ?? "field"}_${Date.now()}.csv`;
      const file = new File(Paths.cache, fname);
      try {
        if (file.exists) file.delete();
      } catch {
        // ignore
      }
      file.create();
      file.write(csv);
      const uri = file.uri;
      // expo-sharing ile platform-bagimsiz dosya paylasimi
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "text/csv",
          dialogTitle: t.timetable.shareCSV,
          UTI: "public.comma-separated-values-text",
        });
        console.log("[TIMETABLE] csv share:", uri);
      } else {
        // Sharing kullanilamiyorsa text olarak paylas (kucuk veriler icin son care)
        await Share.share({ message: csv });
      }
    } catch (e) {
      console.log("[TIMETABLE] csv err:", e);
      // Fallback
      try {
        await Share.share({ message: csv });
      } catch {
        // ignore
      }
    }
  }, [tableReadings, selectedFieldId, t]);

  // Toolbar — universal OptionButton + OptionDropdown ile insa edildi
  // Tasarim: 2 satir.
  //   Satir 1: Grafikler / Tablo OptionButton + Filtre kare butonu
  //   Satir 2: Zaman araligi dropdown + Mod dropdown — eski chip'lerin yerine
  const rangeOptions = useMemo(
    () => [
      { value: 6, label: t.timetable.range6h },
      { value: 24, label: t.timetable.range24h },
      { value: 72, label: t.timetable.range3d },
      { value: 168, label: t.timetable.range1w },
      { value: 720, label: t.timetable.range1m },
    ],
    [t],
  );
  const modeOptions = useMemo<
    { value: AggregationMode; label: string; icon: string }[]
  >(
    () => [
      { value: "per_node", label: t.timetable.modePerNode, icon: "view-grid" },
      { value: "per_zone_avg", label: t.timetable.modePerZone, icon: "layers-triple" },
      { value: "field_avg", label: t.timetable.modeFieldAvg, icon: "vector-combine" },
    ],
    [t],
  );

  const onRangeDropdownChange = useCallback(
    (hours: number) => {
      const found = rangeOptions.find((o) => o.value === hours);
      setRange({ preset: hours, label: found?.label ?? `${hours}h` });
    },
    [rangeOptions],
  );

  const controlStrip = (
    <View style={{ paddingTop: 8, paddingBottom: 6 }}>
      {/* Satir 1: Segment toggle + Paylas. Tum elemanlar TOOLBAR_BTN_H yuksekliginde — hizali. */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: TAB_H_PADDING,
          gap: 6,
        }}
      >
        <OptionButton
          theme={theme}
          icon="chart-line"
          label={t.timetable.charts}
          active={view === "chart"}
          onPress={() => setView("chart")}
          style={{ height: TOOLBAR_BTN_H }}
        />
        <OptionButton
          theme={theme}
          icon="table"
          label={t.timetable.table}
          active={view === "table"}
          onPress={() => setView("table")}
          style={{ height: TOOLBAR_BTN_H }}
        />
        <Pressable
          accessibilityLabel={t.timetable.shareCSV}
          onPress={handleExportCSV}
          disabled={tableReadings.length === 0}
          style={{
            width: TOOLBAR_BTN_H,
            height: TOOLBAR_BTN_H,
            borderRadius: 10,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: theme.primary,
            opacity: tableReadings.length === 0 ? 0.4 : 1,
          }}
        >
          <MaterialCommunityIcons
            name="share-variant"
            size={20}
            color={theme.textOnPrimary}
          />
        </Pressable>
      </View>

      {/* Satir 2: Aralık + Mod dropdownlari + Filtre butonu. Filtre butonu Share'in altinda kalir
          (her satir 2 uzun + 1 kare buton dizaynina uyar). Tum elemanlar ayni yukseklikte. */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: TAB_H_PADDING,
          paddingTop: 6,
          gap: 6,
        }}
      >
        <OptionDropdown
          theme={theme}
          label={t.timetable.timeRange}
          showLabel={false}
          value={range.preset ?? -1}
          options={rangeOptions}
          onChange={onRangeDropdownChange}
          displayLabel={range.preset ? undefined : range.label}
          style={{ flex: 1 }}
        />
        <OptionDropdown
          theme={theme}
          label={t.timetable.aggregationMode}
          showLabel={false}
          value={mode}
          options={modeOptions}
          onChange={setMode}
          style={{ flex: 1 }}
        />
        <Pressable
          accessibilityLabel={t.timetable.filters}
          onPress={() => setFilterOpen(true)}
          style={{
            width: TOOLBAR_BTN_H,
            height: TOOLBAR_BTN_H,
            borderRadius: 10,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: theme.primary,
          }}
        >
          <MaterialCommunityIcons
            name="tune-vertical"
            size={22}
            color={theme.textOnPrimary}
          />
        </Pressable>
      </View>
    </View>
  );

  // True initial load (henuz hic veri yok) -> tam ekran spinner; controlStrip de gozukmez
  // cunku ortada gosterilecek bir sey de yok. Filtre degisikligi (yeniden cekme) durumunda
  // bu kosul devreye girmez — eski veri korunur, MultiSeriesChart/OptimizedSensorTable kendi
  // yari saydam overlay'i ile loading'i gosterir, controlStrip ekranda kalir.
  // Pull-to-refresh de ayni overlay'i tetikler (RefreshControl spinner'i USTTE kalir, asagi data dim olur).
  const isInitialEmptyLoad = loading && !refreshing && readings.length === 0 && !error;
  const isRefetchOverlay = (loading || refreshing) && readings.length > 0;

  if (isInitialEmptyLoad) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.background,
        }}
      >
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={{ marginTop: vs(16), color: theme.textSecondary, fontSize: ms(13, 0.3) }}>
          {t.timetable.loadingSensorData}
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.background }}
        contentContainerStyle={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: s(20),
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[theme.primary]} />
        }
      >
        <MaterialCommunityIcons name="alert-circle" size={48} color={theme.primary} />
        <Text
          style={{
            marginTop: vs(12),
            fontSize: ms(18, 0.3),
            fontWeight: "700",
            color: theme.textMain,
          }}
        >
          {t.timetable.loadFailed}
        </Text>
        <Text
          style={{
            marginTop: vs(4),
            fontSize: ms(12, 0.3),
            color: theme.textSecondary,
            textAlign: "center",
          }}
        >
          {error}
        </Text>
        <Text
          style={{
            marginTop: vs(12),
            fontSize: ms(11, 0.3),
            color: theme.textMuted,
          }}
        >
          {t.timetable.pullToRefresh}
        </Text>
      </ScrollView>
    );
  }

  // CHART VIEW
  if (view === "chart") {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        {controlStrip}
        <ScrollView
          style={{ flex: 1 }}
          // Yatay grafik scrub'i suruyorken dikey kaydirma KAPALI — Android'de child responder kilidi
          // (onResponderTerminationRequest=false) native scroll'u durdurmaya yetmiyor.
          scrollEnabled={!chartScrubbing}
          contentContainerStyle={{ paddingHorizontal: TAB_H_PADDING, paddingTop: vs(4), paddingBottom: vs(24) }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              colors={[theme.primary]}
            />
          }
        >
          {visibleCharts.map(({ def, series, isPercent, thresholds }) => (
            <MultiSeriesChart
              key={def.key}
              theme={theme}
              title={def.label}
              icon={def.icon}
              unit={def.unit}
              decimals={def.decimals}
              series={series}
              percentScale={isPercent}
              thresholds={thresholds}
              loading={isRefetchOverlay}
              onScrubbingChange={setChartScrubbing}
            />
          ))}

          {lastUpdated && (
            <Text
              style={{
                marginTop: vs(8),
                fontSize: ms(10, 0.3),
                color: theme.textMuted,
                textAlign: "center",
              }}
            >
              {t.timetable.lastUpdated}: {lastUpdated.toLocaleTimeString()}
            </Text>
          )}
        </ScrollView>

        <FilterMenu
          theme={theme}
          visible={filterOpen}
          onClose={() => setFilterOpen(false)}
          zones={zones}
          selectedZoneIds={selectedZoneIds}
          setSelectedZoneIds={setSelectedZoneIds}
          mode={mode}
          setMode={setMode}
          range={range}
          setRange={setRange}
          selectedMetrics={selectedMetrics}
          setSelectedMetrics={setSelectedMetrics}
          metricOptions={metricDefs.map((m) => ({ key: m.key, label: m.label }))}
          presetRanges={presetRanges}
          defaults={filterDefaults}
        />
      </View>
    );
  }

  // TABLE VIEW
  // Ozet basligi — secili metriklere gore avg/min/max ozet ve okuma sayisi. Negatif alani doldurur.
  // CSV butonu + count kaldirildi; CSV artik ust toolbar'da, count buradaki ozet basliginda gozukur.
  const visibleStatMetrics = metricDefs.filter(
    (m) => selectedMetrics.has(m.key) && tableStats[m.key],
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {controlStrip}
      <View
        style={{
          marginHorizontal: TAB_H_PADDING,
          marginTop: vs(4),
          padding: s(10),
          borderRadius: 12,
          borderWidth: 1,
          borderColor: theme.border,
          backgroundColor: theme.surface,
        }}
      >
        {/* Ust satir: Ozet basligi + okuma sayisi + son guncelleme */}
        <View
          style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}
        >
          <Text
            style={{
              fontSize: ms(12, 0.3),
              fontWeight: "700",
              color: theme.textMain,
              letterSpacing: 0.3,
              textTransform: "uppercase",
            }}
          >
            {t.timetable.summary}
          </Text>
          <Text
            style={{ fontSize: ms(11, 0.3), color: theme.textMuted, marginLeft: s(8) }}
          >
            · {tableReadings.length} {t.timetable.readings}
          </Text>
          {lastUpdated && (
            <Text
              style={{ fontSize: ms(10.5, 0.3), color: theme.textMuted, marginLeft: s(8) }}
            >
              · {lastUpdated.toLocaleTimeString()}
            </Text>
          )}
        </View>
        {/* Metric satirlari */}
        {visibleStatMetrics.length === 0 ? (
          <Text
            style={{
              fontSize: ms(11, 0.3),
              color: theme.textMuted,
              marginTop: vs(6),
              fontStyle: "italic",
            }}
          >
            {t.timetable.noDataYet}
          </Text>
        ) : (
          visibleStatMetrics.map((m) => {
            const stat = tableStats[m.key]!;
            const dec = m.decimals;
            const u = m.unit === "%" ? "%" : m.unit ? ` ${m.unit}` : "";
            return (
              <View
                key={m.key}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginTop: vs(4),
                }}
              >
                <Text
                  style={{
                    width: s(70),
                    fontSize: ms(11.5, 0.3),
                    fontWeight: "700",
                    color: theme.textMain,
                  }}
                  numberOfLines={1}
                >
                  {m.label}
                </Text>
                <StatCell theme={theme} label={t.timetable.avg} value={`${stat.avg.toFixed(dec)}${u}`} />
                <StatCell theme={theme} label={t.timetable.min} value={`${stat.min.toFixed(dec)}${u}`} />
                <StatCell theme={theme} label={t.timetable.max} value={`${stat.max.toFixed(dec)}${u}`} />
              </View>
            );
          })
        )}
      </View>
      <View style={{ flex: 1 }}>
        <OptimizedSensorTable
          theme={theme}
          data={tableReadings}
          soilThresholds={soilThresholds}
          loading={isRefetchOverlay}
        />
      </View>

      <FilterMenu
        theme={theme}
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        zones={zones}
        selectedZoneIds={selectedZoneIds}
        setSelectedZoneIds={setSelectedZoneIds}
        mode={mode}
        setMode={setMode}
        range={range}
        setRange={setRange}
        selectedMetrics={selectedMetrics}
        setSelectedMetrics={setSelectedMetrics}
        metricOptions={metricDefs.map((m) => ({ key: m.key, label: m.label }))}
        presetRanges={presetRanges}
        defaults={filterDefaults}
      />
    </View>
  );
});

// Stats header'da kullanilan kucuk hucre. Label (Avg/Min/Max) + deger, dikey hizali.
interface StatCellProps {
  theme: Theme;
  label: string;
  value: string;
}
const StatCell = memo(function StatCell({ theme, label, value }: StatCellProps) {
  return (
    <View style={{ flex: 1, marginLeft: s(4) }}>
      <Text
        style={{
          fontSize: ms(9.5, 0.3),
          color: theme.textMuted,
          letterSpacing: 0.3,
          textTransform: "uppercase",
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontSize: ms(11.5, 0.3),
          color: theme.textMain,
          fontWeight: "600",
          marginTop: 1,
        }}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
});

