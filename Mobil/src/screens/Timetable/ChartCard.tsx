import { View, Text, Dimensions, TouchableOpacity } from "react-native";
import { LineChart } from "react-native-gifted-charts";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useState } from "react";
import { ChartCardProps } from "./types";

export const ChartCard = ({ theme, title, icon, color, data, rawReadings = [] }: ChartCardProps) => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  if (data.length === 0) return null;

  const getSelectedPointInfo = () => {
    if (selectedIndex === null || !rawReadings[selectedIndex]) return null;
    const reading = rawReadings[selectedIndex];
    const date = new Date(reading.created_at);
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    const value = data[selectedIndex]?.value ?? 0;

    return {
      time: `${hours}:${minutes}`,
      value: value.toFixed(2),
    };
  };

  const selectedInfo = getSelectedPointInfo();
  const screenWidth = Dimensions.get("window").width;
  const chartWidth = Math.min(screenWidth - 32, 320); // Responsive width

  const enhancedData = data.map((point, index) => ({
    ...point,
    dataPointLabelComponent: selectedIndex === index ? () => (
      <View
        style={{
          backgroundColor: color,
          paddingHorizontal: 8,
          paddingVertical: 4,
          borderRadius: 4,
          marginTop: -20,
        }}
      >
        <Text style={{ color: theme.background, fontSize: 10, fontWeight: "bold" }}>
          {data[index].value.toFixed(1)}
        </Text>
      </View>
    ) : undefined,
  }));

  return (
    <View style={{ marginBottom: 24, backgroundColor: theme.surface, borderRadius: 12, padding: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
        <MaterialCommunityIcons name={icon as any} size={20} color={color} />
        <Text style={{ marginLeft: 8, fontSize: 13, fontWeight: "600", color: theme.text }}>
          {title}
        </Text>
      </View>

      {selectedInfo && (
        <TouchableOpacity
          onPress={() => setSelectedIndex(null)}
          style={{
            backgroundColor: color + "20",
            borderLeftWidth: 4,
            borderLeftColor: color,
            paddingHorizontal: 12,
            paddingVertical: 10,
            marginBottom: 12,
            borderRadius: 8,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: "600", color: color, marginBottom: 2 }}>
            {selectedInfo.time}
          </Text>
          <Text style={{ fontSize: 16, fontWeight: "bold", color: theme.text }}>
            {selectedInfo.value} {title.match(/°C|%/)?.[0] || ""}
          </Text>
        </TouchableOpacity>
      )}

      <View style={{ alignItems: "center" }}>
        <LineChart
          data={enhancedData}
          width={chartWidth}
          height={180}
          color={color}
          thickness={3}
          hideDataPoints={false}
          dataPointsColor={color}
          dataPointsRadius={selectedIndex !== null ? 6 : 4}
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
          isAnimated
          animationDuration={500}
          showVerticalLines
          verticalLinesColor={theme.textSecondary + "20"}
          onPress={(_: any, index: number) => {
            setSelectedIndex(index);
          }}
        />
      </View>

      {selectedIndex !== null && (
        <View style={{ marginTop: 12, alignItems: "center" }}>
          <Text style={{ fontSize: 12, color: theme.textSecondary }}>
            {rawReadings[selectedIndex]?.created_at ? new Date(rawReadings[selectedIndex].created_at).toLocaleDateString("tr-TR") : ""}
          </Text>
        </View>
      )}
    </View>
  );
};
