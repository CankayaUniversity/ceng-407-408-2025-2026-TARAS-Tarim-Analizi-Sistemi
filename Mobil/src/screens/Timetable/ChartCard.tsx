// Grafik karti - sensor verilerini cizgi grafik olarak gosterir
// Props: theme, title, icon, color, data, onTouchStart, onTouchEnd

import { View, Text, Dimensions } from "react-native";
import { LineChart } from "react-native-gifted-charts";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useState, useEffect, useRef, useCallback } from "react";
import { ChartCardProps } from "./types";
import { useLanguage } from "../../context/LanguageContext";
import { s, vs, ms } from "../../utils/responsive";

// Sabitler
const MAX_DISPLAY_POINTS = 50;
const CHART_HEIGHT = vs(160);
const Y_AXIS_WIDTH = s(40);
const X_AXIS_LABEL_HEIGHT = vs(25);
const POPUP_HIDE_DELAY = 2000;

// Tarih formatla: GG/AA
const formatDay = (date: Date): string => {
  const day = date.getDate().toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  return `${day}/${month}`;
};

// Saat formatla: SS:dd
const formatTime = (date: Date): string => {
  const hour = date.getHours().toString().padStart(2, "0");
  const min = date.getMinutes().toString().padStart(2, "0");
  return `${hour}:${min}`;
};

// Basliktan birim cikar (°C veya %)
const extractUnit = (title: string): string => title.match(/°C|%/)?.[0] || "";

