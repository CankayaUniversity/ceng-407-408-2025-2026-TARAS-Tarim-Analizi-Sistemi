// Optimized sensor table - ekran genisligine sigan, virtualized, sortable
// Default goruntu: time + node + 1 birim (compact) — telefonda yatay scroll yok
// Row tap -> tum metrikleri (ham nem, et0) acar
// Tablet/genis ekranda dogrudan tum kolonlar gosterilir

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Pressable,
  LayoutAnimation,
  Platform,
  Animated,
  ActivityIndicator,
} from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Theme } from "../../utils/theme";
import { s, vs, ms, useResponsive } from "../../utils/responsive";
import { useLanguage } from "../../context/LanguageContext";
import type { JoinedReading, SoilMoistureThresholds } from "./types";

// LayoutAnimation works on Android in the New Architecture (Fabric, which this
// app uses) without any experimental enable flag — the legacy call would just
// emit a warning and do nothing.

type SortField = "ts" | "node" | "temp" | "hum" | "soil";
type SortDir = "asc" | "desc";

interface OptimizedSensorTableProps {
  theme: Theme;
  data: JoinedReading[];
  // Soil moisture esikleri — varsa SM% sutununda esik disi degerleri kirmizi rozet ile gosterir
  soilThresholds?: SoilMoistureThresholds | null;
  // Filtre degisikligi refetch'i sirasinda yari saydam karartma + spinner overlay
  loading?: boolean;
}

interface RowProps {
  theme: Theme;
  item: JoinedReading;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  isWide: boolean;
  language: "tr" | "en";
  soilThresholds: SoilMoistureThresholds | null;
}

