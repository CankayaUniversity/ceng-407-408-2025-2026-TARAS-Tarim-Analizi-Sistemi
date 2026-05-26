// Adim 4a: Sera bolge bolme — dis sinir icinde cizgi cekerek zone ayirma
// Kullanici iki nokta secer, sistem zone'u ikiye boler

import { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
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
import { generateId, splitPolygon, findZoneForPoint } from "./addFieldUtils";
import type { StepProps, ZoneDraft } from "./types";

const CANVAS_PADDING = 5;
const GRID_STEP = 10;

export const GreenhouseZonesStep = ({
  theme,
  state,
  onUpdate,
  onNext,
}: StepProps) => {
  const { t } = useLanguage();
  const [error, setError] = useState<string | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // Bolme cizgisi icin ilk nokta (ikinci nokta secilince bolme yapilir)
  const [splitStart, setSplitStart] = useState<[number, number] | null>(null);

  // Zone isim duzenleme
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  // Undo icin gecmis zone state'leri
  const historyRef = useRef<ZoneDraft[][]>([]);

  const bounds = {
    minX: 0 - CANVAS_PADDING,
    maxX: 100 + CANVAS_PADDING,
    minY: 0 - CANVAS_PADDING,
    maxY: 100 + CANVAS_PADDING,
  };
  const viewWidth = bounds.maxX - bounds.minX;
  const viewHeight = bounds.maxY - bounds.minY;

  // Ilk acilista boundary'den tek zone olustur
  if (state.zones.length === 0 && state.outerPolygon.length >= 3) {
    const initialZone: ZoneDraft = {
      id: generateId(),
      name: `${t.addField.zoneNamePlaceholder.replace("örn. ", "").replace("e.g. ", "")} 1`,
      zoneType: "POLYGON",
      polygonPoints: [...state.outerPolygon],
    };
    onUpdate({ zones: [initialZone] });
  }

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setContainerSize({ width, height });
  }, []);

  const touchToCoord = useCallback(
    (e: GestureResponderEvent): [number, number] | null => {
      if (containerSize.width === 0 || containerSize.height === 0) return null;
      const { locationX, locationY } = e.nativeEvent;
      const x = bounds.minX + (locationX / containerSize.width) * viewWidth;
      const y = bounds.minY + (locationY / containerSize.height) * viewHeight;
      const snappedX = Math.round(x / GRID_STEP) * GRID_STEP;
      const snappedY = Math.round(y / GRID_STEP) * GRID_STEP;
      return [
        Math.max(0, Math.min(100, snappedX)),
        Math.max(0, Math.min(100, snappedY)),
      ];
    },
    [containerSize, bounds, viewWidth, viewHeight],
  );

  const handleCanvasTouch = useCallback(
    (e: GestureResponderEvent) => {
      const coord = touchToCoord(e);
      if (!coord) return;
      setError(null);

      if (!splitStart) {
        // Ilk nokta
        setSplitStart(coord);
      } else {
        // Ikinci nokta → bolme yap
        const midX = (splitStart[0] + coord[0]) / 2;
        const midY = (splitStart[1] + coord[1]) / 2;
        const zoneIdx = findZoneForPoint([midX, midY], state.zones);
        const zone = state.zones[zoneIdx];

        if (!zone) {
          setSplitStart(null);
          return;
        }

        const result = splitPolygon(zone.polygonPoints, splitStart, coord);
        if (!result) {
          setError(t.addField.splitFailed || "Bolme basarisiz — farkli noktalar secin");
          setSplitStart(null);
          return;
        }

        // Gecmise kaydet (undo icin)
        historyRef.current.push([...state.zones]);

        const [polyA, polyB] = result;
        const newZones = [...state.zones];
        const nextNum = state.zones.length + 1;

        newZones.splice(zoneIdx, 1, {
          ...zone,
          polygonPoints: polyA,
        }, {
          id: generateId(),
          name: `${t.addField.zoneNamePlaceholder.replace("örn. ", "").replace("e.g. ", "")} ${nextNum}`,
          zoneType: "POLYGON",
          polygonPoints: polyB,
        });

        onUpdate({ zones: newZones });
        setSplitStart(null);
      }
    },
    [touchToCoord, splitStart, state.zones, onUpdate, t],
  );

  const handleUndo = useCallback(() => {
    if (historyRef.current.length > 0) {
      const prev = historyRef.current.pop()!;
      onUpdate({ zones: prev });
      setSplitStart(null);
    }
  }, [onUpdate]);

  const handleCancelSplit = useCallback(() => {
    setSplitStart(null);
  }, []);

  const handleStartRename = (zone: ZoneDraft) => {
    setEditingZoneId(zone.id);
    setEditName(zone.name);
  };

  const handleFinishRename = () => {
    if (editingZoneId && editName.trim()) {
      onUpdate({
        zones: state.zones.map((z) =>
          z.id === editingZoneId ? { ...z, name: editName.trim() } : z,
        ),
      });
    }
    setEditingZoneId(null);
  };

  const handleNext = () => {
    if (state.zones.length === 0) {
      setError(t.addField.minOneZone);
      return;
    }
    setError(null);
    onNext();
  };

  const pointsToSvg = (pts: [number, number][]) =>
    pts.map((p) => `${p[0]},${p[1]}`).join(" ");

  const zoneColors = ["#4CAF50", "#2196F3", "#FF9800", "#9C27B0", "#F44336", "#00BCD4", "#795548", "#607D8B"];

  return (
    <ScrollView
      style={{ flex: 1, padding: s(20) }}
      keyboardShouldPersistTaps="handled"
    >
      <Text
        style={{ fontSize: ms(20, 0.3), marginBottom: vs(4), color: theme.textMain, fontWeight: "bold" }}
      >
        {t.addField.drawZones}
      </Text>
      <Text
        style={{ fontSize: ms(13, 0.3), marginBottom: vs(16), color: theme.textSecondary }}
      >
        {t.addField.splitZonesHint || "Bölmek istediğiniz iki noktaya dokunun"}
      </Text>

      {error && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            borderRadius: 8,
            backgroundColor: theme.danger + "20",
            paddingVertical: vs(10),
            paddingHorizontal: s(16),
            marginBottom: vs(12),
          }}
        >
          <MaterialCommunityIcons
            name="alert-circle"
            size={18}
            color={theme.danger}
            style={{ marginRight: s(8) }}
          />
          <Text style={{ flex: 1, fontSize: ms(13, 0.3), color: theme.danger }}>
            {error}
          </Text>
        </View>
      )}

      {/* SVG Canvas — zone bolme */}
      <View
        onLayout={onLayout}
        onStartShouldSetResponder={() => true}
        onResponderRelease={handleCanvasTouch}
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
            {/* Grid */}
            {Array.from({ length: Math.floor(100 / GRID_STEP) + 1 }, (_, i) => {
              const pos = i * GRID_STEP;
              return [
                <Line key={`gv-${i}`} x1={pos} y1={0} x2={pos} y2={100} stroke={theme.border} strokeWidth={0.3} />,
                <Line key={`gh-${i}`} x1={0} y1={pos} x2={100} y2={pos} stroke={theme.border} strokeWidth={0.3} />,
              ];
            })}

            {/* Grid kesisim noktalari */}
            {Array.from({ length: Math.floor(100 / GRID_STEP) + 1 }, (_, row) =>
              Array.from({ length: Math.floor(100 / GRID_STEP) + 1 }, (_, col) => (
                <Circle key={`gp-${row}-${col}`} cx={col * GRID_STEP} cy={row * GRID_STEP} r={0.6} fill={theme.textMuted + "60"} />
              )),
            )}

            {/* Dis sinir */}
            {state.outerPolygon.length >= 3 && (
              <SvgPolygon
                points={pointsToSvg(state.outerPolygon)}
                fill="none"
                stroke={theme.primary}
                strokeWidth={1}
                strokeDasharray="4,2"
              />
            )}

            {/* Zone'lar */}
            {state.zones.map((zone, i) => {
              if (zone.polygonPoints.length < 3) return null;
              const centroid = getCentroid(zone.polygonPoints);
              const color = zoneColors[i % zoneColors.length];
              return (
                <View key={zone.id}>
                  <SvgPolygon
                    points={pointsToSvg(zone.polygonPoints)}
                    fill={color + "25"}
                    stroke={color}
                    strokeWidth={0.8}
                  />
                  <SvgText
                    x={centroid[0]}
                    y={centroid[1]}
                    fill={color}
                    fontSize={3.5}
                    fontWeight="700"
                    textAnchor="middle"
                    alignmentBaseline="central"
                  >
                    {zone.name}
                  </SvgText>
                </View>
              );
            })}

            {/* Aktif bolme baslangic noktasi */}
            {splitStart && (
              <Circle cx={splitStart[0]} cy={splitStart[1]} r={3} fill={theme.accent} stroke={theme.textOnPrimary} strokeWidth={0.5} />
            )}
          </Svg>
        )}
      </View>

      {/* Aksiyonlar */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: vs(12), gap: s(12), justifyContent: "center" }}>
        {splitStart && (
          <TouchableOpacity
            style={{
              flexDirection: 'row', alignItems: 'center', borderRadius: 8,
              paddingVertical: vs(8), paddingHorizontal: s(14),
              backgroundColor: theme.danger + "15", borderWidth: 1, borderColor: theme.danger,
            }}
            onPress={handleCancelSplit}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="close" size={16} color={theme.danger} style={{ marginRight: s(4) }} />
            <Text style={{ fontSize: ms(13, 0.3), color: theme.danger }}>
              {t.addField.cancelSplit || "İptal"}
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={{
            flexDirection: 'row', alignItems: 'center', borderRadius: 8,
            paddingVertical: vs(8), paddingHorizontal: s(14),
            backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border,
            opacity: historyRef.current.length === 0 ? 0.4 : 1,
          }}
          onPress={handleUndo}
          disabled={historyRef.current.length === 0}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="undo" size={16} color={theme.textSecondary} style={{ marginRight: s(4) }} />
          <Text style={{ fontSize: ms(13, 0.3), color: theme.textSecondary }}>
            {t.addField.undoPoint}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Durum gostergesi */}
      <Text style={{ fontSize: ms(12, 0.3), marginTop: vs(8), textAlign: 'center', color: theme.textSecondary }}>
        {splitStart
          ? (t.addField.selectSecondPoint || "İkinci noktayı seçin")
          : `${state.zones.length} ${t.addField.zoneCountLabel.toLowerCase()}`}
      </Text>

      {/* Zone listesi — isim duzenleme */}
      {state.zones.length > 0 && (
        <View style={{ marginTop: vs(16) }}>
          {state.zones.map((zone, i) => {
            const color = zoneColors[i % zoneColors.length];
            const isEditing = editingZoneId === zone.id;
            return (
              <View
                key={zone.id}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  paddingVertical: vs(10), paddingHorizontal: s(12), marginBottom: vs(8),
                  backgroundColor: theme.surface, borderRadius: 8,
                  borderWidth: 1, borderColor: color + "40",
                  borderLeftWidth: 4, borderLeftColor: color,
                }}
              >
                <View style={{ flex: 1 }}>
                  {isEditing ? (
                    <TextInput
                      style={{
                        fontSize: ms(14, 0.3), color: theme.textMain,
                        paddingVertical: vs(4), paddingHorizontal: s(8),
                        borderWidth: 1, borderColor: theme.border, borderRadius: 6,
                        backgroundColor: theme.background,
                      }}
                      value={editName}
                      onChangeText={setEditName}
                      onBlur={handleFinishRename}
                      onSubmitEditing={handleFinishRename}
                      autoFocus
                    />
                  ) : (
                    <TouchableOpacity onPress={() => handleStartRename(zone)}>
                      <Text style={{ fontSize: ms(14, 0.3), color: theme.textMain, fontWeight: "600" }}>
                        {zone.name}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
                {!isEditing && (
                  <TouchableOpacity
                    onPress={() => handleStartRename(zone)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <MaterialCommunityIcons name="pencil-outline" size={18} color={theme.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* Ileri butonu */}
      <TouchableOpacity
        style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
          borderRadius: 12, backgroundColor: theme.primary,
          paddingVertical: vs(14), paddingHorizontal: s(24),
          marginTop: vs(20), marginBottom: vs(40),
          opacity: state.zones.length === 0 ? 0.5 : 1,
        }}
        onPress={handleNext}
        activeOpacity={0.7}
      >
        <Text style={{ fontSize: ms(16, 0.3), color: theme.textOnPrimary, fontWeight: 'bold' }}>
          {t.addField.next}
        </Text>
        <MaterialCommunityIcons name="chevron-right" size={20} color={theme.textOnPrimary} style={{ marginLeft: s(4) }} />
      </TouchableOpacity>
    </ScrollView>
  );
};

function getCentroid(pts: [number, number][]): [number, number] {
  const n = pts.length;
  if (n === 0) return [50, 50];
  const sx = pts.reduce((s, p) => s + p[0], 0);
  const sy = pts.reduce((s, p) => s + p[1], 0);
  return [sx / n, sy / n];
}
