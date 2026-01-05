import { View, Text, TouchableOpacity, Animated } from "react-native";
import { Ionicons, FontAwesome6, MaterialIcons, Entypo } from "@expo/vector-icons";
import { NodePopupProps } from "./types";
import { spacing } from "../../utils/responsive";

export const NodePopup = ({ theme, selectedNode, fadeAnim, onClose }: NodePopupProps) => {
  if (!selectedNode) return null;

  // figure out what color to use based on sensor value
  const getStatusInfo = (
    value: number,
    type: "moisture" | "temperature" | "humidity"
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
    unit: string
  ) => {
    const status = getStatusInfo(value, type);
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.background,
          borderRadius: spacing.sm,
          padding: spacing.sm,
          borderLeftWidth: 3,
          borderLeftColor: status.color,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: spacing.xs }}>
          <Text style={{ color: theme.textSecondary, fontSize: 10 }}>
            {label}
          </Text>
          {icon}
        </View>
        <View style={{ flexDirection: "row", alignItems: "baseline" }}>
          <Text style={{ color: theme.text, fontSize: 22, fontWeight: "600" }}>
            {value.toFixed(1)}
          </Text>
          <Text style={{ color: theme.textSecondary, fontSize: 11, marginLeft: 2 }}>
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
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        }}
      />

      <View
        style={{
          position: "absolute",
          top: 0,
          left: spacing.sm,
          right: spacing.sm,
        }}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => {}}
          style={{
            backgroundColor: theme.surface,
            borderRadius: spacing.sm + 2,
            padding: spacing.sm + 2,
            borderWidth: 1,
            borderColor: theme.accent + "30",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.2,
            shadowRadius: 6,
            elevation: 8,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: theme.accent,
                  marginRight: spacing.xs + 2,
                }}
              />
              <Text style={{ color: theme.text, fontSize: 15, fontWeight: "700" }}>
                {selectedNode.id.replace("node-", "Sensor ")}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={{
                padding: 3,
                borderRadius: spacing.sm,
                backgroundColor: theme.background,
              }}
            >
              <Ionicons name="close" size={18} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: "row", gap: spacing.xs + 2 }}>
            {renderMetric(
              selectedNode.moisture,
              "moisture",
              "Toprak Nemi",
              <Entypo name="air" size={18} color={getStatusInfo(selectedNode.moisture, "moisture").color} />,
              "%"
            )}
            {renderMetric(
              selectedNode.airTemperature,
              "temperature",
              "Hava Sicakligi",
              <FontAwesome6 name="temperature-three-quarters" size={18} color={getStatusInfo(selectedNode.airTemperature, "temperature").color} />,
              "°C"
            )}
            {renderMetric(
              selectedNode.airHumidity,
              "humidity",
              "Hava Nemi",
              <MaterialIcons name="water-drop" size={18} color={getStatusInfo(selectedNode.airHumidity, "humidity").color} />,
              "%"
            )}
          </View>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};
