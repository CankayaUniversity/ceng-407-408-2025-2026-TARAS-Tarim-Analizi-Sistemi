// Sensor veri tablosu - filtrelenebilir tablo gorunumu
// Props: theme, data (sensor okumalari)

import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SensorReading, TimetableScreenProps } from "./types";
import { useState } from "react";
import { useLanguage } from "../../context/LanguageContext";
import { s, vs, ms } from "../../utils/responsive";

interface SensorDataTableProps {
  theme: TimetableScreenProps["theme"];
  data: SensorReading[];
}

export const SensorDataTable = ({ theme, data }: SensorDataTableProps) => {
  const { language, t } = useLanguage();
  const uniqueNodes = Array.from(new Set(data.map((r) => r.node_id))).sort();
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(
    new Set(uniqueNodes),
  );

  const toggleNode = (nodeId: string) => {
    setSelectedNodes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  };

  const filteredData = data.filter((r) => selectedNodes.has(r.node_id));

  const headerStyle = {
    paddingVertical: vs(8),
    paddingHorizontal: s(8),
    backgroundColor: theme.surface,
  };

  const cellStyle = {
    paddingVertical: vs(8),
    paddingHorizontal: s(8),
    borderBottomWidth: 1,
    borderBottomColor: theme.textSecondary + "20",
  };

  return (
    <View className="flex-1">
      <View
        className="row"
        style={{ marginBottom: vs(12) }}
      >
        <MaterialCommunityIcons name="table" size={20} color={theme.primary} />
        <Text
          style={{
            marginLeft: s(8),
            fontSize: ms(13, 0.3),
            fontWeight: "600",
            color: theme.textMain,
          }}
        >
          {t.timetable.sensorData} — {t.timetable.total}: {data.length} |{" "}
          {t.timetable.showing}: {filteredData.length}
        </Text>
      </View>

      {/* Node Filter Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginBottom: vs(8), maxHeight: vs(28) }}
      >
        {uniqueNodes.map((nodeId) => (
          <TouchableOpacity
            key={nodeId}
            onPress={() => toggleNode(nodeId)}
            style={{
              paddingHorizontal: s(8),
              paddingVertical: vs(3),
              borderRadius: 12,
              marginRight: s(6),
              backgroundColor: selectedNodes.has(nodeId)
                ? theme.primary
                : theme.surface,
              borderWidth: 1,
              borderColor: selectedNodes.has(nodeId)
                ? theme.primary
                : theme.textSecondary + "40",
            }}
          >
            <Text
              style={{
                color: selectedNodes.has(nodeId) ? theme.textOnPrimary : theme.textMain,
                fontSize: ms(10, 0.3),
                fontWeight: "600",
              }}
            >
              {t.timetable.node} {nodeId}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView className="flex-1" nestedScrollEnabled>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          nestedScrollEnabled
          directionalLockEnabled
        >
          <View style={{ minWidth: s(640) }}>
            {/* Header */}
            <View className="flex-row">
              <View style={[headerStyle, { flex: 2 }]}>
                <Text style={{ color: theme.textMain, fontWeight: "700" }}>
                  {t.timetable.time}
                </Text>
              </View>
              <View style={[headerStyle, { flex: 1 }]}>
                <Text style={{ color: theme.textMain, fontWeight: "700" }}>
                  {t.timetable.temperature}
                </Text>
              </View>
              <View style={[headerStyle, { flex: 1 }]}>
                <Text style={{ color: theme.textMain, fontWeight: "700" }}>
                  {t.timetable.humidity}
                </Text>
              </View>
              <View style={[headerStyle, { flex: 1 }]}>
                <Text style={{ color: theme.textMain, fontWeight: "700" }}>
                  {t.timetable.soilMoisture}
                </Text>
              </View>
            </View>

            {/* Rows */}
            {filteredData.map((r, index) => {
              const d = new Date(r.created_at);
              const hh = d.getHours().toString().padStart(2, "0");
              const mm = d.getMinutes().toString().padStart(2, "0");
              const locale = language === "tr" ? "tr-TR" : "en-US";
              const time = `${d.toLocaleDateString(locale)} ${hh}:${mm}`;
              const isEven = index % 2 === 0;
              return (
                <View
                  key={`${r.id}-${r.created_at}`}
                  className="flex-row"
                  style={{
                    backgroundColor: isEven
                      ? theme.background
                      : theme.surface + "40",
                  }}
                >
                  <View style={[cellStyle, { flex: 2 }]}>
                    <Text style={{ color: theme.textMain }}>{time}</Text>
                  </View>
                  <View style={[cellStyle, { flex: 1 }]}>
                    <Text style={{ color: theme.textMain }}>
                      {r.temperature?.toFixed(2)}
                    </Text>
                  </View>
                  <View style={[cellStyle, { flex: 1 }]}>
                    <Text style={{ color: theme.textMain }}>
                      {r.humidity?.toFixed(2)}
                    </Text>
                  </View>
                  <View style={[cellStyle, { flex: 1 }]}>
                    <Text style={{ color: theme.textMain }}>
                      {r.sm_percent?.toFixed(2)}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>
      </ScrollView>
    </View>
  );
};
