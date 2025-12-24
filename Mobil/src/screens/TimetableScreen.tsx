import { useState, useEffect } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Dimensions, RefreshControl } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { appStyles } from '../styles';
import { HEADER_TEXT } from '../constants';
import { sensorAPI } from '../utils/api';

interface TimetableScreenProps {
  theme: any;
}

interface SensorReading {
  sensor_node_id: string;
  sensor_type: string;
  value: number;
  unit: string;
  timestamp: string;
}

export const TimetableScreen = ({ theme }: TimetableScreenProps) => {
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [temperatureData, setTemperatureData] = useState<number[]>([]);
  const [humidityData, setHumidityData] = useState<number[]>([]);
  const [soilMoistureData, setSoilMoistureData] = useState<number[]>([]);
  const [labels, setLabels] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [zoneName, setZoneName] = useState<string>('');
  const [zoneId, setZoneId] = useState<string | null>(null);

  const fetchSensorData = async () => {
    try {
      setError(null);
      
      // Step 1: Get available zones
      console.log('Step 1: Fetching zones...');
      const zonesResponse = await sensorAPI.getUserZones();
      
      if (!zonesResponse.success || !zonesResponse.data?.zones.length) {
        setError(zonesResponse.error || 'Erişilebilir zona bulunamadı');
        setIsLoading(false);
        setRefreshing(false);
        return;
      }
      
      // Use the first available zone
      const firstZone = zonesResponse.data.zones[0];
      const currentZoneId = firstZone.zone_id;
      setZoneId(currentZoneId);
      setZoneName(`${firstZone.zone_name} - ${firstZone.field_name}`);
      
      console.log('Step 2: Fetching sensor data for zone:', currentZoneId);
      
      // Step 2: Get sensor data for the zone
      const response = await sensorAPI.getZoneHistory(currentZoneId, 24);
      
      console.log('Step 3: Got sensor response:', response.success);
      console.log('Response has data:', !!response.data);
      
      if (response.success && response.data) {
        const readings = response.data.readings;
        console.log('Number of readings:', readings?.length || 0);
        
        if (!readings || readings.length === 0) {
          console.log('No readings available for this zone');
          setError('Bu zona için henüz veri bulunmuyor');
          setIsLoading(false);
          setRefreshing(false);
          return;
        }
        
        // Group readings by sensor type
        const tempReadings = readings.filter(r => r.sensor_type === 'temperature');
        const humidReadings = readings.filter(r => r.sensor_type === 'humidity');
        const soilReadings = readings.filter(r => r.sensor_type === 'soil_moisture');
        
        console.log('Temp readings:', tempReadings.length, 'Humid:', humidReadings.length, 'Soil:', soilReadings.length);
        
        // Take last 10 readings for each type
        const getLastN = (arr: SensorReading[], n: number = 10) => arr.slice(-n);
        
        const lastTemp = getLastN(tempReadings);
        const lastHumid = getLastN(humidReadings);
        const lastSoil = getLastN(soilReadings);
        
        // Extract values
        setTemperatureData(lastTemp.map(r => r.value));
        setHumidityData(lastHumid.map(r => r.value));
        setSoilMoistureData(lastSoil.map(r => r.value));
        
        // Extract time labels from temperature readings
        const timeLabels = lastTemp.map(r => {
          const date = new Date(r.timestamp);
          return `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
        });
        setLabels(timeLabels.length > 0 ? timeLabels : ['--']);
        
        console.log('Data successfully processed and set');
      } else {
        console.log('Response error:', response.error);
        setError(response.error || 'Sensör verileri yüklenemedi');
      }
    } catch (error) {
      console.error('Sensor fetch error:', error);
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

  const screenWidth = Dimensions.get('window').width;

  const chartConfig = {
    backgroundGradientFrom: theme.background,
    backgroundGradientTo: theme.background,
    color: (opacity = 1) => `rgba(76, 175, 80, ${opacity})`,
    strokeWidth: 2,
    useShadowColorFromDataset: false,
    decimalPlaces: 1,
    propsForLabels: {
      fontSize: 10,
      fill: theme.textSecondary,
    },
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

        {/* Temperature Chart */}
        {temperatureData.length > 0 && (
          <View style={{ marginBottom: 24, backgroundColor: theme.surface, borderRadius: 12, padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <MaterialCommunityIcons name="thermometer" size={24} color="#FF6B6B" />
              <Text style={{ marginLeft: 8, fontSize: 16, fontWeight: '600', color: theme.text }}>
                Sıcaklık (°C)
              </Text>
            </View>
            <LineChart
              data={{
                labels: labels,
                datasets: [{ data: temperatureData, color: () => '#FF6B6B', strokeWidth: 2 }],
              }}
              width={screenWidth - 64}
              height={200}
              chartConfig={{ ...chartConfig, color: () => '#FF6B6B' }}
              bezier
              style={{ borderRadius: 8 }}
            />
          </View>
        )}

        {/* Humidity Chart */}
        {humidityData.length > 0 && (
          <View style={{ marginBottom: 24, backgroundColor: theme.surface, borderRadius: 12, padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <MaterialCommunityIcons name="water-percent" size={24} color="#4ECDC4" />
              <Text style={{ marginLeft: 8, fontSize: 16, fontWeight: '600', color: theme.text }}>
                Nem (%)
              </Text>
            </View>
            <LineChart
              data={{
                labels: labels,
                datasets: [{ data: humidityData, color: () => '#4ECDC4', strokeWidth: 2 }],
              }}
              width={screenWidth - 64}
              height={200}
              chartConfig={{ ...chartConfig, color: () => '#4ECDC4' }}
              bezier
              style={{ borderRadius: 8 }}
            />
          </View>
        )}

        {/* Soil Moisture Chart */}
        {soilMoistureData.length > 0 && (
          <View style={{ marginBottom: 24, backgroundColor: theme.surface, borderRadius: 12, padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <MaterialCommunityIcons name="flower" size={24} color="#95E1D3" />
              <Text style={{ marginLeft: 8, fontSize: 16, fontWeight: '600', color: theme.text }}>
                Toprak Nemi (%)
              </Text>
            </View>
            <LineChart
              data={{
                labels: labels,
                datasets: [{ data: soilMoistureData, color: () => '#95E1D3', strokeWidth: 2 }],
              }}
              width={screenWidth - 64}
              height={200}
              chartConfig={{ ...chartConfig, color: () => '#95E1D3' }}
              bezier
              style={{ borderRadius: 8 }}
            />
          </View>
        )}
      </View>
    </ScrollView>
  );
};