const formatTime = (iso: string, language: "tr" | "en"): string => {
  const d = new Date(iso);
  const locale = language === "tr" ? "tr-TR" : "en-US";
  const datePart = d.toLocaleDateString(locale, {
    day: "2-digit",
    month: "2-digit",
  });
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${datePart} ${h}:${m}`;
};

const formatNum = (n: number | null | undefined, dec = 1): string => {
  if (n == null || isNaN(n)) return "-";
  return n.toFixed(dec);
};

const shortNode = (id: string): string => {
  if (id.length <= 6) return id;
  return "…" + id.slice(-5);
};

// Tek bir satir
const TableRow = memo(({ theme, item, index, expanded, onToggle, isWide, language, soilThresholds }: RowProps) => {
  const isEven = index % 2 === 0;
  const bg = isEven ? "transparent" : theme.divider + "40";

  // SM% esik kontrolu — DB'den gelen min/max disindaki degerleri kirmizi tonla isaretle
  const sm = item.sm_percent;
  const smOutOfRange =
    sm != null &&
    isFinite(sm) &&
    soilThresholds != null &&
    (sm < soilThresholds.min || sm > soilThresholds.max);
  const smCellBg = smOutOfRange ? theme.danger + "1A" : "transparent";
  const smTextColor = smOutOfRange ? theme.danger : theme.textMain;

  return (
    <View style={{ backgroundColor: bg }}>
      <Pressable onPress={onToggle} android_ripple={{ color: theme.primary + "10" }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: vs(9),
            paddingHorizontal: s(10),
            borderBottomWidth: 1,
            borderBottomColor: theme.divider,
          }}
        >
          {/* Time + node */}
          <View style={{ flex: 2.2 }}>
            <Text
              style={{
                fontSize: ms(11.5, 0.3),
                fontWeight: "600",
                color: theme.textMain,
              }}
              numberOfLines={1}
            >
              {formatTime(item.created_at, language)}
            </Text>
            <Text style={{ fontSize: ms(9.5, 0.3), color: theme.textMuted, marginTop: 1 }} numberOfLines={1}>
              {shortNode(item.node_id)}
              {item.zone_name ? ` · ${item.zone_name}` : ""}
            </Text>
          </View>

          {/* Temp */}
          <View style={{ flex: 1, alignItems: "flex-end" }}>
            <Text
              style={{
                fontSize: ms(12, 0.3),
                color: theme.textMain,
                fontWeight: "600",
                fontVariant: ["tabular-nums"],
              }}
            >
              {formatNum(item.temperature)}
            </Text>
          </View>
          {/* Hum */}
          <View style={{ flex: 1, alignItems: "flex-end" }}>
            <Text
              style={{
                fontSize: ms(12, 0.3),
                color: theme.textMain,
                fontWeight: "600",
                fontVariant: ["tabular-nums"],
              }}
            >
              {formatNum(item.humidity)}
            </Text>
          </View>
          {/* Soil — esik disindaysa kirmizi rozet */}
          <View style={{ flex: 1, alignItems: "flex-end" }}>
            <View
              style={{
                paddingHorizontal: smOutOfRange ? 6 : 0,
                paddingVertical: smOutOfRange ? 2 : 0,
                borderRadius: 6,
                backgroundColor: smCellBg,
              }}
            >
              <Text
                style={{
                  fontSize: ms(12, 0.3),
                  color: smTextColor,
                  fontWeight: smOutOfRange ? "700" : "600",
                  fontVariant: ["tabular-nums"],
                }}
              >
                {formatNum(item.sm_percent)}
              </Text>
            </View>
          </View>

          {/* Genisse ek kolonlar */}
          {isWide && (
            <>
              <View style={{ flex: 1, alignItems: "flex-end" }}>
                <Text
                  style={{
                    fontSize: ms(11, 0.3),
                    color: theme.textSecondary,
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {item.raw_sm_value ?? "-"}
                </Text>
              </View>
              <View style={{ flex: 1, alignItems: "flex-end" }}>
                <Text
                  style={{
                    fontSize: ms(11, 0.3),
                    color: theme.textSecondary,
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {formatNum(item.et0_instant, 2)}
                </Text>
              </View>
            </>
          )}

          {/* Expand cevirisi */}
          {!isWide && (
            <View style={{ width: s(20), alignItems: "center", marginLeft: s(4) }}>
              <MaterialCommunityIcons
                name={expanded ? "chevron-up" : "chevron-down"}
                size={16}
                color={theme.textMuted}
              />
            </View>
          )}
        </View>
      </Pressable>

      {/* Expanded detail (sadece dar ekranda) */}
      {!isWide && expanded && (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: s(12),
            paddingHorizontal: s(14),
            paddingVertical: vs(10),
            backgroundColor: theme.background,
            borderBottomWidth: 1,
            borderBottomColor: theme.divider,
          }}
        >
          <DetailItem theme={theme} label="ID" value={item.node_id} />
          {item.zone_name && (
            <DetailItem theme={theme} label="Zone" value={item.zone_name} />
          )}
          <DetailItem
            theme={theme}
            label="Raw SM"
            value={item.raw_sm_value != null ? `${item.raw_sm_value}` : "-"}
          />
          <DetailItem theme={theme} label="ET0" value={formatNum(item.et0_instant, 2)} />
        </View>
      )}
    </View>
  );
});

interface DetailItemProps {
  theme: Theme;
  label: string;
  value: string;
}

const DetailItem = ({ theme, label, value }: DetailItemProps) => (
  <View>
    <Text style={{ fontSize: ms(9, 0.3), color: theme.textMuted, fontWeight: "600" }}>
      {label}
    </Text>
    <Text style={{ fontSize: ms(11, 0.3), color: theme.textMain }}>{value}</Text>
  </View>
);

export const OptimizedSensorTable = memo(function OptimizedSensorTable({
  theme,
  data,
  soilThresholds = null,
  loading = false,
}: OptimizedSensorTableProps) {
  const { language, t } = useLanguage();
  const { isPhone } = useResponsive();
  const isWide = !isPhone;
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("ts");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Yari saydam karartma overlay opaklik animasyonu — chart kartlarindakiyle ayni davranis
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(overlayOpacity, {
      toValue: loading ? 1 : 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [loading, overlayOpacity]);

  const sorted = useMemo(() => {
    const cmpNum = (a: number | null | undefined, b: number | null | undefined) => {
      const av = a == null ? -Infinity : a;
      const bv = b == null ? -Infinity : b;
      return av - bv;
    };
    const cmpStr = (a: string, b: string) => a.localeCompare(b);
    const dir = sortDir === "asc" ? 1 : -1;
    const out = [...data];
    out.sort((a, b) => {
      let r = 0;
      switch (sortField) {
        case "ts":
          r = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case "node":
          r = cmpStr(a.node_id, b.node_id);
          break;
        case "temp":
          r = cmpNum(a.temperature, b.temperature);
          break;
        case "hum":
          r = cmpNum(a.humidity, b.humidity);
          break;
        case "soil":
          r = cmpNum(a.sm_percent, b.sm_percent);
          break;
      }
      return r * dir;
    });
    return out;
  }, [data, sortField, sortDir]);

  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDir((p) => (p === "asc" ? "desc" : "asc"));
      } else {
        setSortField(field);
        setSortDir(field === "ts" ? "desc" : "asc");
      }
    },
    [sortField],
  );

  const toggleExpand = useCallback((id: string) => {
    LayoutAnimation.configureNext({
      duration: 160,
      create: { type: "linear", property: "opacity" },
      update: { type: "easeInEaseOut" },
    });
    setExpandedId((p) => (p === id ? null : id));
  }, []);

  // Sticky header — kalin alt cizgi + surface arka plan ile satirlarin uzerine net ayrilir
  const renderHeader = useCallback(() => {
    const headerCell = (
      label: string,
      field: SortField,
      flex: number,
      align: "left" | "right" = "right",
    ) => {
      const active = sortField === field;
      return (
        <TouchableOpacity
          onPress={() => handleSort(field)}
          style={{ flex, paddingVertical: vs(4) }}
          hitSlop={6}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: align === "left" ? "flex-start" : "flex-end",
            }}
          >
            <Text
              style={{
                fontSize: ms(10.5, 0.3),
                fontWeight: "700",
                color: active ? theme.primary : theme.textSecondary,
                letterSpacing: 0.3,
                textTransform: "uppercase",
              }}
              numberOfLines={1}
            >
              {label}
            </Text>
            {active && (
              <MaterialCommunityIcons
                name={sortDir === "asc" ? "chevron-up" : "chevron-down"}
                size={12}
                color={theme.primary}
                style={{ marginLeft: 2 }}
              />
            )}
          </View>
        </TouchableOpacity>
      );
    };
    return (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: vs(8),
          paddingHorizontal: s(10),
          backgroundColor: theme.surface,
          borderBottomWidth: 1.5,
          borderBottomColor: theme.border,
        }}
      >
        {headerCell(t.timetable.time, "ts", 2.2, "left")}
        {headerCell("°C", "temp", 1)}
        {headerCell("%", "hum", 1)}
        {headerCell("SM", "soil", 1)}
        {isWide && (
          <>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: ms(10.5, 0.3),
                  fontWeight: "700",
                  color: theme.textSecondary,
                  letterSpacing: 0.3,
                  textTransform: "uppercase",
                  textAlign: "right",
                }}
              >
                raw
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: ms(10.5, 0.3),
                  fontWeight: "700",
                  color: theme.textSecondary,
                  letterSpacing: 0.3,
                  textTransform: "uppercase",
                  textAlign: "right",
                }}
              >
                ET0
              </Text>
            </View>
          </>
        )}
        {!isWide && <View style={{ width: s(20), marginLeft: s(4) }} />}
      </View>
    );
  }, [theme, sortField, sortDir, t, isWide, handleSort]);

  const renderItem = useCallback(
    ({ item, index }: { item: JoinedReading; index: number }) => {
      const expanded = expandedId === item.id;
      return (
        <TableRow
          theme={theme}
          item={item}
          index={index}
          expanded={expanded}
          onToggle={() => toggleExpand(item.id)}
          isWide={isWide}
          language={language as "tr" | "en"}
          soilThresholds={soilThresholds}
        />
      );
    },
    [expandedId, theme, toggleExpand, isWide, language, soilThresholds],
  );

  const keyExtractor = useCallback(
    (r: JoinedReading) => `${r.id}-${r.created_at}-${r.node_id}`,
    [],
  );

  if (data.length === 0) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: s(24),
          borderRadius: 12,
          borderWidth: 1,
          borderColor: theme.border,
          backgroundColor: theme.surface,
          marginHorizontal: s(8),
          marginVertical: vs(8),
        }}
      >
        <MaterialCommunityIcons name="table-large" size={36} color={theme.textMuted} />
        <Text style={{ marginTop: vs(8), color: theme.textMuted, fontSize: ms(13, 0.3) }}>
          {t.timetable.noDataYet}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={{
        flex: 1,
        marginHorizontal: s(8),
        marginVertical: vs(4),
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.border,
        backgroundColor: theme.background,
        overflow: "hidden",
      }}
    >
      <FlatList
        data={sorted}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListHeaderComponent={renderHeader}
        stickyHeaderIndices={[0]}
        initialNumToRender={20}
        maxToRenderPerBatch={20}
        windowSize={10}
        removeClippedSubviews={Platform.OS === "android"}
        contentContainerStyle={{ paddingBottom: vs(8) }}
      />
      {/* Yari saydam karartma + spinner — filtre degisikligi refetch'i sirasinda */}
      <Animated.View
        pointerEvents={loading ? "auto" : "none"}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.isDark ? "rgba(0,0,0,0.42)" : "rgba(0,0,0,0.18)",
          opacity: overlayOpacity,
        }}
      >
        <ActivityIndicator size="small" color={theme.isDark ? theme.textOnPrimary : theme.primary} />
      </Animated.View>
    </View>
  );
});

export default OptimizedSensorTable;
