// SVG polygon editoru — grid snap, nearest-edge insertion, point dragging
// viewBox 0-100 koordinat alaninda calisir (FieldPolygon ile uyumlu)

import { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  LayoutChangeEvent,
  GestureResponderEvent,
} from "react-native";
import Svg, {
  Polygon as SvgPolygon,
  Circle,
  Line,
  Text as SvgText,
} from "react-native-svg";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useLanguage } from "../../context/LanguageContext";
import { s, vs, ms } from "../../utils/responsive";
import type { Theme } from "../../utils/theme";
import type { ZoneDraft } from "./types";

interface PolygonCanvasProps {
  theme: Theme;
  points: [number, number][];
  onPointsChange: (points: [number, number][]) => void;
  /** Kilitli dis sinir — bolge editoru icin */
  lockedBoundary?: [number, number][];
  /** Tamamlanmis bolgeler — bolge editoru icin */
  completedZones?: ZoneDraft[];
  /** Sinirlar: canvas'in hangi koordinat araligini gosterecegi */
  viewBounds?: { minX: number; maxX: number; minY: number; maxY: number };
}

const CANVAS_PADDING = 5;
const GRID_STEP = 10;
const POINT_RADIUS = 3;
const DRAG_THRESHOLD = 8; // SVG biriminde, bir noktaya ne kadar yakin tiklayinca surukleme baslar

