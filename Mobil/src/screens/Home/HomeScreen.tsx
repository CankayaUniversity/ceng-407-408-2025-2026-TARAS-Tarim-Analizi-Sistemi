import { Suspense, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber/native";
import { Text, View, ActivityIndicator, ScrollView, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ColorPlane } from "../components/ColorPlane";
import { appStyles } from "../styles";
import { FontAwesome6, MaterialIcons, Entypo } from "@expo/vector-icons";
import LogoLight from "../assets/Taras-logo-light.svg";
import LogoDark from "../assets/Taras-logo-dark.svg";
import { fetchWeatherInfo, WeatherInfo } from "../utils/weatherAPI";
import { Theme } from "../utils/theme";

interface HomeScreenProps {
  theme: Theme;
  isDark: boolean;
}

interface MetricCardProps {
  title: string;
  value: string | null | React.ReactNode;
  unit?: string;
  icon: React.ReactNode;
  theme: Theme;
  loading: boolean;
}

const MetricCard = ({
  title,
  value,
  unit = " %",
  icon,
  theme,
  loading,
}: MetricCardProps) => {
  const { width } = useWindowDimensions();
  // Card gets ~half screen width due to flex: 1 in row layout
  const cardWidth = (width - 48) / 2 - 8; // 48 = total padding, 8 = margin between
  // Make font size proportional to actual card width
  const baseFontSize = Math.min(28, cardWidth * 0.18);

  return (
    <View style={{ flex: 1, marginHorizontal: 4, marginBottom: 12 }}>
      <View
        style={{
          backgroundColor: theme.surface,
          borderColor: theme.accent + "20",
          borderWidth: 1,
          borderRadius: 12,
          padding: 10,
          minHeight: 120,
          justifyContent: "space-between",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={{
              color: theme.textSecondary,
              fontSize: 12,
              fontWeight: "600",
              flex: 1,
            }}
          >
            {title}
          </Text>
          <View style={{ marginLeft: 4 }}>{icon}</View>
        </View>

        {loading ? (
          <View style={{ alignItems: "flex-start" }}>
            <ActivityIndicator size={32} color={theme.accent} />
          </View>
        ) : (
          <View style={{ alignItems: "flex-start", justifyContent: "flex-end", flex: 1 }}>
            {value !== null ? (
              typeof value === "string" ? (
                <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                  <Text
                    style={{
                      color: theme.text,
                      fontSize: baseFontSize,
                      fontWeight: "400",
                      lineHeight: baseFontSize * 1.1,
                    }}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {value}
                  </Text>
                  {unit && unit.trim() ? (
                    <Text
                      style={{
                        color: theme.textSecondary,
                        fontSize: baseFontSize * 0.5,
                        fontWeight: "400",
                        marginLeft: 2,
                      }}
                      numberOfLines={1}
                    >
                      {unit.trim()}
                    </Text>
                  ) : null}
                </View>
              ) : (
                <View>{value}</View>
              )
            ) : (
              <Text
                style={{
                  color: theme.text,
                  fontSize: baseFontSize,
                  fontWeight: "500",
                  lineHeight: baseFontSize * 1.1,
                }}
              >
                -
              </Text>
            )}
          </View>
        )}
      </View>
    </View>
  );
};

interface StatusCardProps {
  theme: Theme;
  weather: WeatherInfo | null;
  loading: boolean;
}

const StatusCard = ({ theme, weather, loading }: StatusCardProps) => {
  const airTemp = weather?.temperature.toFixed(1) ?? null;
  const airHumidity = weather?.humidity.toFixed(0) ?? null;
  const soilMoisture = "56"; // Placeholder

  const IrrigationCountdown = ({ theme }: { theme: Theme }) => {
    const { width } = useWindowDimensions();
    const cardWidth = (width - 48) / 2 - 8;
    const baseFontSize = Math.min(28, cardWidth * 0.18);
    
    const [hours, setHours] = useState<string>("00");
    const [minutes, setMinutes] = useState<string>("00");
    const [colonVisible, setColonVisible] = useState<boolean>(true);

    const computeRemaining = () => {
      const now = new Date();
      let nextNoon = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        12,
        0,
        0,
        0,
      );
      if (now >= nextNoon) {
        nextNoon = new Date(nextNoon.getTime() + 24 * 60 * 60 * 1000);
      }
      const diffMs = nextNoon.getTime() - now.getTime();
      const totalMinutes = Math.floor(diffMs / 60000);
      const h = Math.floor(totalMinutes / 60);
      const m = totalMinutes % 60;
      setHours(String(h).padStart(2, "0"));
      setMinutes(String(m).padStart(2, "0"));
    };

    useEffect(() => {
      computeRemaining();
      const colonInterval = setInterval(() => setColonVisible((c) => !c), 1000);
      const now = new Date();
      const msUntilNextMinute =
        (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
      let minuteInterval: any = null;
      const minuteTimeout: any = setTimeout(() => {
        computeRemaining();
        minuteInterval = setInterval(computeRemaining, 60 * 1000);
      }, msUntilNextMinute);

      return () => {
        clearInterval(colonInterval);
        clearTimeout(minuteTimeout);
        if (minuteInterval) clearInterval(minuteInterval);
      };
    }, []);

    return (
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text
          style={{
            color: theme.text,
            fontSize: baseFontSize,
            fontWeight: "400",
            lineHeight: baseFontSize * 1.1,
          }}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {hours}
        </Text>
        <View
          style={{
            width: baseFontSize * 0.5,
            alignItems: "center",
            justifyContent: "center",
            marginHorizontal: 2,
          }}
        >
          <Text
            style={{
              opacity: colonVisible ? 1 : 0,
              color: theme.text,
              fontSize: baseFontSize,
              fontWeight: "400",
              lineHeight: baseFontSize * 1.1,
            }}
          >
            {":"}
          </Text>
        </View>
        <Text
          style={{
            color: theme.text,
            fontSize: baseFontSize,
            fontWeight: "400",
            lineHeight: baseFontSize * 1.1,
          }}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {minutes}
        </Text>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 8 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        <MetricCard
          theme={theme}
          title="Hava Sıcaklığı"
          value={airTemp}
          unit=" °C"
          icon={
            <FontAwesome6
              name="temperature-three-quarters"
              size={22}
              color={theme.accent}
            />
          }
          loading={loading}
        />
        <MetricCard
          theme={theme}
          title="Hava Nemi"
          value={airHumidity}
          icon={
            <MaterialIcons name="water-drop" size={22} color={theme.accent} />
          }
          loading={loading}
        />
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        <MetricCard
          theme={theme}
          title="Sulamaya Kalan Süre"
          value={<IrrigationCountdown theme={theme} />}
          unit={""}
          icon={<FontAwesome6 name="clock" size={22} color={theme.accent} />}
          loading={false}
        />
        <MetricCard
          theme={theme}
          title="Toprak Nemi"
          value={soilMoisture}
          icon={<Entypo name="air" size={22} color={theme.accent} />}
          loading={false}
        />
      </View>
    </View>
  );
};

export const HomeScreen = ({ theme, isDark }: HomeScreenProps) => {
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const insets = useSafeAreaInsets();
  const [scrollY, setScrollY] = useState(0);


  useEffect(() => {
    setLoading(true);
    fetchWeatherInfo(39.92, 32.85) // Ankara coordinates
      .then(setWeather)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <View
        style={[
          appStyles.header,
          {
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingTop: Math.max(insets.top, 16),
          },
        ]}
      >
        <View style={{ marginLeft: 12 }}>
          {isDark ? (
            <LogoDark width={64} height={64} />
          ) : (
            <LogoLight width={64} height={64} />
          )}
        </View>
      </View>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        onScroll={(e) => setScrollY(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
      >
        <StatusCard theme={theme} weather={weather} loading={loading} />
      </ScrollView>

      <View
      pointerEvents="none"
      style={{
        position: "absolute",
        right: 10,
        top: Math.max(insets.top, 16) + 110 + scrollY, // ✅ scroll oldukça iner
        width: 10,   // daha kalın
        height: 90,  // daha büyük
        borderRadius: 999,
        backgroundColor: theme.textSecondary,
        opacity: 0.35,
      }}
    />


      <View style={[appStyles.canvasContainer, { position: "relative" }]}>
        <Canvas
          camera={{ position: [0, 16, 22.6], fov: 30 }}
          style={{ flex: 1 }}
        >
          <color attach="background" args={[theme.background]} />
          <Suspense fallback={null}>
            <ColorPlane isDark={isDark} />
          </Suspense>
        </Canvas>
      </View>
    </View>
  );
};
