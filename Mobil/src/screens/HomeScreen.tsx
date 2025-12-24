import { Suspense, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Canvas } from '@react-three/fiber/native';
import { Text, View, ActivityIndicator } from 'react-native';
import { ColorPlane } from '../../Plane';
import { HEADER_TEXT } from '../constants';
import { appStyles } from '../styles';
import { FontAwesome6, MaterialIcons, Entypo } from '@expo/vector-icons'; 
import { fetchWeatherInfo, WeatherInfo } from '../../weatherAPI';

interface HomeScreenProps {
  theme: any;
  effectiveIsDark: boolean;
}

interface MetricItemProps {
  label: string;
  value: string | null;
  unit?: string;
  icon: ReactNode;
  theme: any;
}

const MetricItem = ({ label, value, unit, icon, theme }: MetricItemProps) => {
  return (
    <View style={{ flex: 1, flexDirection: 'row', marginBottom: 16 }}>
      {/* Icon */}
      <View style={{ marginRight: 8, justifyContent: 'center' }}>
        {icon}
      </View>

      {/* Label + Value */}
      <View>
        <Text
          style={{
            color: theme.textSecondary,
            fontSize: 12,
            marginBottom: 2,
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            color: theme.text,
            fontSize: 18,
            fontWeight: '700',
          }}
        >
          {value !== null ? `${unit ?? '%'}${value}` : '-'}
        </Text>
      </View>
    </View>
  );
};

interface StatusCardProps {
  theme: any;
  weather: WeatherInfo | null;
  loading: boolean;
}

const StatusCard = ({ theme, weather, loading }: StatusCardProps) => {
  // 🔸 Open-Meteo'dan gelenler
  const airTemp = weather ? weather.temperature.toFixed(1) : null;   // "24.3"
  const airHumidity = weather ? weather.humidity.toFixed(0) : null;  // "40"

  // 🔸 Şimdilik mock sensör verileri (sonra endpoint ile değiştireceğiz)
  const soilMoisture = '40';
  const soilLossRate = '40';

  return (
    <View style={{ paddingHorizontal: 24, marginTop: 16 }}>
      <View
        style={{
          borderRadius: 16,
          borderWidth: 1,
          borderColor: theme.accent,
          padding: 16,
          backgroundColor: (theme as any).cardBackground ?? theme.background,
        }}
      >
        {loading && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginBottom: 8,
            }}
          >
            <ActivityIndicator size="small" color={theme.accent} />
            <Text
              style={{
                marginLeft: 8,
                color: theme.textSecondary,
                fontSize: 12,
              }}
            >
              Hava verisi yükleniyor...
            </Text>
          </View>
        )}

        {/* Üst satır: Hava Sıcaklığı / Hava Nemi */}
        <View style={{ flexDirection: 'row' }}>
          <MetricItem
            theme={theme}
            label="Hava Sıcaklığı"
            value={airTemp}
            unit="°C "
            icon={
              <FontAwesome6
                name="temperature-three-quarters"
                size={24}
                color={theme.text}
              />
            }
          />
          <View style={{ width: 12 }} />
          <MetricItem
            theme={theme}
            label="Hava Nemi"
            value={airHumidity}
            unit="%"
            icon={
              <MaterialIcons
                name="water-drop"
                size={24}
                color={theme.text}
              />
            }
          />
        </View>

        {/* Alt satır: Toprak Nem Kaybı / Toprak Nemi */}
        <View style={{ flexDirection: 'row', marginTop: 4 }}>
          <MetricItem
            theme={theme}
            label="Nem Kaybı"
            value={soilLossRate}
            unit="%"
            icon={
              <FontAwesome6
                name="droplet-slash"
                size={24}
                color={theme.text}
              />
            }
          />
          <View style={{ width: 12 }} />
          <MetricItem
            theme={theme}
            label="Toprak Nemi"
            value={soilMoisture}
            unit="%"
            icon={
              <Entypo
                name="air"
                size={24}
                color={theme.text}
              />
            }
          />
        </View>
      </View>
    </View>
  );
};


export const HomeScreen = ({ theme, effectiveIsDark }: HomeScreenProps) => {
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const[loading, setLoading] = useState<boolean>(false);
    useEffect(() => {
    const loadWeather = async () => {
      try {
        setLoading(true);

        // Şimdilik sabit koordinat (Berlin örneği senin verdiğin):
        const result = await fetchWeatherInfo(39.92, 32.85);

        console.log('Open-Meteo sonucu:', result);
        setWeather(result);
      } catch (err) {
        console.log('Weather API hatası:', err);
      } finally {
        setLoading(false);
      }
    };

    loadWeather();
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
      <View style={appStyles.spacer} />
      <View style={appStyles.canvasContainer}>
        <Canvas camera={{ position: [0, 8, 11.3], fov: 50 }} style={{ flex: 1 }}>
          <color attach="background" args={[theme.background]} />
          <Suspense fallback={null}>
            <ColorPlane isDark={effectiveIsDark} />
          </Suspense>
        </Canvas>
      </View>
    </>
  );
};
