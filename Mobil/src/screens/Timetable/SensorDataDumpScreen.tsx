// Sensor veri dokumu - tum ham verileri tablo olarak gosterir
// Props: theme, selectedFieldId
import { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  FlatList,
  TouchableOpacity,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { appStyles } from "../../styles";
import { sensorAPI } from "../../utils/api";
import { TimetableScreenProps, SensorReading } from "./types";
import { useLanguage } from "../../context/LanguageContext";

export const SensorDataDumpScreen = ({
  theme,
  selectedFieldId,
}: Pick<TimetableScreenProps, "theme" | "selectedFieldId">) => {
  const { t } = useLanguage();
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<"aws" | "demo">("demo");
  const [fieldName, setFieldName] = useState("");
  const [readings, setReadings] = useState<SensorReading[]>([]);
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set());
  const [showJumpButton, setShowJumpButton] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const headerScrollRef = useRef<ScrollView>(null);
  const rowScrollRefs = useRef<Map<string, ScrollView>>(new Map());
  const scrollX = useRef(0);

  // Tum verileri cek
  const fetchAll = async () => {
    try {
      setError(null);
      if (!selectedFieldId) {
        setError(t.timetable.noFieldSelected);
        return;
      }
      setIsLoading(true);

      console.log("[DUMP] fetch:", selectedFieldId);
      const res = await sensorAPI.getFieldHistory(selectedFieldId, 72);
      if (!res.success || !res.data) {
        setError(res.error || t.timetable.loadFailed);
        return;
      }
      setDataSource("aws");
      setFieldName(res.data.field_name);

      const sorted = [...res.data.readings].sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
      setReadings(sorted);

      const uniqueNodes = new Set(sorted.map((r) => r.node_id));
      setSelectedNodes(uniqueNodes);
    } catch (e) {
      console.log("[DUMP] err:", e);
      setError(t.timetable.connectionError);
      setDataSource("demo");
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, [selectedFieldId]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchAll();
  };

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

  const jumpToLatest = () => {
    flatListRef.current?.scrollToEnd({ animated: true });
  };

  const handleScroll = (x: number) => {
    scrollX.current = x;
    headerScrollRef.current?.scrollTo({ x, animated: false });
  };

  const filteredReadings = readings.filter((r) => selectedNodes.has(r.node_id));
  const uniqueNodes = Array.from(
    new Set(readings.map((r) => r.node_id)),
  ).sort();

  if (isLoading) {
    return (
      <View
        style={[appStyles.placeholder, { backgroundColor: theme.background }]}
      >
        <ActivityIndicator size="large" color={theme.accent} />
        <Text
          style={[
            appStyles.placeholderSub,
            { color: theme.textSecondary, marginTop: 16 },
          ]}
        >
          {t.timetable.loadingSensorData}
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.background }}
        contentContainerStyle={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          padding: 20,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[theme.accent]}
          />
        }
      >
        <MaterialCommunityIcons
          name="alert-circle"
          size={48}
          color={theme.accent}
          style={{ marginBottom: 16 }}
        />
        <Text style={[appStyles.placeholderText, { color: theme.text }]}>
          {t.timetable.loadFailed}
        </Text>
        <Text
          style={[appStyles.placeholderSub, { color: theme.textSecondary }]}
        >
          {error}
        </Text>
        <Text
          style={[
            appStyles.placeholderSub,
            { color: theme.textSecondary, marginTop: 8 },
          ]}
        >
          {t.timetable.pullToRefresh}
        </Text>
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ padding: 16 }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: "700" }}>
            {t.timetable.sensorDump} (72 {t.timetable.hours})
          </Text>
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 6,
              backgroundColor: dataSource === "aws" ? "#10b981" : "#f59e0b",
            }}
          >
            <Text style={{ color: "#fff", fontSize: 10, fontWeight: "600" }}>
              {dataSource === "aws" ? "AWS" : "DEMO"}
            </Text>
          </View>
        </View>
        <Text style={{ color: theme.textSecondary, marginBottom: 4 }}>
          {fieldName} — {t.timetable.total}: {readings.length} |{" "}
          {t.timetable.showing}: {filteredReadings.length}
        </Text>

        {/* Node filtre chipleri */}
        <FlatList
          data={uniqueNodes}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(nodeId) => nodeId}
          contentContainerStyle={{ paddingVertical: 6 }}
          renderItem={({ item: nodeId }) => (
            <TouchableOpacity
              onPress={() => toggleNode(nodeId)}
              style={{
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 12,
                marginRight: 6,
                backgroundColor: selectedNodes.has(nodeId)
                  ? theme.accent
                  : theme.surface,
                borderWidth: 1,
                borderColor: selectedNodes.has(nodeId)
                  ? theme.accent
                  : theme.textSecondary + "40",
              }}
            >
              <Text
                style={{
                  color: selectedNodes.has(nodeId) ? "#fff" : theme.text,
                  fontSize: 10,
                  fontWeight: "600",
                }}
              >
                Node {nodeId}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      <FlatList
        ref={flatListRef}
        data={filteredReadings}
        keyExtractor={(r) => `${r.id}-${r.created_at}`}
        initialNumToRender={50}
        windowSize={10}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onScroll={(e) => {
          const offsetY = e.nativeEvent.contentOffset.y;
          setShowJumpButton(offsetY > 500);
        }}
        scrollEventThrottle={400}
        style={{ flex: 1 }}
        ListHeaderComponent={() => (
          <ScrollView
            ref={headerScrollRef}
            horizontal
            scrollEnabled={false}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ minWidth: 820 }}
          >
            <View
              style={{
                flexDirection: "row",
                backgroundColor: theme.surface,
                minWidth: 820,
              }}
            >
              {[
                { label: t.timetable.dateTime, width: 220 },
                { label: "Node", width: 100 },
                { label: `${t.timetable.temperature} (°C)`, width: 120 },
                { label: `${t.timetable.humidity} (%)`, width: 120 },
                { label: `${t.timetable.soilMoisture} (%)`, width: 140 },
                { label: t.timetable.rawMoisture, width: 120 },
                { label: "ET0", width: 100 },
              ].map((h) => (
                <View
                  key={h.label}
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 8,
                    width: h.width,
                  }}
                >
                  <Text style={{ color: theme.text, fontWeight: "700" }}>
                    {h.label}
                  </Text>
                </View>
              ))}
            </View>
          </ScrollView>
        )}
        renderItem={({ item, index }) => {
          const d = new Date(item.created_at);
          const hh = d.getHours().toString().padStart(2, "0");
          const mm = d.getMinutes().toString().padStart(2, "0");
          const time = `${d.toLocaleDateString("tr-TR")} ${hh}:${mm}`;
          const isEven = index % 2 === 0;
          return (
            <ScrollView
              ref={(ref) => {
                if (ref) rowScrollRefs.current.set(item.id, ref);
              }}
              horizontal
              showsHorizontalScrollIndicator={false}
              directionalLockEnabled
              nestedScrollEnabled
              onScroll={(e) => handleScroll(e.nativeEvent.contentOffset.x)}
              scrollEventThrottle={16}
              contentContainerStyle={{ minWidth: 820 }}
            >
              <View
                style={{
                  flexDirection: "row",
                  borderBottomWidth: 1,
                  borderBottomColor: theme.textSecondary + "20",
                  minWidth: 820,
                  backgroundColor: isEven
                    ? theme.background
                    : theme.surface + "40",
                }}
              >
                <View
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 8,
                    width: 220,
                  }}
                >
                  <Text style={{ color: theme.text }}>{time}</Text>
                </View>
                <View
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 8,
                    width: 100,
                  }}
                >
                  <Text style={{ color: theme.text }}>{item.node_id}</Text>
                </View>
                <View
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 8,
                    width: 120,
                  }}
                >
                  <Text style={{ color: theme.text }}>
                    {item.temperature?.toFixed(2)}
                  </Text>
                </View>
                <View
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 8,
                    width: 120,
                  }}
                >
                  <Text style={{ color: theme.text }}>
                    {item.humidity?.toFixed(2)}
                  </Text>
                </View>
                <View
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 8,
                    width: 140,
                  }}
                >
                  <Text style={{ color: theme.text }}>
                    {item.sm_percent?.toFixed(2)}
                  </Text>
                </View>
                <View
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 8,
                    width: 120,
                  }}
                >
                  <Text style={{ color: theme.text }}>{item.raw_sm_value}</Text>
                </View>
                <View
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 8,
                    width: 100,
                  }}
                >
                  <Text style={{ color: theme.text }}>
                    {item.et0_instant ?? ""}
                  </Text>
                </View>
              </View>
            </ScrollView>
          );
        }}
      />

      {/* En sona atla butonu */}
      {showJumpButton && (
        <TouchableOpacity
          onPress={jumpToLatest}
          style={{
            position: "absolute",
            bottom: 20,
            right: 20,
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: theme.accent,
            justifyContent: "center",
            alignItems: "center",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.25,
            shadowRadius: 4,
            elevation: 5,
          }}
        >
          <MaterialCommunityIcons name="chevron-down" size={28} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
};
