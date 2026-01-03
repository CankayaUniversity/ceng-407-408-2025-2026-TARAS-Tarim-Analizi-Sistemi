import { View, Text, TouchableOpacity, Animated } from "react-native";
import { Ionicons, FontAwesome6, MaterialIcons, Entypo } from "@expo/vector-icons";
import { NodePopupProps } from "./types";

export const NodePopup = ({ theme, selectedNode, fadeAnim, onClose }: NodePopupProps) => {
  if (!selectedNode) return null;

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

  const getStatusLabel = (status: "ideal" | "high" | "low", type: "moisture" | "temperature" | "humidity") => {
    if (status === "ideal") return "Uygun";
    if (type === "moisture") {
      return status === "low" ? "Kuru" : "Islak";
    }
    if (type === "temperature") {
      return status === "low" ? "Soguk" : "Sicak";
    }
    if (type === "humidity") {
      return status === "low" ? "Kuru" : "Nemli";
    }
    return "";
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
          borderRadius: 10,
          padding: 12,
          borderLeftWidth: 3,
          borderLeftColor: status.color,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          {icon}
          <View
            style={{
              paddingHorizontal: 6,
              paddingVertical: 2,
              borderRadius: 4,
              backgroundColor: status.color + "20",
            }}
          >
            <Text style={{ color: status.color, fontSize: 10, fontWeight: "600" }}>
              {getStatusLabel(status.status, type)}
            </Text>
          </View>
        </View>
        <Text style={{ color: theme.textSecondary, fontSize: 11, marginBottom: 4 }}>
          {label}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "baseline" }}>
          <Text style={{ color: theme.text, fontSize: 28, fontWeight: "600" }}>
            {type === "temperature" ? value.toFixed(1) : value}
          </Text>
          <Text style={{ color: theme.textSecondary, fontSize: 12, marginLeft: 2 }}>
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
        top: 12,
        left: 12,
        right: 12,
        opacity: fadeAnim,
        zIndex: 101,
      }}
    >
      <View
        style={{
          backgroundColor: theme.surface,
          borderRadius: 12,
          padding: 16,
          borderWidth: 1,
          borderColor: theme.accent + "30",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
          elevation: 10,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: theme.accent,
                marginRight: 8,
              }}
            />
            <Text style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>
              {selectedNode.id.replace("node-", "Sensor ")}
            </Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            style={{
              padding: 4,
              borderRadius: 12,
              backgroundColor: theme.background,
            }}
          >
            <Ionicons name="close" size={20} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={{ flexDirection: "row", gap: 8 }}>
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
      </View>
    </Animated.View>
  );
};
