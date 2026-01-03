import { View, Text } from "react-native";
import { LineChart } from "react-native-gifted-charts";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ChartCardProps } from "./types";

export const ChartCard = ({ theme, title, icon, color, data }: ChartCardProps) => {
  if (data.length === 0) return null;

  return (
    <View style={{ marginBottom: 24, backgroundColor: theme.surface, borderRadius: 12, padding: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
        <MaterialCommunityIcons name={icon as any} size={24} color={color} />
        <Text style={{ marginLeft: 8, fontSize: 16, fontWeight: "600", color: theme.text }}>
          {title}
        </Text>
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
