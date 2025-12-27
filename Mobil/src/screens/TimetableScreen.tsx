import { useState, useEffect } from 'react';
import { View, Text, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { appStyles } from '../styles';
import { HEADER_TEXT } from '../constants';
import { sensorAPI } from '../utils/api';
import { Theme } from '../types';

interface TimetableScreenProps {
  theme: Theme;
}

interface SensorReading {
  sensor_node_id: string;
  sensor_type: string;
  value: number;
  unit: string;
  timestamp: string;
}

interface ChartDataPoint {
  value: number;
  label?: string;
}

export const TimetableScreen = ({ theme }: TimetableScreenProps) => {
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [temperatureData, setTemperatureData] = useState<ChartDataPoint[]>([]);
  const [humidityData, setHumidityData] = useState<ChartDataPoint[]>([]);
  const [soilMoistureData, setSoilMoistureData] = useState<ChartDataPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [zoneName, setZoneName] = useState('');

  const fetchSensorData = async () => {
    try {
      setError(null);

      const zonesResponse = await sensorAPI.getUserZones();

      if (!zonesResponse.success || !zonesResponse.data?.zones.length) {
        setError(zonesResponse.error || 'Erişilebilir zona bulunamadı');
        return;
      }

      const firstZone = zonesResponse.data.zones[0];
      setZoneName(`${firstZone.zone_name} - ${firstZone.field_name}`);

      const response = await sensorAPI.getZoneHistory(firstZone.zone_id, 24);

      if (!response.success || !response.data) {
        setError(response.error || 'Sensör verileri yüklenemedi');
        return;
      }

      const readings = response.data.readings;
      if (!readings?.length) {
        setError('Bu zona için henüz veri bulunmuyor');
        return;
      }

      const toChartData = (arr: SensorReading[]): ChartDataPoint[] =>
        arr.slice(-10).map((r, i) => {
          const date = new Date(r.timestamp);
          return {
            value: r.value,
            label: i % 2 === 0 ? `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}` : '',
          };
        });

      setTemperatureData(toChartData(readings.filter(r => r.sensor_type === 'temperature')));
      setHumidityData(toChartData(readings.filter(r => r.sensor_type === 'humidity')));
      setSoilMoistureData(toChartData(readings.filter(r => r.sensor_type === 'soil_moisture')));
    } catch {
      setError('Bağlantı hatası');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchSensorData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchSensorData();
  };

  if (isLoading) {
    return (
      <View style={[appStyles.placeholder, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.accent} />
        <Text style={[appStyles.placeholderSub, { color: theme.textSecondary, marginTop: 16 }]}>
          Sensör verileri yükleniyor...
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.background }}
        contentContainerStyle={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.accent]} />}
      >
        <MaterialCommunityIcons name="alert-circle" size={48} color={theme.accent} style={{ marginBottom: 16 }} />
        <Text style={[appStyles.placeholderText, { color: theme.text }]}>Veri Yüklenemedi</Text>
        <Text style={[appStyles.placeholderSub, { color: theme.textSecondary }]}>{error}</Text>
        <Text style={[appStyles.placeholderSub, { color: theme.textSecondary, marginTop: 8 }]}>
          Yenilemek için aşağı çekin
        </Text>
      </ScrollView>
    );
  }

  const ChartCard = ({ title, icon, color, data }: { title: string; icon: string; color: string; data: ChartDataPoint[] }) => {
    if (data.length === 0) return null;
    return (
      <View style={{ marginBottom: 24, backgroundColor: theme.surface, borderRadius: 12, padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <MaterialCommunityIcons name={icon as any} size={24} color={color} />
          <Text style={{ marginLeft: 8, fontSize: 16, fontWeight: '600', color: theme.text }}>{title}</Text>
        </View>
        <LineChart
          data={data}
          width={280}
          height={180}
          color={color}
          thickness={2}
          hideDataPoints={false}
          dataPointsColor={color}
          xAxisColor={theme.textSecondary}
          yAxisColor={theme.textSecondary}
          xAxisLabelTextStyle={{ color: theme.textSecondary, fontSize: 10 }}
          yAxisTextStyle={{ color: theme.textSecondary, fontSize: 10 }}
          curved
          areaChart
          startFillColor={color}
          endFillColor={theme.background}
          startOpacity={0.3}
          endOpacity={0}
        />
      </View>
    );
  };

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
          {zoneName || 'Yükleniyor...'} - Son 24 Saat
        </Text>

        <ChartCard title="Sıcaklık (°C)" icon="thermometer" color="#FF6B6B" data={temperatureData} />
        <ChartCard title="Nem (%)" icon="water-percent" color="#4ECDC4" data={humidityData} />
        <ChartCard title="Toprak Nemi (%)" icon="flower" color="#95E1D3" data={soilMoistureData} />
      </View>
    </ScrollView>
  );
};
