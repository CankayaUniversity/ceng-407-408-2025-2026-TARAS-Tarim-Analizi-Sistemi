import { useState, useEffect } from "react";
import { View, Text, ScrollView, ActivityIndicator, RefreshControl, TouchableOpacity, Modal } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { appStyles } from "../../styles";
import { HEADER_TEXT } from "../../constants";
import { sensorAPI } from "../../utils/api";
import { ChartCard } from "./ChartCard";
import { SensorDataTable } from "./SensorDataTable";
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
  const [showTable, setShowTable] = useState(false);

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

      // Ensure readings are time-ordered so slices behave predictably
      const sortedReadings = [...readings].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      // Group readings by minute and average values per timestamp
      const groups = new Map<number, SensorReading[]>();
      for (const r of sortedReadings) {
        const d = new Date(r.created_at);
        const keyDate = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes());
        const key = keyDate.getTime();
        const bucket = groups.get(key);
        if (bucket) bucket.push(r); else groups.set(key, [r]);
      }

      const keys = Array.from(groups.keys()).sort((a, b) => a - b);

      const tempPoints: ChartDataPoint[] = [];
      const humPoints: ChartDataPoint[] = [];
      const soilPoints: ChartDataPoint[] = [];

      keys.forEach((k) => {
        const bucket = groups.get(k)!;
        const avg = (arr: number[]) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
        const date = new Date(k);
        const hh = date.getHours().toString().padStart(2, "0");
        const mm = date.getMinutes().toString().padStart(2, "0");
        const label = `${hh}:${mm}`;
        const ts = date.toISOString();

        tempPoints.push({ value: avg(bucket.map(b => b.temperature)), label, ts });
        humPoints.push({ value: avg(bucket.map(b => b.humidity)), label, ts });
        soilPoints.push({ value: avg(bucket.map(b => b.sm_percent)), label, ts });
      });

      setRawReadings(sortedReadings); // table shows all raw rows
      setTemperatureData(tempPoints);
      setHumidityData(humPoints);
      setSoilMoistureData(soilPoints);
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

        {/* Table Button only */}
        <View style={{ flexDirection: 'row', marginBottom: 16 }}>
          <TouchableOpacity
            onPress={() => setShowTable(true)}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 8,
              backgroundColor: theme.surface,
              borderWidth: 1,
              borderColor: theme.textSecondary + '30',
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <MaterialCommunityIcons name="table" size={16} color={theme.textSecondary} />
            <Text style={{ marginLeft: 6, color: theme.textSecondary, fontSize: 12, fontWeight: '600' }}>Tablo</Text>
          </TouchableOpacity>
        </View>

        <ChartCard theme={theme} title="Sicaklik (°C)" icon="thermometer" color="#FF6B6B" data={temperatureData} rawReadings={rawReadings} />
        <ChartCard theme={theme} title="Nem (%)" icon="water-percent" color="#4ECDC4" data={humidityData} rawReadings={rawReadings} />
        <ChartCard theme={theme} title="Toprak Nemi (%)" icon="flower" color="#95E1D3" data={soilMoistureData} rawReadings={rawReadings} />
      </View>

      {/* Table Modal */}
      <Modal visible={showTable} animationType="slide" onRequestClose={() => setShowTable(false)}>
        <View style={{ flex: 1, backgroundColor: theme.background, padding: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, marginTop: 12 }}>
            <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700' }}>{fieldName} - Son 72 Saat</Text>
            <TouchableOpacity onPress={() => setShowTable(false)} style={{ padding: 8 }}>
              <MaterialCommunityIcons name="close" size={22} color={theme.text} />
            </TouchableOpacity>
          </View>

          <SensorDataTable theme={theme} data={rawReadings} />

          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 }}>
            <TouchableOpacity
              onPress={async () => {
                // Create simple CSV string for sharing
                const header = 'timestamp,temperature,humidity,soilMoisture';
                const rows = rawReadings.map(r => {
                  const d = new Date(r.created_at);
                  const iso = d.toISOString();
                  return [iso, r.temperature, r.humidity, r.sm_percent].join(',');
                }).join('\n');
                const csv = `${header}\n${rows}`;
                // Share via RN Share API to keep it in-app (no file required)
                const { Share } = await import('react-native');
                try {
                  await Share.share({ message: csv });
                } catch (e) {
                  console.warn('Share failed', e);
                }
              }}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderRadius: 8,
                backgroundColor: theme.accent,
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              <MaterialCommunityIcons name="share-variant" size={18} color={theme.background} />
              <Text style={{ marginLeft: 8, color: theme.background, fontSize: 12, fontWeight: '700' }}>CSV Paylaş</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};
