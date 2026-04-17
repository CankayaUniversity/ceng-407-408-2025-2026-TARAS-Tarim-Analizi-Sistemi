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
import { s, vs, ms } from "../../utils/responsive";

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
        <ActivityIndicator size="large" color={theme.primary} />
        <Text
          style={[
            appStyles.placeholderSub,
            { color: theme.textSecondary, marginTop: vs(16) },
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
        className="flex-1"
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          padding: s(20),
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[theme.primary]}
          />
        }
      >
        <MaterialCommunityIcons
          name="alert-circle"
          size={48}
          color={theme.primary}
          style={{ marginBottom: vs(16) }}
        />
        <Text style={[appStyles.placeholderText, { color: theme.textMain }]}>
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
            { color: theme.textSecondary, marginTop: vs(8) },
          ]}
        >
          {t.timetable.pullToRefresh}
        </Text>
      </ScrollView>
    );
  }

  return (
    <View className="flex-1" style={{ backgroundColor: theme.background }}>
      <View style={{ padding: s(16) }}>
        <View className="row-between" style={{ marginBottom: vs(8) }}>
          <Text style={{ color: theme.textMain, fontSize: ms(16, 0.3), fontWeight: "700" }}>
            {t.timetable.sensorDump} (72 {t.timetable.hours})
          </Text>
          <View
            className="rounded-md"
            style={{
              paddingHorizontal: s(8),
              paddingVertical: vs(4),
              backgroundColor: dataSource === "aws" ? "#10b981" : "#f59e0b",
            }}
          >
            <Text className="text-white font-semibold" style={{ fontSize: ms(10, 0.3) }}>
              {dataSource === "aws" ? "AWS" : "DEMO"}
            </Text>
          </View>
        </View>
        <Text style={{ color: theme.textSecondary, marginBottom: vs(4) }}>
          {fieldName} — {t.timetable.total}: {readings.length} |{" "}
          {t.timetable.showing}: {filteredReadings.length}
        </Text>

        {/* Node filtre chipleri */}
        <FlatList
          data={uniqueNodes}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(nodeId) => nodeId}
          contentContainerStyle={{ paddingVertical: vs(6) }}
          renderItem={({ item: nodeId }) => (
            <TouchableOpacity
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
        className="flex-1"
        ListHeaderComponent={() => (
          <ScrollView
            ref={headerScrollRef}
            horizontal
            scrollEnabled={false}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ minWidth: s(820) }}
          >
            <View
              className="flex-row"
              style={{
                backgroundColor: theme.surface,
                minWidth: s(820),
              }}
            >
              {[
                { label: t.timetable.dateTime, width: s(220) },
                { label: "Node", width: s(100) },
                { label: `${t.timetable.temperature} (°C)`, width: s(120) },
                { label: `${t.timetable.humidity} (%)`, width: s(120) },
                { label: `${t.timetable.soilMoisture} (%)`, width: s(140) },
                { label: t.timetable.rawMoisture, width: s(120) },
                { label: "ET0", width: s(100) },
              ].map((h) => (
                <View
                  key={h.label}
                  style={{
                    paddingVertical: vs(8),
                    paddingHorizontal: s(8),
                    width: h.width,
                  }}
                >
                  <Text style={{ color: theme.textMain, fontWeight: "700" }}>
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
              contentContainerStyle={{ minWidth: s(820) }}
            >
              <View
                className="flex-row"
                style={{
                  borderBottomWidth: 1,
                  borderBottomColor: theme.textSecondary + "20",
                  minWidth: s(820),
                  backgroundColor: isEven
                    ? theme.background
                    : theme.surface + "40",
                }}
              >
                <View
                  style={{
                    paddingVertical: vs(8),
                    paddingHorizontal: s(8),
                    width: s(220),
                  }}
                >
                  <Text style={{ color: theme.textMain }}>{time}</Text>
                </View>
                <View
                  style={{
                    paddingVertical: vs(8),
                    paddingHorizontal: s(8),
                    width: s(100),
                  }}
                >
                  <Text style={{ color: theme.textMain }}>{item.node_id}</Text>
                </View>
                <View
                  style={{
                    paddingVertical: vs(8),
                    paddingHorizontal: s(8),
                    width: s(120),
                  }}
                >
                  <Text style={{ color: theme.textMain }}>
                    {item.temperature?.toFixed(2)}
                  </Text>
                </View>
                <View
                  style={{
                    paddingVertical: vs(8),
                    paddingHorizontal: s(8),
                    width: s(120),
                  }}
                >
                  <Text style={{ color: theme.textMain }}>
                    {item.humidity?.toFixed(2)}
                  </Text>
                </View>
                <View
                  style={{
                    paddingVertical: vs(8),
                    paddingHorizontal: s(8),
                    width: s(140),
                  }}
                >
                  <Text style={{ color: theme.textMain }}>
                    {item.sm_percent?.toFixed(2)}
                  </Text>
                </View>
                <View
                  style={{
                    paddingVertical: vs(8),
                    paddingHorizontal: s(8),
                    width: s(120),
                  }}
                >
                  <Text style={{ color: theme.textMain }}>{item.raw_sm_value}</Text>
                </View>
                <View
                  style={{
                    paddingVertical: vs(8),
                    paddingHorizontal: s(8),
                    width: s(100),
                  }}
                >
                  <Text style={{ color: theme.textMain }}>
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
          className="absolute rounded-full center shadow-md"
          style={{
            bottom: s(20),
            right: s(20),
            width: s(56),
            height: s(56),
            backgroundColor: theme.primary,
            elevation: 5,
          }}
        >
          <MaterialCommunityIcons name="chevron-down" size={28} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
};