export const ChartCard = ({
  theme,
  title,
  icon,
  color,
  data,
  onTouchStart,
  onTouchEnd,
}: ChartCardProps) => {
  const { t } = useLanguage();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isReady, setIsReady] = useState(false);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Delayed render to prevent UI freeze
  useEffect(() => {
    const timer = setTimeout(() => setIsReady(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, []);

  // Layout calculations
  const screenWidth = Dimensions.get("window").width;
  const chartContainerWidth = screenWidth - s(64);
  const chartDrawableWidth = chartContainerWidth - Y_AXIS_WIDTH;

  // Sanitize and prepare data (moved before early return)
  const safeData =
    data?.map((point) => ({
      ...point,
      value:
        typeof point.value === "number" && !isNaN(point.value)
          ? point.value
          : 0,
    })) || [];

  const isInterpolated = safeData.length > MAX_DISPLAY_POINTS;

  // Downsample if needed
  const displayData = isInterpolated
    ? safeData.filter(
        (_, i) => i % Math.ceil(safeData.length / MAX_DISPLAY_POINTS) === 0,
      )
    : safeData;

  const numPoints = displayData.length;
  const spacing =
    numPoints > 1 ? chartDrawableWidth / (numPoints - 1) : chartDrawableWidth;

  // Generate labels and track label positions for grid lines
  const labelIndices: number[] = [];
  const chartData = displayData.map((point, index) => {
    let label = "";

    if (point.ts) {
      const date = new Date(point.ts);
      const prevTs = index > 0 ? displayData[index - 1]?.ts : null;
      const prevDate = prevTs ? new Date(prevTs) : null;

      if (isInterpolated) {
        // Show DD/MM when day changes
        const dayKey = formatDay(date);
        const prevDayKey = prevDate ? formatDay(prevDate) : null;
        if (index === 0 || dayKey !== prevDayKey) {
          label = dayKey;
          labelIndices.push(index);
        }
      } else {
        // Show hour when it changes
        const hour = date.getHours();
        const prevHour = prevDate?.getHours();
        if (index === 0 || hour !== prevHour) {
          label = hour.toString().padStart(2, "0");
          labelIndices.push(index);
        }
      }
    }

    return { value: point.value, label, ts: point.ts };
  });

  const unit = extractUnit(title);

  // Touch position to data index
  const getIndexFromX = useCallback(
    (touchX: number): number => {
      const adjustedX = Math.max(0, touchX - Y_AXIS_WIDTH);
      const index = Math.round(adjustedX / spacing);
      return Math.max(0, Math.min(chartData.length - 1, index));
    },
    [spacing, chartData.length],
  );

  // Touch handlers
  const handleTouchStart = useCallback(
    (e: { nativeEvent: { locationX: number } }) => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
      onTouchStart?.();
      setSelectedIndex(getIndexFromX(e.nativeEvent.locationX));
    },
    [getIndexFromX, onTouchStart],
  );

  const handleTouchMove = useCallback(
    (e: { nativeEvent: { locationX: number } }) => {
      setSelectedIndex(getIndexFromX(e.nativeEvent.locationX));
    },
    [getIndexFromX],
  );

  const handleTouchEnd = useCallback(() => {
    onTouchEnd?.();
    hideTimeoutRef.current = setTimeout(
      () => setSelectedIndex(null),
      POPUP_HIDE_DELAY,
    );
  }, [onTouchEnd]);

  const selectedPoint =
    selectedIndex !== null ? chartData[selectedIndex] : null;

  // Early return for empty data (moved after all hooks)
  if (!data || data.length === 0) return null;

  // Format selected point time label
  const getTimeLabel = (): string => {
    if (!selectedPoint?.ts) return "";
    const date = new Date(selectedPoint.ts);
    return isInterpolated
      ? `${formatDay(date)} ${formatTime(date)}`
      : formatTime(date);
  };

  // Calculate X position for overlay elements
  const getXPosition = (index: number): number =>
    Y_AXIS_WIDTH + index * spacing;

  // Loading state
  if (!isReady) {
    return (
      <View
        className="rounded-xl"
        style={{ marginBottom: vs(24), padding: s(16), paddingBottom: vs(8), backgroundColor: theme.surface, height: CHART_HEIGHT + 100 }}
      >
        <View className="flex-1 center">
          <Text style={{ fontSize: ms(11, 0.3), color: theme.textSecondary }}>
            {t.common.loading}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View
      className="rounded-xl"
      style={{ marginBottom: vs(24), padding: s(16), paddingBottom: vs(8), backgroundColor: theme.surface }}
    >
      {/* Header */}
      <View className="row-between" style={{ marginBottom: vs(8) }}>
        <View className="row">
          <MaterialCommunityIcons name={icon as any} size={20} color={color} />
          <Text style={{ marginLeft: s(8), fontSize: ms(13, 0.3), fontWeight: "600", color: theme.textMain }}>
            {title}
          </Text>
        </View>
        {isInterpolated && (
          <View
            className="rounded"
            style={{ paddingHorizontal: s(8), paddingVertical: vs(2), backgroundColor: theme.textSecondary + "20" }}
          >
            <Text style={{ fontSize: ms(9, 0.3), fontWeight: "600", color: theme.textSecondary }}>
              {t.timetable.interpolated}
            </Text>
          </View>
        )}
      </View>

      {/* Value popup */}
      <View className="center" style={{ height: vs(28) }}>
        {selectedPoint && (
          <View className="bg-neutral-900 rounded-md" style={{ paddingHorizontal: s(12), paddingVertical: vs(4) }}>
            <Text className="text-white font-bold" style={{ fontSize: ms(13, 0.3) }}>
              {selectedPoint.value.toFixed(1)} {unit}
            </Text>
          </View>
        )}
      </View>

      {/* Chart container */}
      <View
        className="relative"
        style={{
          width: chartContainerWidth,
          height: CHART_HEIGHT + X_AXIS_LABEL_HEIGHT,
        }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={handleTouchStart}
        onResponderMove={handleTouchMove}
        onResponderRelease={handleTouchEnd}
        onResponderTerminate={handleTouchEnd}
      >
        {/* Grid lines at label positions */}
        {labelIndices.map((idx) => (
          <View
            key={`grid-${idx}`}
            style={{
              position: "absolute",
              top: 0,
              width: 1,
              zIndex: 1,
              left: getXPosition(idx),
              height: CHART_HEIGHT,
              backgroundColor: theme.textSecondary + "25",
            }}
          />
        ))}

        {/* Selection line */}
        {selectedIndex !== null && (
          <View
            style={{
              position: "absolute",
              top: 0,
              width: 2,
              zIndex: 10,
              left: getXPosition(selectedIndex),
              height: CHART_HEIGHT,
              backgroundColor: color,
            }}
          />
        )}

        {/* Chart */}
        <LineChart
          data={chartData}
          width={chartDrawableWidth}
          height={CHART_HEIGHT}
          color={color}
          thickness={2}
          hideDataPoints={isInterpolated}
          dataPointsColor={color}
          dataPointsRadius={3}
          xAxisColor={theme.textSecondary + "40"}
          yAxisColor={theme.textSecondary + "40"}
          xAxisLabelTextStyle={{ color: theme.textSecondary, fontSize: 9 }}
          yAxisTextStyle={{ color: theme.textSecondary, fontSize: 9 }}
          yAxisLabelWidth={Y_AXIS_WIDTH - 5}
          curved
          areaChart
          startFillColor={color}
          endFillColor={theme.background}
          startOpacity={0.3}
          endOpacity={0}
          isAnimated={false}
          showVerticalLines={false}
          noOfSections={4}
          spacing={spacing}
          initialSpacing={0}
          endSpacing={0}
          rulesType="solid"
          rulesColor={theme.textSecondary + "15"}
          yAxisThickness={1}
          xAxisThickness={1}
          disableScroll
          xAxisLabelsHeight={X_AXIS_LABEL_HEIGHT}
        />
      </View>

      {/* Time label */}
      <View className="center" style={{ height: vs(24), marginTop: vs(4) }}>
        {selectedPoint && (
          <View className="bg-neutral-900 rounded" style={{ paddingHorizontal: s(10), paddingVertical: vs(3) }}>
            <Text className="text-white font-semibold" style={{ fontSize: ms(10, 0.3) }}>
              {getTimeLabel()}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

export default ChartCard;
