import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SensorReading, TimetableScreenProps } from "./types";
import { useState } from "react";

interface SensorDataTableProps {
  theme: TimetableScreenProps["theme"];
  data: SensorReading[];
}

export const SensorDataTable = ({ theme, data }: SensorDataTableProps) => {
  const uniqueNodes = Array.from(new Set(data.map(r => r.node_id))).sort();
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set(uniqueNodes));

  const toggleNode = (nodeId: string) => {
    setSelectedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  };

  const filteredData = data.filter(r => selectedNodes.has(r.node_id));

  const headerStyle = {
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: theme.surface,
  };

  const cellStyle = {
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.textSecondary + "20",
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
        <MaterialCommunityIcons name="table" size={20} color={theme.accent} />
        <Text style={{ marginLeft: 8, fontSize: 13, fontWeight: "600", color: theme.text }}>
          Sensor Verileri — Toplam: {data.length} | Gösterilen: {filteredData.length}
        </Text>
      </View>

      {/* Node Filter Chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8, maxHeight: 28 }}>
        {uniqueNodes.map(nodeId => (
          <TouchableOpacity
            key={nodeId}
            onPress={() => toggleNode(nodeId)}
            style={{
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 12,
              marginRight: 6,
              backgroundColor: selectedNodes.has(nodeId) ? theme.accent : theme.surface,
              borderWidth: 1,
              borderColor: selectedNodes.has(nodeId) ? theme.accent : theme.textSecondary + '40',
            }}
          >
            <Text style={{ color: selectedNodes.has(nodeId) ? '#fff' : theme.text, fontSize: 10, fontWeight: '600' }}>
              Node {nodeId}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={{ flex: 1 }} nestedScrollEnabled>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled directionalLockEnabled>
          <View style={{ minWidth: 640 }}>
            {/* Header */}
            <View style={{ flexDirection: "row" }}>
              <View style={[headerStyle, { flex: 2 }]}> 
                <Text style={{ color: theme.text, fontWeight: "700" }}>Zaman</Text>
              </View>
              <View style={[headerStyle, { flex: 1 }]}> 
                <Text style={{ color: theme.text, fontWeight: "700" }}>Sıcaklık (°C)</Text>
              </View>
              <View style={[headerStyle, { flex: 1 }]}> 
                <Text style={{ color: theme.text, fontWeight: "700" }}>Nem (%)</Text>
              </View>
              <View style={[headerStyle, { flex: 1 }]}> 
                <Text style={{ color: theme.text, fontWeight: "700" }}>Toprak Nemi (%)</Text>
              </View>
            </View>

            {/* Rows */}
            {filteredData.map((r, index) => {
              const d = new Date(r.created_at);
              const hh = d.getHours().toString().padStart(2, "0");
              const mm = d.getMinutes().toString().padStart(2, "0");
              const time = `${d.toLocaleDateString("tr-TR")} ${hh}:${mm}`;
              const isEven = index % 2 === 0;
              return (
                <View key={`${r.id}-${r.created_at}`} style={{ 
                  flexDirection: "row",
                  backgroundColor: isEven ? theme.background : theme.surface + '40'
                }}>
                  <View style={[cellStyle, { flex: 2 }]}> 
                    <Text style={{ color: theme.text }}>{time}</Text>
                  </View>
                  <View style={[cellStyle, { flex: 1 }]}> 
                    <Text style={{ color: theme.text }}>{r.temperature?.toFixed(2)}</Text>
                  </View>
                  <View style={[cellStyle, { flex: 1 }]}> 
                    <Text style={{ color: theme.text }}>{r.humidity?.toFixed(2)}</Text>
                  </View>
                  <View style={[cellStyle, { flex: 1 }]}> 
                    <Text style={{ color: theme.text }}>{r.sm_percent?.toFixed(2)}</Text>
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
