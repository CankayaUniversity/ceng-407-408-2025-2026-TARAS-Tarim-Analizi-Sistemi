import { useState, useEffect } from "react";
import { View, Text, ScrollView, ActivityIndicator, RefreshControl } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { appStyles } from "../../styles";
import { HEADER_TEXT } from "../../constants";
import { sensorAPI } from "../../utils/api";
import { ChartCard } from "./ChartCard";
import { TimetableScreenProps, ChartDataPoint, SensorReading } from "./types";

export const TimetableScreen = ({ theme, isActive = true, selectedFieldId }: TimetableScreenProps) => {
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dataSource, setDataSource] = useState<'aws' | 'demo'>('demo');
  const [temperatureData, setTemperatureData] = useState<ChartDataPoint[]>([]);
  const [humidityData, setHumidityData] = useState<ChartDataPoint[]>([]);
  const [soilMoistureData, setSoilMoistureData] = useState<ChartDataPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fieldName, setFieldName] = useState("");
  const [rawReadings, setRawReadings] = useState<SensorReading[]>([]);

  const fetchSensorData = async () => {
    try {
      setError(null);

      if (!selectedFieldId) {
        setError("Tarla secilmedi");
        return;
      }

      console.log('🌐 [TIMETABLE] Fetching sensor data from AWS for field:', selectedFieldId);
      const response = await sensorAPI.getFieldHistory(selectedFieldId, 72);

      if (!response.success || !response.data) {
        console.warn('⚠️ [TIMETABLE] API returned null or error:', response.error);
        setError(response.error || "Sensor verileri yuklenemedi");
        return;
      }

      console.log('✅ [TIMETABLE AWS SUCCESS] Received readings for:', response.data.field_name);
      setDataSource('aws');

      const { readings, field_name } = response.data;
      if (!readings?.length) {
        setError("Bu tarla icin henuz veri bulunmuyor");
        return;
      }

      setFieldName(field_name);

      const toChartData = (accessor: (r: SensorReading) => number): ChartDataPoint[] =>
        readings.slice(-10).map((r, i) => {
          const date = new Date(r.created_at);
          return {
            value: accessor(r),
            label: i % 2 === 0 ? `${date.getHours()}:${date.getMinutes().toString().padStart(2, "0")}` : "",
          };
        });

      setRawReadings(readings.slice(-10));
      setTemperatureData(toChartData((r) => r.temperature));
      setHumidityData(toChartData((r) => r.humidity));
      setSoilMoistureData(toChartData((r) => r.sm_percent));
    } catch (error) {
      console.error('❌ [TIMETABLE ERROR] Fetch failed:', error);
      setError("Baglanti hatasi");
      setDataSource('demo');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchSensorData();
  }, [selectedFieldId]);

  useEffect(() => {
    if (!isActive) return;

    const pollInterval = setInterval(() => {
      fetchSensorData();
    }, 60000);

    return () => clearInterval(pollInterval);
  }, [isActive, selectedFieldId]);

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
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Text style={[appStyles.placeholderText, { color: theme.text }]}>
            {HEADER_TEXT.timetable}
          </Text>
          {/* Data Source Badge */}
          <View style={{
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 6,
            backgroundColor: dataSource === 'aws' ? '#10b981' : '#f59e0b',
          }}>
            <Text style={{ color: '#fff', fontSize: 10, fontWeight: '600' }}>
              {dataSource === 'aws' ? '🔗 AWS' : '📱 DEMO'}
            </Text>
          </View>
        </View>
        <Text style={[appStyles.placeholderSub, { color: theme.textSecondary, marginBottom: 24 }]}>
          {fieldName || "Yukleniyor..."} - Son 72 Saat
        </Text>

        <ChartCard theme={theme} title="Sicaklik (°C)" icon="thermometer" color="#FF6B6B" data={temperatureData} rawReadings={rawReadings} />
        <ChartCard theme={theme} title="Nem (%)" icon="water-percent" color="#4ECDC4" data={humidityData} rawReadings={rawReadings} />
        <ChartCard theme={theme} title="Toprak Nemi (%)" icon="flower" color="#95E1D3" data={soilMoistureData} rawReadings={rawReadings} />
      </View>
    </ScrollView>
  );
};
