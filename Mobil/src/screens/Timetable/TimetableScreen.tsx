// Cizelge ekrani - sensor verilerini grafik ve tablo olarak gosterir
// Props: theme, isActive, selectedFieldId
import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Modal,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { appStyles } from "../../styles";
import { sensorAPI } from "../../utils/api";
import { ChartCard } from "./ChartCard";
import { SensorDataTable } from "./SensorDataTable";
import { TimetableScreenProps, ChartDataPoint, SensorReading } from "./types";
import { useScreenReset } from "../../hooks/useScreenReset";
import { useLanguage } from "../../context/LanguageContext";

export const TimetableScreen = ({
  theme,
  isActive = true,
  selectedFieldId,
}: TimetableScreenProps) => {
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

  const timeRangeOptions = [
    { label: t.timetable.range6h, hours: 6 },
    { label: t.timetable.range24h, hours: 24 },
    { label: t.timetable.range3d, hours: 72 },
    { label: t.timetable.range1w, hours: 168 },
    { label: t.timetable.range1m, hours: 720 },
  ];

  // Sensor verilerini cek
  const fetchSensorData = async () => {
    try {
      setError(null);

      const token = await AsyncStorage.getItem("auth_token");
      const isDemoMode = !token || token === "DEMO_MODE_TOKEN";

      if (isDemoMode) {
        console.log("[TIMETABLE] demo mode");
        generateDemoData();
        return;
      }

      if (!selectedFieldId) {
        setError(t.timetable.noFieldSelected);
        setIsLoading(false);
        return;
      }

      console.log("[TIMETABLE] fetch:", selectedFieldId);
      const response = await sensorAPI.getFieldHistory(
        selectedFieldId,
        timeRange,
      );

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
        setError(t.timetable.noDataYet);
        setIsLoading(false);
        return;
      }

      setFieldName(field_name);

      // Gecersiz tarihleri filtrele
      const validReadings = readings.filter((r) => {
        if (!r.created_at) return false;
        const dateTest = new Date(r.created_at);
        return !isNaN(dateTest.getTime());
      });

      if (validReadings.length === 0) {
        setError(t.timetable.noDataYet);
        setIsLoading(false);
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

      setError(null);
      setRawReadings(sortedReadings);
      setTemperatureData(tempPoints);
      setHumidityData(humPoints);
      setSoilMoistureData(soilPoints);
      setLastUpdated(new Date());
    } catch (error) {
      console.log(
        "[TIMETABLE] err:",
        error instanceof Error ? error.message : "unknown",
      );
      setError(
        t.timetable.connectionError +
          (error instanceof Error ? error.message : t.timetable.unknownError),
      );
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  // Demo veri olustur
  const generateDemoData = () => {
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

    setRawReadings(demoReadings);
    setTemperatureData(tempPoints);
    setHumidityData(humPoints);
    setSoilMoistureData(soilPoints);
    setLastUpdated(new Date());
  };

  useScreenReset(isActive, {
    onDeactivate: () => {
      setShowTable(false);
      setRefreshing(false);
    },
  });

  useEffect(() => {
    if (isActive) {
      fetchSensorData();
    }
  }, [isActive, selectedFieldId, timeRange]);

  const handleTimeRangeChange = (hours: number) => {
    if (hours !== timeRange) {
      setTimeRange(hours);
      setIsLoading(true);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchSensorData();
  };

  if (isLoading) {
    return (
      <View
        style={[appStyles.placeholder, { backgroundColor: theme.background }]}
      >
        <ActivityIndicator size="large" color={theme.accent} />
        <Text
          style={[
            appStyles.placeholderSub,
            { color: theme.textSecondary, marginTop: 16 },
          ]}
        >
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
          justifyContent: "center",
          alignItems: "center",
          padding: 20,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[theme.accent]}
          />
        }
      >
        <MaterialCommunityIcons
          name="alert-circle"
          size={48}
          color={theme.accent}
          style={{ marginBottom: 16 }}
        />
        <Text style={[appStyles.placeholderText, { color: theme.text }]}>
          {t.timetable.loadFailed}
        </Text>
        <Text
          style={[appStyles.placeholderSub, { color: theme.textSecondary }]}
        >
          {error}
        </Text>
        <Text
          style={[
            appStyles.placeholderSub,
            { color: theme.textSecondary, marginTop: 8 },
          ]}
        >
          {t.timetable.pullToRefresh}
        </Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      ref={scrollViewRef}
      style={{ flex: 1, backgroundColor: theme.background }}
      scrollEnabled={scrollEnabled}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={[theme.accent]}
        />
      }
    >
      <View style={{ padding: 16 }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <Text style={[appStyles.placeholderText, { color: theme.text }]}>
            {t.timetable.title}
          </Text>
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 6,
              backgroundColor: dataSource === "aws" ? "#10b981" : "#f59e0b",
            }}
          >
            <Text style={{ color: "#fff", fontSize: 10, fontWeight: "600" }}>
              {dataSource === "aws" ? "AWS" : "DEMO"}
            </Text>
          </View>
        </View>
        <Text
          style={[
            appStyles.placeholderSub,
            { color: theme.textSecondary, marginBottom: 8 },
          ]}
        >
          {fieldName || t.common.loading}
        </Text>

        {/* Zaman araligi secici */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginBottom: 12 }}
        >
          <View style={{ flexDirection: "row", gap: 8 }}>
            {timeRangeOptions.map((option) => (
              <TouchableOpacity
                key={option.hours}
                onPress={() => handleTimeRangeChange(option.hours)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 8,
                  backgroundColor:
                    timeRange === option.hours ? theme.accent : theme.surface,
                  borderWidth: 1,
                  borderColor:
                    timeRange === option.hours
                      ? theme.accent
                      : theme.textSecondary + "30",
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "600",
                    color: timeRange === option.hours ? "#fff" : theme.text,
                  }}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {lastUpdated && (
          <Text
            style={{
              fontSize: 11,
              color: theme.textSecondary,
              marginBottom: 16,
            }}
          >
            {t.timetable.lastUpdated}: {lastUpdated.toLocaleTimeString()}
          </Text>
        )}

        {/* Tablo butonu */}
        <View style={{ flexDirection: "row", marginBottom: 16 }}>
          <TouchableOpacity
            onPress={() => setShowTable(true)}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 8,
              backgroundColor: theme.surface,
              borderWidth: 1,
              borderColor: theme.textSecondary + "30",
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <MaterialCommunityIcons
              name="table"
              size={16}
              color={theme.textSecondary}
            />
            <Text
              style={{
                marginLeft: 6,
                color: theme.textSecondary,
                fontSize: 12,
                fontWeight: "600",
              }}
            >
              {t.timetable.table}
            </Text>
          </TouchableOpacity>
        </View>

        <ChartCard
          theme={theme}
          title={t.timetable.temperature}
          icon="thermometer"
          color="#FF6B6B"
          data={temperatureData}
          onTouchStart={() => setScrollEnabled(false)}
          onTouchEnd={() => setScrollEnabled(true)}
        />
        <ChartCard
          theme={theme}
          title={t.timetable.humidity}
          icon="water-percent"
          color="#4ECDC4"
          data={humidityData}
          onTouchStart={() => setScrollEnabled(false)}
          onTouchEnd={() => setScrollEnabled(true)}
        />
        <ChartCard
          theme={theme}
          title={t.timetable.soilMoisture}
          icon="flower"
          color="#95E1D3"
          data={soilMoistureData}
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
          style={{ flex: 1, backgroundColor: theme.background, padding: 16 }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
              marginTop: 12,
            }}
          >
            <Text
              style={{ color: theme.text, fontSize: 16, fontWeight: "700" }}
            >
              {fieldName} - {t.timetable.last72Hours}
            </Text>
            <TouchableOpacity
              onPress={() => setShowTable(false)}
              style={{ padding: 8 }}
            >
              <MaterialCommunityIcons
                name="close"
                size={22}
                color={theme.text}
              />
            </TouchableOpacity>
          </View>

          <SensorDataTable theme={theme} data={rawReadings} />

          <View
            style={{
              flexDirection: "row",
              justifyContent: "flex-end",
              marginTop: 16,
            }}
          >
            <TouchableOpacity
              onPress={async () => {
                const header = "timestamp,temperature,humidity,soilMoisture";
                const rows = rawReadings
                  .map((r) => {
                    const d = new Date(r.created_at);
                    const iso = d.toISOString();
                    return [iso, r.temperature, r.humidity, r.sm_percent].join(
                      ",",
                    );
                  })
                  .join("\n");
                const csv = `${header}\n${rows}`;
                const { Share } = await import("react-native");
                try {
                  await Share.share({ message: csv });
                } catch (e) {
                  console.log("[TIMETABLE] share err:", e);
                }
              }}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderRadius: 8,
                backgroundColor: theme.accent,
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <MaterialCommunityIcons
                name="share-variant"
                size={18}
                color={theme.background}
              />
              <Text
                style={{
                  marginLeft: 8,
                  color: theme.background,
                  fontSize: 12,
                  fontWeight: "700",
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
};
