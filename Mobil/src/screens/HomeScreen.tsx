import { Suspense, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber/native";
import { Text, View, ActivityIndicator } from "react-native";
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
}: MetricCardProps) => (
  <View className="flex-1 mx-1">
    <View
      className="rounded-xl border p-3 mb-3"
      style={{
        backgroundColor: theme.surface,
        borderColor: theme.accent + "20",
        minHeight: 120,
        justifyContent: "space-between",
        paddingVertical: 12,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          style={{
            color: theme.textSecondary,
            fontSize: 14,
            fontWeight: "600",
          }}
        >
          {title}
        </Text>
        <View>{icon}</View>
      </View>

      {loading ? (
        <View style={{ alignItems: "flex-start" }}>
          <ActivityIndicator size={44} color={theme.accent} />
        </View>
      ) : (
        <View style={{ alignItems: "flex-start" }}>
          {value !== null ? (
            typeof value === "string" ? (
              <View style={{ flexDirection: "row", alignItems: "baseline" }}>
                <Text
                  style={{
                    color: theme.text,
                    fontSize: 64,
                    fontWeight: "400",
                    lineHeight: 52,
                  }}
                >
                  {value}
                </Text>
                {unit ? (
                  <Text
                    style={{
                      color: theme.textSecondary,
                      fontSize: 16,
                      fontWeight: "400",
                      marginLeft: 6,
                    }}
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
                fontSize: 48,
                fontWeight: "500",
                lineHeight: 40,
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
            fontSize: 64,
            fontWeight: "400",
            lineHeight: 52,
          }}
        >
          {hours}
        </Text>
        <View
          style={{
            width: 14,
            alignItems: "center",
            justifyContent: "center",
            marginHorizontal: 4,
          }}
        >
          <Text
            style={{
              opacity: colonVisible ? 1 : 0,
              color: theme.text,
              fontSize: 64,
              fontWeight: "400",
              lineHeight: 52,
            }}
          >
            {":"}
          </Text>
        </View>
        <Text
          style={{
            color: theme.text,
            fontSize: 64,
            fontWeight: "400",
            lineHeight: 52,
          }}
        >
          {minutes}
        </Text>
      </View>
    );
  };

  return (
    <View className="px-4 mt-2">
      <View className="flex-row flex-wrap">
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

      <View className="flex-row flex-wrap">
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

  useEffect(() => {
    setLoading(true);
    fetchWeatherInfo(39.92, 32.85) // Ankara coordinates
      .then(setWeather)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <View
        style={[
          appStyles.header,
          {
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
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
      <StatusCard theme={theme} weather={weather} loading={loading} />
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
    </>
  );
};
