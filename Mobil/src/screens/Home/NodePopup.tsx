// Sensor node popup - secilen noktanin nem, sicaklik, nem verilerini gosterir
// Props: theme, selectedNode, fadeAnim, onClose

import { View, Text, TouchableOpacity, Animated } from "react-native";
import {
  Ionicons,
  FontAwesome6,
  MaterialIcons,
  Entypo,
} from "@expo/vector-icons";
import { NodePopupProps } from "./types";
import { spacing } from "../../utils/responsive";
import { useLanguage } from "../../context/LanguageContext";

export const NodePopup = ({
  theme,
  selectedNode,
  fadeAnim,
  onClose,
}: NodePopupProps) => {
  const { t } = useLanguage();

  if (!selectedNode) return null;

  // figure out what color to use based on sensor value
  const getStatusInfo = (
    value: number,
    type: "moisture" | "temperature" | "humidity",
  ): { color: string; status: "ideal" | "high" | "low" } => {
    const accent = theme.accent;
    const red = "#ef4444";
    const blue = "#2563eb";

    switch (type) {
      case "moisture":
        if (value < 30) return { color: red, status: "low" };
        if (value > 70) return { color: blue, status: "high" };
        return { color: accent, status: "ideal" };
      case "temperature":
        if (value < 18) return { color: blue, status: "low" };
        if (value > 30) return { color: red, status: "high" };
        return { color: accent, status: "ideal" };
      case "humidity":
        if (value < 40) return { color: red, status: "low" };
        if (value > 70) return { color: blue, status: "high" };
        return { color: accent, status: "ideal" };
    }
  };

  const renderMetric = (
    value: number,
    type: "moisture" | "temperature" | "humidity",
    label: string,
    icon: React.ReactNode,
    unit: string,
  ) => {
    const status = getStatusInfo(value, type);
    return (
      <View
        className="screen-bg rounded-lg p-2"
        style={{
          borderLeftWidth: 3,
          borderLeftColor: status.color,
        }}
      >
        <View className="flex-row items-start justify-between mb-1">
          <Text className="text-secondary text-[10px]">
            {label}
          </Text>
          {icon}
        </View>
        <View className="flex-row items-baseline">
          <Text className="text-primary text-[22px] font-semibold">
            {value.toFixed(1)}
          </Text>
          <Text className="text-secondary text-[11px] ml-0.5">
            {unit}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        opacity: fadeAnim,
        zIndex: 101,
      }}
    >
      {/* tap anywhere outside to close */}
      <TouchableOpacity
        activeOpacity={1}
        onPress={onClose}
        className="absolute top-0 left-0 right-0 bottom-0"
      />

      <View
        className="absolute top-0"
        style={{ left: spacing.sm, right: spacing.sm }}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => {}}
          className="surface-bg rounded-xl p-3"
          style={{
            borderWidth: 1,
            borderColor: theme.accent + "30",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.2,
            shadowRadius: 6,
            elevation: 8,
          }}
        >
          <View className="row-between mb-2">
            <View className="row">
              <View
                className="w-2 h-2 rounded-full bg-slateGrey-500"
                style={{ marginRight: spacing.xs + 2 }}
              />
              <Text className="text-primary text-[15px] font-bold">
                {selectedNode.id.replace("node-", `${t.nodePopup.sensor} `)}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              className="p-0.5 rounded-lg bg-platinum-50 dark:bg-onyx-950"
            >
              <Ionicons name="close" size={18} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          <View className="flex-row" style={{ gap: spacing.xs + 2 }}>
            {renderMetric(
              selectedNode.moisture,
              "moisture",
              t.nodePopup.soilMoisture,
              <Entypo
                name="air"
                size={18}
                color={getStatusInfo(selectedNode.moisture, "moisture").color}
              />,
              "%",
            )}
            {renderMetric(
              selectedNode.airTemperature,
              "temperature",
              t.nodePopup.airTemperature,
              <FontAwesome6
                name="temperature-three-quarters"
                size={18}
                color={
                  getStatusInfo(selectedNode.airTemperature, "temperature")
                    .color
                }
              />,
              "°C",
            )}
            {renderMetric(
              selectedNode.airHumidity,
              "humidity",
              t.nodePopup.airHumidity,
              <MaterialIcons
                name="water-drop"
                size={18}
                color={
                  getStatusInfo(selectedNode.airHumidity, "humidity").color
                }
              />,
              "%",
            )}
          </View>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};
