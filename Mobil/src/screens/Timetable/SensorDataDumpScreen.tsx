import { useEffect, useState, useRef } from "react";
import { View, Text, ScrollView, RefreshControl, ActivityIndicator, FlatList, TouchableOpacity } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { appStyles } from "../../styles";
import { sensorAPI } from "../../utils/api";
import { TimetableScreenProps, SensorReading } from "./types";

export const SensorDataDumpScreen = ({ theme, selectedFieldId }: Pick<TimetableScreenProps, 'theme' | 'selectedFieldId'>) => {
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<'aws' | 'demo'>('demo');
  const [fieldName, setFieldName] = useState("");
  const [readings, setReadings] = useState<SensorReading[]>([]);
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set());
  const [showJumpButton, setShowJumpButton] = useState(false);
  
  const flatListRef = useRef<FlatList>(null);
  const headerScrollRef = useRef<ScrollView>(null);
  const rowScrollRefs = useRef<Map<string, ScrollView>>(new Map());
  const scrollX = useRef(0);

  const fetchAll = async () => {
    try {
      setError(null);
      if (!selectedFieldId) {
        setError("Tarla secilmedi");
        return;
      }
      setIsLoading(true);

      console.log('🌐 [DUMP] Fetching 72h sensor data from AWS for field:', selectedFieldId);
      const res = await sensorAPI.getFieldHistory(selectedFieldId, 72);
      if (!res.success || !res.data) {
        setError(res.error || "Veri yuklenemedi");
        return;
      }
      setDataSource('aws');
      setFieldName(res.data.field_name);

      const sorted = [...res.data.readings].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      setReadings(sorted);
      
      // Initialize node filter with all unique nodes
      const uniqueNodes = new Set(sorted.map(r => r.node_id));
      setSelectedNodes(uniqueNodes);
    } catch (e) {
      console.error('❌ [DUMP ERROR] Fetch failed:', e);
      setError("Baglanti hatasi");
      setDataSource('demo');
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

  const jumpToLatest = () => {
    flatListRef.current?.scrollToEnd({ animated: true });
  };

  const handleScroll = (x: number) => {
    scrollX.current = x;
    // Sync header
    headerScrollRef.current?.scrollTo({ x, animated: false });
  };

  const filteredReadings = readings.filter(r => selectedNodes.has(r.node_id));
  const uniqueNodes = Array.from(new Set(readings.map(r => r.node_id))).sort();

  if (isLoading) {
    return (
      <View style={[appStyles.placeholder, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.accent} />
        <Text style={[appStyles.placeholderSub, { color: theme.textSecondary, marginTop: 16 }]}>Veri yukleniyor...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.background }}
        contentContainerStyle={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.accent]} />}
      >
        <MaterialCommunityIcons name="alert-circle" size={48} color={theme.accent} style={{ marginBottom: 16 }} />
        <Text style={[appStyles.placeholderText, { color: theme.text }]}>Veri Yuklenemedi</Text>
        <Text style={[appStyles.placeholderSub, { color: theme.textSecondary }]}>{error}</Text>
        <Text style={[appStyles.placeholderSub, { color: theme.textSecondary, marginTop: 8 }]}>Yenilemek icin asagi cekin</Text>
      </ScrollView>
    );
  }

  // Table: vertical FlatList outer for reliable vertical scroll;
  // horizontal overflow handled per row and header.
  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ padding: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700' }}>Sensör Dökümü (72 Saat)</Text>
          <View style={{
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 6,
            backgroundColor: dataSource === 'aws' ? '#10b981' : '#f59e0b',
          }}>
            <Text style={{ color: '#fff', fontSize: 10, fontWeight: '600' }}>
              {dataSource === 'aws' ? '🔗 AWS' : '📱 DEMO'}
            </Text>
          </View>
        </View>
        <Text style={{ color: theme.textSecondary, marginBottom: 4 }}>{fieldName} — Toplam: {readings.length} | Gösterilen: {filteredReadings.length}</Text>
        
        {/* Node Filter Chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6, marginBottom: 4, maxHeight: 28 }}>
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
            <View style={{ flexDirection: 'row', backgroundColor: theme.surface, minWidth: 820 }}>
              {[
                { label: 'Tarih/Saat', width: 220 },
                { label: 'Node', width: 100 },
                { label: 'Sıcaklık (°C)', width: 120 },
                { label: 'Nem (%)', width: 120 },
                { label: 'Toprak Nemi (%)', width: 140 },
                { label: 'Ham Nem', width: 120 },
                { label: 'ET0', width: 100 },
              ].map((h) => (
                <View key={h.label} style={{ paddingVertical: 8, paddingHorizontal: 8, width: h.width }}>
                  <Text style={{ color: theme.text, fontWeight: '700' }}>{h.label}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        )}
        renderItem={({ item, index }) => {
          const d = new Date(item.created_at);
          const hh = d.getHours().toString().padStart(2, '0');
          const mm = d.getMinutes().toString().padStart(2, '0');
          const time = `${d.toLocaleDateString('tr-TR')} ${hh}:${mm}`;
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
              <View style={{ 
                flexDirection: 'row', 
                borderBottomWidth: 1, 
                borderBottomColor: theme.textSecondary + '20', 
                minWidth: 820,
                backgroundColor: isEven ? theme.background : theme.surface + '40'
              }}>
                <View style={{ paddingVertical: 8, paddingHorizontal: 8, width: 220 }}>
                  <Text style={{ color: theme.text }}>{time}</Text>
                </View>
                <View style={{ paddingVertical: 8, paddingHorizontal: 8, width: 100 }}>
                  <Text style={{ color: theme.text }}>{item.node_id}</Text>
                </View>
                <View style={{ paddingVertical: 8, paddingHorizontal: 8, width: 120 }}>
                  <Text style={{ color: theme.text }}>{item.temperature?.toFixed(2)}</Text>
                </View>
                <View style={{ paddingVertical: 8, paddingHorizontal: 8, width: 120 }}>
                  <Text style={{ color: theme.text }}>{item.humidity?.toFixed(2)}</Text>
                </View>
                <View style={{ paddingVertical: 8, paddingHorizontal: 8, width: 140 }}>
                  <Text style={{ color: theme.text }}>{item.sm_percent?.toFixed(2)}</Text>
                </View>
                <View style={{ paddingVertical: 8, paddingHorizontal: 8, width: 120 }}>
                  <Text style={{ color: theme.text }}>{item.raw_sm_value}</Text>
                </View>
                <View style={{ paddingVertical: 8, paddingHorizontal: 8, width: 100 }}>
                  <Text style={{ color: theme.text }}>{item.et0_instant ?? ''}</Text>
                </View>
              </View>
            </ScrollView>
          );
        }}
      />
      
      {/* Jump to Latest FAB */}
      {showJumpButton && (
        <TouchableOpacity
          onPress={jumpToLatest}
          style={{
            position: 'absolute',
            bottom: 20,
            right: 20,
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: theme.accent,
            justifyContent: 'center',
            alignItems: 'center',
            shadowColor: '#000',
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
