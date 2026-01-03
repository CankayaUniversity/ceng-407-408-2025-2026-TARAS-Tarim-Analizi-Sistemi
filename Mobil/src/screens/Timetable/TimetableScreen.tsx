import { useState, useEffect } from "react";
import { View, Text, ScrollView, ActivityIndicator, RefreshControl } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { appStyles } from "../../styles";
import { HEADER_TEXT } from "../../constants";
import { sensorAPI } from "../../utils/api";
import { ChartCard } from "./ChartCard";
import { TimetableScreenProps, ChartDataPoint, SensorReading } from "./types";

export const TimetableScreen = ({ theme, isActive = true }: TimetableScreenProps) => {
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [temperatureData, setTemperatureData] = useState<ChartDataPoint[]>([]);
  const [humidityData, setHumidityData] = useState<ChartDataPoint[]>([]);
  const [soilMoistureData, setSoilMoistureData] = useState<ChartDataPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [zoneName, setZoneName] = useState("");

  const fetchSensorData = async () => {
    try {
      setError(null);

      const zonesResponse = await sensorAPI.getUserZones();

      if (!zonesResponse.success || !zonesResponse.data?.zones.length) {
        setError(zonesResponse.error || "Erisilebilir zona bulunamadi");
        return;
      }

      const firstZone = zonesResponse.data.zones[0];
      setZoneName(`${firstZone.zone_name} - ${firstZone.field_name}`);

      const response = await sensorAPI.getZoneHistory(firstZone.zone_id, 24);

      if (!response.success || !response.data) {
        setError(response.error || "Sensor verileri yuklenemedi");
        return;
      }

      const readings = response.data.readings;
      if (!readings?.length) {
        setError("Bu zona icin henuz veri bulunmuyor");
        return;
      }

      const toChartData = (arr: SensorReading[]): ChartDataPoint[] =>
        arr.slice(-10).map((r, i) => {
          const date = new Date(r.timestamp);
          return {
            value: r.value,
            label: i % 2 === 0 ? `${date.getHours()}:${date.getMinutes().toString().padStart(2, "0")}` : "",
          };
        });

      setTemperatureData(toChartData(readings.filter((r: SensorReading) => r.sensor_type === "temperature")));
      setHumidityData(toChartData(readings.filter((r: SensorReading) => r.sensor_type === "humidity")));
      setSoilMoistureData(toChartData(readings.filter((r: SensorReading) => r.sensor_type === "soil_moisture")));
    } catch {
      setError("Baglanti hatasi");
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchSensorData();
  }, []);

  useEffect(() => {
    if (!isActive) return;

    const pollInterval = setInterval(() => {
      fetchSensorData();
    }, 60000);

    return () => clearInterval(pollInterval);
  }, [isActive]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchSensorData();
  };

  if (isLoading) {
    return (
      <View style={[appStyles.placeholder, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.accent} />
        <Text style={[appStyles.placeholderSub, { color: theme.textSecondary, marginTop: 16 }]}>
          Sensor verileri yukleniyor...
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.background }}
        contentContainerStyle={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.accent]} />}
      >
        <MaterialCommunityIcons name="alert-circle" size={48} color={theme.accent} style={{ marginBottom: 16 }} />
        <Text style={[appStyles.placeholderText, { color: theme.text }]}>Veri Yuklenemedi</Text>
        <Text style={[appStyles.placeholderSub, { color: theme.textSecondary }]}>{error}</Text>
        <Text style={[appStyles.placeholderSub, { color: theme.textSecondary, marginTop: 8 }]}>
          Yenilemek icin asagi cekin
        </Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.accent]} />}
    >
      <View style={{ padding: 16 }}>
        <Text style={[appStyles.placeholderText, { color: theme.text, marginBottom: 8 }]}>
          {HEADER_TEXT.timetable}
        </Text>
        <Text style={[appStyles.placeholderSub, { color: theme.textSecondary, marginBottom: 24 }]}>
          {zoneName || "Yukleniyor..."} - Son 24 Saat
        </Text>

        <ChartCard theme={theme} title="Sicaklik (°C)" icon="thermometer" color="#FF6B6B" data={temperatureData} />
        <ChartCard theme={theme} title="Nem (%)" icon="water-percent" color="#4ECDC4" data={humidityData} />
        <ChartCard theme={theme} title="Toprak Nemi (%)" icon="flower" color="#95E1D3" data={soilMoistureData} />
      </View>
    </ScrollView>
  );
};