export const PolygonCanvas = ({
  theme,
  points,
  onPointsChange,
  lockedBoundary,
  completedZones,
  viewBounds,
}: PolygonCanvasProps) => {
  const { t } = useLanguage();
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const containerRef = useRef<View>(null);
  const dragIndexRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);

  const bounds = viewBounds ?? {
    minX: 0 - CANVAS_PADDING,
    maxX: 100 + CANVAS_PADDING,
    minY: 0 - CANVAS_PADDING,
    maxY: 100 + CANVAS_PADDING,
  };

  const viewWidth = bounds.maxX - bounds.minX;
  const viewHeight = bounds.maxY - bounds.minY;

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setContainerSize({ width, height });
  }, []);

  // Dokunma konumundan SVG koordinatina donusum + grid snap
  const touchToCoord = useCallback(
    (e: GestureResponderEvent): [number, number] | null => {
      if (containerSize.width === 0 || containerSize.height === 0) return null;
      const { locationX, locationY } = e.nativeEvent;
      const x = bounds.minX + (locationX / containerSize.width) * viewWidth;
      const y = bounds.minY + (locationY / containerSize.height) * viewHeight;

      // Grid'e snap
      const snappedX = Math.round(x / GRID_STEP) * GRID_STEP;
      const snappedY = Math.round(y / GRID_STEP) * GRID_STEP;

      // 0-100 arasi sinirla
      const clampedX = Math.max(0, Math.min(100, snappedX));
      const clampedY = Math.max(0, Math.min(100, snappedY));

      return [clampedX, clampedY];
    },
    [containerSize, bounds, viewWidth, viewHeight],
  );

  // En yakin noktanin indeksini bul (drag icin)
  const findNearestPointIndex = useCallback(
    (coord: [number, number]): number | null => {
      let minDist = Infinity;
      let bestIdx: number | null = null;
      for (let i = 0; i < points.length; i++) {
        const dx = points[i][0] - coord[0];
        const dy = points[i][1] - coord[1];
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist) {
          minDist = dist;
          bestIdx = i;
        }
      }
      return minDist <= DRAG_THRESHOLD ? bestIdx : null;
    },
    [points],
  );

  // 3+ noktadan sonra yeni noktanin hangi kenara en yakin oldugunu bul
  const findNearestEdgeIndex = useCallback(
    (coord: [number, number]): number => {
      let minDist = Infinity;
      let bestEdge = points.length - 1; // default: son kenar
      const n = points.length;
      for (let i = 0; i < n; i++) {
        const a = points[i];
        const b = points[(i + 1) % n];
        const dist = pointToSegmentDist(coord, a, b);
        if (dist < minDist) {
          minDist = dist;
          bestEdge = i;
        }
      }
      return bestEdge;
    },
    [points],
  );

  // Touch basla — surukleme mi yeni nokta mi karar ver
  const handleResponderGrant = useCallback(
    (e: GestureResponderEvent) => {
      const coord = touchToCoord(e);
      if (!coord) return;

      const nearIdx = findNearestPointIndex(coord);
      if (nearIdx !== null) {
        // Mevcut noktaya yakin → surukleme modu
        dragIndexRef.current = nearIdx;
        isDraggingRef.current = true;
      } else {
        dragIndexRef.current = null;
        isDraggingRef.current = false;
      }
    },
    [touchToCoord, findNearestPointIndex],
  );

  // Surukleme hareketi
  const handleResponderMove = useCallback(
    (e: GestureResponderEvent) => {
      if (!isDraggingRef.current || dragIndexRef.current === null) return;
      const coord = touchToCoord(e);
      if (!coord) return;

      const newPoints = [...points];
      newPoints[dragIndexRef.current] = coord;
      onPointsChange(newPoints);
    },
    [touchToCoord, points, onPointsChange],
  );

  // Touch bitti — surukleme degilse yeni nokta ekle
  const handleResponderRelease = useCallback(
    (e: GestureResponderEvent) => {
      if (isDraggingRef.current) {
        // Surukleme bitti, son konuma birak
        const coord = touchToCoord(e);
        if (coord && dragIndexRef.current !== null) {
          const newPoints = [...points];
          newPoints[dragIndexRef.current] = coord;
          onPointsChange(newPoints);
        }
        isDraggingRef.current = false;
        dragIndexRef.current = null;
        return;
      }

      // Yeni nokta ekle
      const coord = touchToCoord(e);
      if (!coord) return;

      if (points.length < 3) {
        // Ilk 3 nokta: sona ekle
        onPointsChange([...points, coord]);
      } else {
        // 3+ nokta: en yakin kenara ekle
        const edgeIdx = findNearestEdgeIndex(coord);
        const newPoints = [...points];
        newPoints.splice(edgeIdx + 1, 0, coord);
        onPointsChange(newPoints);
      }
    },
    [touchToCoord, points, onPointsChange, findNearestEdgeIndex],
  );

  const handleUndo = useCallback(() => {
    if (points.length > 0) {
      onPointsChange(points.slice(0, -1));
    }
  }, [points, onPointsChange]);

  const handleClear = useCallback(() => {
    onPointsChange([]);
  }, [onPointsChange]);

  const pointsToSvg = (pts: [number, number][]) =>
    pts.map((p) => `${p[0]},${p[1]}`).join(" ");

  const hasEnoughPoints = points.length >= 3;

  return (
    <View>
      {/* SVG canvas */}
      <View
        ref={containerRef}
        onLayout={onLayout}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={handleResponderGrant}
        onResponderMove={handleResponderMove}
        onResponderRelease={handleResponderRelease}
        style={{
          width: "100%",
          aspectRatio: viewWidth / viewHeight,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: theme.border,
          backgroundColor: theme.surface,
          overflow: "hidden",
        }}
      >
        {containerSize.width > 0 && (
          <Svg
            width="100%"
            height="100%"
            viewBox={`${bounds.minX} ${bounds.minY} ${viewWidth} ${viewHeight}`}
          >
            {/* Arka plan gridi */}
            {Array.from(
              { length: Math.floor(100 / GRID_STEP) + 1 },
              (_, i) => {
                const pos = i * GRID_STEP;
                return (
                  <Line
                    key={`gv-${i}`}
                    x1={pos}
                    y1={0}
                    x2={pos}
                    y2={100}
                    stroke={theme.border}
                    strokeWidth={0.3}
                  />
                );
              },
            )}
            {Array.from(
              { length: Math.floor(100 / GRID_STEP) + 1 },
              (_, i) => {
                const pos = i * GRID_STEP;
                return (
                  <Line
                    key={`gh-${i}`}
                    x1={0}
                    y1={pos}
                    x2={100}
                    y2={pos}
                    stroke={theme.border}
                    strokeWidth={0.3}
                  />
                );
              },
            )}

            {/* Grid kesisim noktalari */}
            {Array.from(
              { length: Math.floor(100 / GRID_STEP) + 1 },
              (_, row) =>
                Array.from(
                  { length: Math.floor(100 / GRID_STEP) + 1 },
                  (_, col) => (
                    <Circle
                      key={`gp-${row}-${col}`}
                      cx={col * GRID_STEP}
                      cy={row * GRID_STEP}
                      r={0.6}
                      fill={theme.textMuted + "60"}
                    />
                  ),
                ),
            )}

            {/* Kilitli dis sinir (sera bolge editoru) */}
            {lockedBoundary && lockedBoundary.length >= 3 && (
              <SvgPolygon
                points={pointsToSvg(lockedBoundary)}
                fill={theme.primary + "08"}
                stroke={theme.primary}
                strokeWidth={0.8}
                strokeDasharray="3,3"
              />
            )}

            {/* Tamamlanmis bolgeler */}
            {completedZones?.map((zone) => {
              if (zone.polygonPoints.length < 3) return null;
              const centroid = getCentroid(zone.polygonPoints);
              return (
                <View key={zone.id}>
                  <SvgPolygon
                    points={pointsToSvg(zone.polygonPoints)}
                    fill={theme.textSecondary + "15"}
                    stroke={theme.textSecondary}
                    strokeWidth={0.6}
                  />
                  <SvgText
                    x={centroid[0]}
                    y={centroid[1]}
                    fill={theme.textSecondary}
                    fontSize={3.5}
                    fontWeight="600"
                    textAnchor="middle"
                    alignmentBaseline="central"
                  >
                    {zone.name}
                  </SvgText>
                </View>
              );
            })}

            {/* Aktif poligon dolgusu */}
            {hasEnoughPoints && (
              <SvgPolygon
                points={pointsToSvg(points)}
                fill={theme.primary + "15"}
                stroke={theme.primary}
                strokeWidth={0.8}
              />
            )}

            {/* Kenar cizgileri (polygon kapanmadan once) */}
            {points.length >= 2 &&
              !hasEnoughPoints &&
              points.map((p, i) => {
                if (i === 0) return null;
                const prev = points[i - 1];
                return (
                  <Line
                    key={`edge-${i}`}
                    x1={prev[0]}
                    y1={prev[1]}
                    x2={p[0]}
                    y2={p[1]}
                    stroke={theme.primary}
                    strokeWidth={0.8}
                  />
                );
              })}

            {/* Noktalar */}
            {points.map((p, i) => (
              <Circle
                key={`pt-${i}`}
                cx={p[0]}
                cy={p[1]}
                r={POINT_RADIUS}
                fill={i === 0 ? theme.accent : theme.primary}
                stroke={theme.textOnPrimary}
                strokeWidth={0.5}
              />
            ))}
          </Svg>
        )}
      </View>

      {/* Aksiyonlar */}
      <View
        style={{ flexDirection: 'row', alignItems: 'center', marginTop: vs(12), gap: s(12), justifyContent: "center" }}
      >
        <TouchableOpacity
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            borderRadius: 8,
            paddingVertical: vs(8),
            paddingHorizontal: s(14),
            backgroundColor: theme.surface,
            borderWidth: 1,
            borderColor: theme.border,
            opacity: points.length === 0 ? 0.4 : 1,
          }}
          onPress={handleUndo}
          disabled={points.length === 0}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons
            name="undo"
            size={16}
            color={theme.textSecondary}
            style={{ marginRight: s(4) }}
          />
          <Text
            style={{ fontSize: ms(13, 0.3), color: theme.textSecondary }}
          >
            {t.addField.undoPoint}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            borderRadius: 8,
            paddingVertical: vs(8),
            paddingHorizontal: s(14),
            backgroundColor: theme.surface,
            borderWidth: 1,
            borderColor: theme.border,
            opacity: points.length === 0 ? 0.4 : 1,
          }}
          onPress={handleClear}
          disabled={points.length === 0}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons
            name="delete-outline"
            size={16}
            color={theme.textSecondary}
            style={{ marginRight: s(4) }}
          />
          <Text
            style={{ fontSize: ms(13, 0.3), color: theme.textSecondary }}
          >
            {t.addField.clearAll}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Nokta sayisi bilgisi */}
      <Text
        style={{ fontSize: ms(12, 0.3), marginTop: vs(8), textAlign: 'center', color: theme.textSecondary }}
      >
        {points.length} / 3+
      </Text>
    </View>
  );
};

// ── Yardimci fonksiyonlar ──────────────────────────────────────────────────────

/** Nokta → dogru parcasi mesafesi */
function pointToSegmentDist(
  p: [number, number],
  a: [number, number],
  b: [number, number],
): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const ex = p[0] - a[0];
    const ey = p[1] - a[1];
    return Math.sqrt(ex * ex + ey * ey);
  }
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = a[0] + t * dx;
  const projY = a[1] + t * dy;
  const ex = p[0] - projX;
  const ey = p[1] - projY;
  return Math.sqrt(ex * ex + ey * ey);
}

/** Basit centroid hesabi (label icin) */
function getCentroid(pts: [number, number][]): [number, number] {
  const n = pts.length;
  if (n === 0) return [50, 50];
  const sumX = pts.reduce((s, p) => s + p[0], 0);
  const sumY = pts.reduce((s, p) => s + p[1], 0);
  return [sumX / n, sumY / n];
}
