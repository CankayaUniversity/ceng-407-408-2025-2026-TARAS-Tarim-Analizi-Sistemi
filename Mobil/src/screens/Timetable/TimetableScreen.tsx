// Cizelge ekrani - sensor verilerini grafik ve tablo olarak gosterir
// Props: theme, isActive, selectedFieldId
import { memo, useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Modal,
  InteractionManager,
  Share,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { sensorAPI } from "../../utils/api";
import { secureGet } from "../../utils/secureStorage";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { FocusableSection } from "../../components/FocusableSection";
import { ChartCard } from "./ChartCard";
import { SensorDataTable } from "./SensorDataTable";
import { TimetableScreenProps, ChartDataPoint, SensorReading } from "./types";
import { useScreenReset } from "../../hooks/useScreenReset";
import { useLanguage } from "../../context/LanguageContext";
import { Theme } from "../../utils/theme";
import { s, vs, ms } from "../../utils/responsive";

interface ChartSectionProps {
  id: string;
  theme: Theme;
  scrollViewRef: React.RefObject<ScrollView | null>;
  title: string;
  icon: string;
  color: string;
  data: ChartDataPoint[];
  fallback: React.ReactNode;
  onTouchStart?: () => void;
  onTouchEnd?: () => void;
}

const ChartSection = ({ id, theme, scrollViewRef, title, icon, color, data, fallback, onTouchStart, onTouchEnd }: ChartSectionProps) => (
  <FocusableSection id={id} screen="timetable" theme={theme} scrollViewRef={scrollViewRef}>
    <ErrorBoundary fallback={fallback}>
      <ChartCard
        theme={theme}
        title={title}
        icon={icon}
        color={color}
        data={data}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      />
    </ErrorBoundary>
  </FocusableSection>
);

export const TimetableScreen = memo(function TimetableScreen({
  theme,
  isActive = true,
  selectedFieldId,
}: TimetableScreenProps) {
  const { t } = useLanguage();
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dataSource, setDataSource] = useState<"aws" | "demo">("demo");
  const [temperatureData, setTemperatureData] = useState<ChartDataPoint[]>([]);
  const [humidityData, setHumidityData] = useState<ChartDataPoint[]>([]);
  const [soilMoistureData, setSoilMoistureData] = useState<ChartDataPoint[]>(
    [],
  );
  const [error, setError] = useState<string | null>(null);
  const [fieldName, setFieldName] = useState("");
  const [rawReadings, setRawReadings] = useState<SensorReading[]>([]);
  const [showTable, setShowTable] = useState(false);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [timeRange, setTimeRange] = useState<number>(72);
  const scrollViewRef = useRef<ScrollView>(null);
  // Son basarili fetch anahtari — ayni field+timeRange icin tekrar fetch engellenir
  const fetchedKeyRef = useRef<string | null>(null);

  const timeRangeOptions = [
    { label: t.timetable.range6h, hours: 6 },
    { label: t.timetable.range24h, hours: 24 },
    { label: t.timetable.range3d, hours: 72 },
    { label: t.timetable.range1w, hours: 168 },
    { label: t.timetable.range1m, hours: 720 },
  ];

  // Sensor verilerini cek
  const fetchSensorData = async (cancelled?: { current: boolean }) => {
    try {
      if (cancelled?.current) return;
      setError(null);

      const token = await secureGet("auth_token");
      const isDemoMode = !token || token === "DEMO_MODE_TOKEN";

      if (isDemoMode) {
        console.log("[TIMETABLE] demo mode");
        generateDemoData(cancelled);
        return;
      }

      if (!selectedFieldId) {
        if (!cancelled?.current) {
          setError(t.timetable.noFieldSelected);
          setIsLoading(false);
        }
        return;
      }

      console.log("[TIMETABLE] fetch:", selectedFieldId);
      const response = await sensorAPI.getFieldHistory(
        selectedFieldId,
        timeRange,
      );

      if (cancelled?.current) return;

      if (!response.success || !response.data) {
        console.log("[TIMETABLE] err:", response.error);
        setError(response.error || t.timetable.loadFailed);
        setIsLoading(false);
        return;
      }

      console.log(
        "[TIMETABLE] data:",
        response.data.readings?.length,
        "readings",
      );
      setDataSource("aws");

      const { readings, field_name } = response.data;
      if (!readings?.length) {
        if (!cancelled?.current) {
          setError(t.timetable.noDataYet);
          setIsLoading(false);
        }
        return;
      }

      if (!cancelled?.current) setFieldName(field_name);

      // Gecersiz tarihleri filtrele
      const validReadings = readings.filter((r) => {
        if (!r.created_at) return false;
        const dateTest = new Date(r.created_at);
        return !isNaN(dateTest.getTime());
      });

      if (validReadings.length === 0) {
        if (!cancelled?.current) {
          setError(t.timetable.noDataYet);
          setIsLoading(false);
        }
        return;
      }

      // Zamana gore sirala
      const sortedReadings = [...validReadings].sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );

      // Dakika bazinda grupla ve ortalama al
      const groups = new Map<number, SensorReading[]>();
      for (const r of sortedReadings) {
        const d = new Date(r.created_at);
        const keyDate = new Date(
          d.getFullYear(),
          d.getMonth(),
          d.getDate(),
          d.getHours(),
          d.getMinutes(),
        );
        const key = keyDate.getTime();
        const bucket = groups.get(key);
        if (bucket) bucket.push(r);
        else groups.set(key, [r]);
      }

      const keys = Array.from(groups.keys()).sort((a, b) => a - b);

      const tempPoints: ChartDataPoint[] = [];
      const humPoints: ChartDataPoint[] = [];
      const soilPoints: ChartDataPoint[] = [];

      keys.forEach((k) => {
        const bucket = groups.get(k)!;
        const avg = (arr: (number | null)[]) => {
          const valid = arr.filter(
            (v): v is number => v !== null && v !== undefined && !isNaN(v),
          );
          return valid.length
            ? valid.reduce((s, v) => s + v, 0) / valid.length
            : 0;
        };
        const date = new Date(k);
        const hh = date.getHours().toString().padStart(2, "0");
        const mm = date.getMinutes().toString().padStart(2, "0");
        const label = `${hh}:${mm}`;
        const ts = date.toISOString();

        tempPoints.push({
          value: avg(bucket.map((b) => b.temperature)),
          label,
          ts,
        });
        humPoints.push({
          value: avg(bucket.map((b) => b.humidity)),
          label,
          ts,
        });
        soilPoints.push({
          value: avg(bucket.map((b) => b.sm_percent)),
          label,
          ts,
        });
      });

      if (!cancelled?.current) {
        setError(null);
        setRawReadings(sortedReadings);
        setTemperatureData(tempPoints);
        setHumidityData(humPoints);
        setSoilMoistureData(soilPoints);
        setLastUpdated(new Date());
      }
    } catch (error) {
      if (cancelled?.current) return;
      console.log(
        "[TIMETABLE] err:",
        error instanceof Error ? error.message : "unknown",
      );
      setError(
        t.timetable.connectionError +
          (error instanceof Error ? error.message : t.timetable.unknownError),
      );
    } finally {
      if (!cancelled?.current) {
        setIsLoading(false);
        setRefreshing(false);
      }
    }
  };

  // Demo veri olustur
  const generateDemoData = (cancelled?: { current: boolean }) => {
    if (cancelled?.current) return;
    setDataSource("demo");
    setFieldName("Demo Field");
    setError(null);

    const now = Date.now();
    const hoursBack = 72;
    const pointsPerHour = 4;
    const totalPoints = hoursBack * pointsPerHour;

    const tempPoints: ChartDataPoint[] = [];
    const humPoints: ChartDataPoint[] = [];
    const soilPoints: ChartDataPoint[] = [];
    const demoReadings: SensorReading[] = [];

    for (let i = 0; i < totalPoints; i++) {
      const timeOffset = now - (totalPoints - i) * 15 * 60 * 1000;
      const date = new Date(timeOffset);
      const hh = date.getHours().toString().padStart(2, "0");
      const mm = date.getMinutes().toString().padStart(2, "0");
      const label = `${hh}:${mm}`;
      const ts = date.toISOString();

      const hourFactor = i / pointsPerHour / 24;
      const temp =
        20 + 8 * Math.sin(hourFactor * Math.PI * 2) + (Math.random() - 0.5) * 3;
      const hum =
        65 +
        15 * Math.sin(hourFactor * Math.PI * 2 + Math.PI) +
        (Math.random() - 0.5) * 10;
      const soil =
        45 +
        10 * Math.sin(hourFactor * Math.PI * 2 + Math.PI / 2) +
        (Math.random() - 0.5) * 8;

      tempPoints.push({ value: temp, label, ts });
      humPoints.push({ value: hum, label, ts });
      soilPoints.push({ value: soil, label, ts });

      demoReadings.push({
        id: `demo-${i}`,
        node_id: `node-${(i % 3) + 1}`,
        created_at: ts,
        temperature: Math.round(temp * 10) / 10,
        humidity: Math.round(hum * 10) / 10,
        sm_percent: Math.round(soil * 10) / 10,
        raw_sm_value: Math.round(soil * 10),
        et0_instant: null,
      });
    }

    if (!cancelled?.current) {
      setRawReadings(demoReadings);
      setTemperatureData(tempPoints);
      setHumidityData(humPoints);
      setSoilMoistureData(soilPoints);
      setLastUpdated(new Date());
    }
  };

  useScreenReset(isActive, {
    onDeactivate: () => {
      setShowTable(false);
      setRefreshing(false);
    },
  });

  useEffect(() => {
    if (!isActive) return;
    // Ayni field+timeRange icin zaten veri varsa tekrar cekme
    const key = `${selectedFieldId ?? "none"}_${timeRange}`;
    if (fetchedKeyRef.current === key) return;
    fetchedKeyRef.current = key;
    const cancelled = { current: false };
    // Tab gecis animasyonu bittikten sonra agir veriyi yukle
    const task = InteractionManager.runAfterInteractions(() => {
      void fetchSensorData(cancelled);
    });
    return () => {
      cancelled.current = true;
      task.cancel();
    };
  }, [isActive, selectedFieldId, timeRange]);

  const handleTimeRangeChange = (hours: number) => {
    if (hours !== timeRange) {
      setTimeRange(hours);
      setIsLoading(true);
    }
  };

  const onRefresh = () => {
    fetchedKeyRef.current = null; // cache'i temizle, yeniden cekmeye izin ver
    setRefreshing(true);
    fetchSensorData();
  };

  const handleExportCSV = useCallback(async () => {
    const header = "timestamp,temperature,humidity,soilMoisture";
    const rows = rawReadings
      .map((r) => {
        const d = new Date(r.created_at);
        const iso = d.toISOString();
        return [iso, r.temperature, r.humidity, r.sm_percent].join(",");
      })
      .join("\n");
    const csv = `${header}\n${rows}`;
    try {
      await Share.share({ message: csv });
    } catch (e) {
      console.log("[TIMETABLE] share err:", e);
    }
  }, [rawReadings]);

  const renderChartFallback = (title: string) => (
    <View
      className="rounded-xl surface-bg"
      style={{
        marginBottom: vs(24),
        padding: s(16),
        borderWidth: 1,
        borderColor: theme.textSecondary + "20",
      }}
    >
      <Text
        className="text-primary font-semibold"
        style={{ fontSize: ms(16, 0.3), marginBottom: vs(8) }}
      >
        {title}
      </Text>
      <Text
        className="text-secondary"
        style={{ fontSize: ms(13, 0.3), lineHeight: ms(20, 0.3) }}
      >
        {t.timetable.loadFailed}
      </Text>
      <Text
        className="text-secondary"
        style={{ fontSize: ms(12, 0.3), lineHeight: ms(18, 0.3), marginTop: vs(6) }}
      >
        {t.timetable.table}
      </Text>
    </View>
  );

  if (isLoading) {
    return (
      <View className="flex-1 center px-6 bg-porcelain dark:bg-carbonBlack">
        <ActivityIndicator size="large" color={theme.primary} />
        <Text
          className="text-secondary"
          style={{ fontSize: ms(14, 0.3), marginTop: vs(16) }}
        >
          {t.timetable.loadingSensorData}
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <ScrollView
        className="screen-bg"
        contentContainerStyle={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          padding: s(20),
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[theme.primary]}
          />
        }
      >
        <MaterialCommunityIcons
          name="alert-circle"
          size={48}
          color={theme.primary}
          style={{ marginBottom: vs(16) }}
        />
        <Text
          className="text-primary font-bold"
          style={{ fontSize: ms(24, 0.3), marginBottom: vs(6) }}
        >
          {t.timetable.loadFailed}
        </Text>
        <Text
          className="text-secondary"
          style={{ fontSize: ms(14, 0.3) }}
        >
          {error}
        </Text>
        <Text
          className="text-secondary"
          style={{ fontSize: ms(14, 0.3), marginTop: vs(8) }}
        >
          {t.timetable.pullToRefresh}
        </Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      ref={scrollViewRef}
      className="screen-bg"
      scrollEnabled={scrollEnabled}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={[theme.primary]}
        />
      }
    >
      <View style={{ padding: s(16) }}>
        <View
          className="flex-row justify-between items-center"
          style={{ marginBottom: vs(8) }}
        >
          <Text
            className="text-primary font-bold"
            style={{ fontSize: ms(24, 0.3) }}
          >
            {t.timetable.title}
          </Text>
          <View
            className="rounded-md"
            style={{
              paddingHorizontal: s(8),
              paddingVertical: vs(4),
              backgroundColor: dataSource === "aws" ? theme.success : theme.warning,
            }}
          >
            <Text style={{ color: theme.textOnPrimary, fontSize: ms(10, 0.3), fontWeight: "600" }}>
              {dataSource === "aws" ? "AWS" : "DEMO"}
            </Text>
          </View>
        </View>
        <Text
          className="text-secondary"
          style={{ fontSize: ms(14, 0.3), marginBottom: vs(8) }}
        >
          {fieldName || t.common.loading}
        </Text>

        {/* Zaman araligi secici */}
        <FocusableSection
          id="timeRangeSelector"
          screen="timetable"
          theme={theme}
          scrollViewRef={scrollViewRef}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginBottom: vs(12) }}
          >
            <View className="flex-row" style={{ gap: s(8) }}>
              {timeRangeOptions.map((option) => (
                <TouchableOpacity
                  key={option.hours}
                  onPress={() => handleTimeRangeChange(option.hours)}
                  className="rounded-lg"
                  style={{
                    paddingHorizontal: s(14),
                    paddingVertical: vs(8),
                    backgroundColor:
                      timeRange === option.hours ? theme.primary : theme.surface,
                    borderWidth: 1,
                    borderColor:
                      timeRange === option.hours
                        ? theme.primary
                        : theme.textSecondary + "30",
                  }}
                >
                  <Text
                    style={{
                      fontSize: ms(12, 0.3),
                      fontWeight: "600",
                      color: timeRange === option.hours ? theme.textOnPrimary : theme.textMain,
                    }}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </FocusableSection>

        {lastUpdated && (
          <Text
            className="text-secondary"
            style={{ fontSize: ms(11, 0.3), marginBottom: vs(16) }}
          >
            {t.timetable.lastUpdated}: {lastUpdated.toLocaleTimeString()}
          </Text>
        )}

        {/* Tablo butonu */}
        <FocusableSection
          id="tableButton"
          screen="timetable"
          theme={theme}
          scrollViewRef={scrollViewRef}
        >
          <View className="flex-row" style={{ marginBottom: vs(16) }}>
            <TouchableOpacity
              onPress={() => setShowTable(true)}
              className="row rounded-lg surface-bg"
              style={{
                paddingHorizontal: s(10),
                paddingVertical: vs(6),
                borderWidth: 1,
                borderColor: theme.textSecondary + "30",
              }}
            >
              <MaterialCommunityIcons
                name="table"
                size={16}
                color={theme.textSecondary}
              />
              <Text
                className="text-secondary font-semibold"
                style={{ marginLeft: s(6), fontSize: ms(12, 0.3) }}
              >
                {t.timetable.table}
              </Text>
            </TouchableOpacity>
          </View>
        </FocusableSection>

        <ChartSection
          id="temperatureChart"
          theme={theme}
          scrollViewRef={scrollViewRef}
          title={t.timetable.temperature}
          icon="thermometer"
          color={theme.danger}
          data={temperatureData}
          fallback={renderChartFallback(t.timetable.temperature)}
          onTouchStart={() => setScrollEnabled(false)}
          onTouchEnd={() => setScrollEnabled(true)}
        />
        <ChartSection
          id="humidityChart"
          theme={theme}
          scrollViewRef={scrollViewRef}
          title={t.timetable.humidity}
          icon="water-percent"
          color={theme.info}
          data={humidityData}
          fallback={renderChartFallback(t.timetable.humidity)}
          onTouchStart={() => setScrollEnabled(false)}
          onTouchEnd={() => setScrollEnabled(true)}
        />
        <ChartSection
          id="soilMoistureChart"
          theme={theme}
          scrollViewRef={scrollViewRef}
          title={t.timetable.soilMoisture}
          icon="flower"
          color={theme.success}
          data={soilMoistureData}
          fallback={renderChartFallback(t.timetable.soilMoisture)}
          onTouchStart={() => setScrollEnabled(false)}
          onTouchEnd={() => setScrollEnabled(true)}
        />
      </View>

      {/* Tablo modal */}
      <Modal
        visible={showTable}
        animationType="slide"
        onRequestClose={() => setShowTable(false)}
      >
        <View
          className="screen-bg"
          style={{ padding: s(16) }}
        >
          <View
            className="flex-row justify-between items-center"
            style={{ marginBottom: vs(12), marginTop: vs(12) }}
          >
            <Text
              className="text-primary font-bold"
              style={{ fontSize: ms(16, 0.3) }}
            >
              {fieldName} - {t.timetable.last72Hours}
            </Text>
            <TouchableOpacity
              onPress={() => setShowTable(false)}
              style={{ padding: s(8) }}
            >
              <MaterialCommunityIcons
                name="close"
                size={22}
                color={theme.textMain}
              />
            </TouchableOpacity>
          </View>

          <SensorDataTable theme={theme} data={rawReadings} />

          <View
            className="flex-row justify-end"
            style={{ marginTop: vs(16) }}
          >
            <TouchableOpacity
              onPress={handleExportCSV}
              className="row rounded-lg"
              style={{
                paddingHorizontal: s(12),
                paddingVertical: vs(10),
                backgroundColor: theme.primary,
              }}
            >
              <MaterialCommunityIcons
                name="share-variant"
                size={18}
                color={theme.background}
              />
              <Text
                className="font-bold"
                style={{
                  marginLeft: s(8),
                  color: theme.background,
                  fontSize: ms(12, 0.3),
                }}
              >
                {t.timetable.shareCSV}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
});
