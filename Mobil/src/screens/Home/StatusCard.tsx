import { View } from "react-native";
import { FontAwesome6, MaterialIcons, Entypo } from "@expo/vector-icons";
import { MetricCard } from "./MetricCard";
import { IrrigationCountdown } from "./IrrigationCountdown";
import { StatusCardProps } from "./types";

export const StatusCard = ({ theme, dashboardData, loading }: StatusCardProps) => {
  const airTemp = dashboardData?.weather.airTemperature.toFixed(1) ?? null;
  const airHumidity = dashboardData?.weather.airHumidity.toFixed(0) ?? null;
  const soilMoisture = dashboardData?.sensors.soilMoisture.toString() ?? null;

  return (
    <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 4 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        <MetricCard
          theme={theme}
          title="Hava Sicakligi"
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
          title="Sulamaya Kalan Sure"
          value={<IrrigationCountdown theme={theme} isoTimestamp={dashboardData?.irrigation.nextIrrigationTime} />}
          unit={""}
          icon={<FontAwesome6 name="clock" size={22} color={theme.accent} />}
          loading={false}
        />
        <MetricCard
          theme={theme}
          title="Toprak Nemi"
          value={soilMoisture}
          icon={<Entypo name="air" size={22} color={theme.accent} />}
          loading={loading}
        />
      </View>
    </View>
  );
};
