import { Suspense, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber/native';
import { Text, View, ActivityIndicator } from 'react-native';
import { ColorPlane } from '../components/ColorPlane';
import { HEADER_TEXT } from '../constants';
import { appStyles } from '../styles';
import { FontAwesome6, MaterialIcons, Entypo } from '@expo/vector-icons'; 
import { fetchWeatherInfo, WeatherInfo } from '../utils/weatherAPI';
interface HomeScreenProps {
  theme: Theme;
  isDark: boolean;
}

interface MetricItemProps {
  label: string;
  value: string | null;
  unit?: string;
  icon: React.ReactNode;
  theme: Theme;
}

const MetricItem = ({ label, value, unit = '%', icon, theme }: MetricItemProps) => (
  <View style={{ flex: 1, flexDirection: 'row', marginBottom: 16 }}>
    <View style={{ marginRight: 8, justifyContent: 'center' }}>{icon}</View>
    <View>
      <Text style={{ color: theme.textSecondary, fontSize: 12, marginBottom: 2 }}>{label}</Text>
      <Text style={{ color: theme.text, fontSize: 18, fontWeight: '700' }}>
        {value !== null ? `${unit}${value}` : '-'}
      </Text>
    </View>
  </View>
);

interface StatusCardProps {
  theme: Theme;
  weather: WeatherInfo | null;
  loading: boolean;
}

const StatusCard = ({ theme, weather, loading }: StatusCardProps) => {
  const airTemp = weather?.temperature.toFixed(1) ?? null;
  const airHumidity = weather?.humidity.toFixed(0) ?? null;
  const soilMoisture = '40'; // Mock data - replace with real sensor data
  const irrigationTime = '40'; // Mock data

  return (
    <View style={{ paddingHorizontal: 24, marginTop: 16 }}>
      <View style={{ borderRadius: 16, borderWidth: 1, borderColor: theme.accent, padding: 16, backgroundColor: theme.surface }}>
        {loading && (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <ActivityIndicator size="small" color={theme.accent} />
            <Text style={{ marginLeft: 8, color: theme.textSecondary, fontSize: 12 }}>Hava verisi yükleniyor...</Text>
          </View>
        )}

        <View style={{ flexDirection: 'row' }}>
          <MetricItem theme={theme} label="Hava Sıcaklığı" value={airTemp} unit="°C " icon={<FontAwesome6 name="temperature-three-quarters" size={24} color={theme.text} />} />
          <View style={{ width: 12 }} />
          <MetricItem theme={theme} label="Hava Nemi" value={airHumidity} icon={<MaterialIcons name="water-drop" size={24} color={theme.text} />} />
        </View>

        <View style={{ flexDirection: 'row', marginTop: 4 }}>
          <MetricItem theme={theme} label="Sulama Saati" value={irrigationTime} icon={<FontAwesome6 name="clock" size={24} color={theme.text} />} />
          <View style={{ width: 12 }} />
          <MetricItem theme={theme} label="Toprak Nemi" value={soilMoisture} icon={<Entypo name="air" size={24} color={theme.text} />} />
        </View>
      </View>
    </View>
  );
};


export const HomeScreen = ({ theme, isDark }: HomeScreenProps) => {
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchWeatherInfo(39.92, 32.85) // Ankara coordinates
      .then(setWeather)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <View style={appStyles.header}>
        <Text style={[appStyles.headerTitle, { color: theme.accent }]}>{HEADER_TEXT.home}</Text>
        <Text style={[appStyles.headerSubtitle, { color: theme.textSecondary }]}>
          Döndürmek için sürükleyin • Rengi değiştirmek için dokunun
        </Text>
      </View>
      <StatusCard theme={theme} weather={weather} loading={loading} />
      <View style={appStyles.canvasContainer}>
        <Canvas camera={{ position: [0, 16, 22.6], fov: 35 }} style={{ flex: 1 }}>
          <color attach="background" args={[theme.background]} />
          <Suspense fallback={null}>
            <ColorPlane isDark={isDark} />
          </Suspense>
        </Canvas>
      </View>
    </>
  );
};
