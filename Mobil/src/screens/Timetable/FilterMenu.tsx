// Timetable filtre menusu — full-screen modal
// Davranis:
//   - Acildiginda parent state'in snapshotu draft state'e alinir.
//   - Tum filtre etkilesimleri DRAFT'i guncelloyor; ana state degismez.
//   - "Uygula" tusu draft'i parent state'e yazar ve modal'i kapatir.
//   - "Sıfırla" tusu draft'i ve parent state'i default'lara dondurur, modal acik kalir.
//   - Geri/X/backdrop ile cikis draft'i iptal eder; parent state degismez.
//   - Apply enabled iff draft != current parent state.
//   - Reset enabled iff draft != defaults.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Platform,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Theme } from "../../utils/theme";
import { useLanguage } from "../../context/LanguageContext";
import { s, vs, ms } from "../../utils/responsive";
import { OptionButton } from "../../components/OptionButton";
import { OptionDropdown } from "../../components/OptionDropdown";
import { ActionButton } from "../../components/ActionButton";
import { BottomSheet } from "../../components/BottomSheet";
import type {
  AggregationMode,
  MetricKey,
  TimeRange,
  ZoneMeta,
} from "./types";

export interface FilterDefaults {
  mode: AggregationMode;
  range: TimeRange;
  metrics: Set<MetricKey>;
  zones: Set<string> | null;
}

interface FilterMenuProps {
  theme: Theme;
  visible: boolean;
  onClose: () => void;

  zones: ZoneMeta[];

  selectedZoneIds: Set<string> | null; // null -> all zones (field-wide)
  setSelectedZoneIds: (next: Set<string> | null) => void;

  mode: AggregationMode;
  setMode: (mode: AggregationMode) => void;

  range: TimeRange;
  setRange: (r: TimeRange) => void;

  selectedMetrics: Set<MetricKey>;
  setSelectedMetrics: (m: Set<MetricKey>) => void;

  metricOptions: { key: MetricKey; label: string }[];

  presetRanges: { hours: number; label: string }[];

  /** Default values used by the Reset button */
  defaults: FilterDefaults;
}

// Karsılastırma yardımcıları
function sameSet<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

function sameZones(a: Set<string> | null, b: Set<string> | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return sameSet(a, b);
}

function sameRange(a: TimeRange, b: TimeRange): boolean {
  if (a.preset !== b.preset) return false;
  const aFrom = a.from?.getTime() ?? null;
  const bFrom = b.from?.getTime() ?? null;
  if (aFrom !== bFrom) return false;
  const aTo = a.to?.getTime() ?? null;
  const bTo = b.to?.getTime() ?? null;
  return aTo === bTo;
}

export const FilterMenu = ({
  theme,
  visible,
  onClose,
  zones,
  selectedZoneIds,
  setSelectedZoneIds,
  mode,
  setMode,
  range,
  setRange,
  selectedMetrics,
  setSelectedMetrics,
  metricOptions,
  presetRanges,
  defaults,
}: FilterMenuProps) => {
  const { t } = useLanguage();
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);

  // Draft state — modal acildiginda parent state'ten initialize edilir.
  const [draftMode, setDraftMode] = useState<AggregationMode>(mode);
  const [draftRange, setDraftRange] = useState<TimeRange>(range);
  const [draftMetrics, setDraftMetrics] = useState<Set<MetricKey>>(
    () => new Set(selectedMetrics),
  );
  const [draftZones, setDraftZones] = useState<Set<string> | null>(selectedZoneIds);

  // Modal acildiginda snapshot al (false→true gecisi).
  const prevVisibleRef = useRef(false);
  useEffect(() => {
    if (visible && !prevVisibleRef.current) {
      setDraftMode(mode);
      setDraftRange(range);
      setDraftMetrics(new Set(selectedMetrics));
      setDraftZones(selectedZoneIds);
    }
    prevVisibleRef.current = visible;
  }, [visible, mode, range, selectedMetrics, selectedZoneIds]);

  const allSelected =
    draftZones === null || draftZones.size === zones.length;

  // Draft mutator'lar — sadece local state'i degistirir
  const toggleZone = useCallback(
    (zoneId: string) => {
      setDraftZones((current) => {
        const base = current ?? new Set(zones.map((z) => z.zone_id));
        const next = new Set(base);
        if (next.has(zoneId)) next.delete(zoneId);
        else next.add(zoneId);
        return next.size === zones.length ? null : next;
      });
    },
    [zones],
  );

  const selectAllZones = useCallback(() => setDraftZones(null), []);

  const toggleMetric = useCallback((key: MetricKey) => {
    setDraftMetrics((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key); // en az 1 metrik
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  // Custom range yalnizca tarih (gun) cozunurluklu — Android'de
  // @react-native-community/datetimepicker'in `mode="datetime"`i desteklenmiyor; "date" tek seferlik secim verir.
  // From: secilen gunun baslangici (00:00); To: secilen gunun sonu (23:59:59).
  const setCustomRange = useCallback((from: Date, to: Date) => {
    const fromStart = new Date(from);
    fromStart.setHours(0, 0, 0, 0);
    const toEnd = new Date(to);
    toEnd.setHours(23, 59, 59, 999);
    setDraftRange({
      from: fromStart,
      to: toEnd,
      label: `${fromStart.toLocaleDateString()} - ${toEnd.toLocaleDateString()}`,
    });
  }, []);

  // Range dropdown handler — sentinel -1 = "Custom", from picker'i zincirleyerek to picker'i acar.
  // Preset (positive hours) ise normal preset set.
  const setPreset = useCallback(
    (hours: number) => {
      if (hours === -1) {
        // Eger draft zaten custom degilse, default 24 saatlik bir from/to ile baslat
        // (kullanici picker'i bos gormesin diye). From picker'i hemen ac.
        if (draftRange.preset !== undefined) {
          const defaultFrom = new Date(Date.now() - 24 * 60 * 60 * 1000);
          const defaultTo = new Date();
          setCustomRange(defaultFrom, defaultTo);
        }
        setShowFromPicker(true);
        return;
      }
      const found = presetRanges.find((p) => p.hours === hours);
      setDraftRange({ preset: hours, label: found?.label ?? `${hours}h` });
    },
    [presetRanges, draftRange.preset, setCustomRange],
  );

  const isCustom = !draftRange.preset;

  const modeDropdownOptions = useMemo(
    () => [
      { value: "per_node" as AggregationMode, label: t.timetable.modePerNode, icon: "view-grid" },
      { value: "per_zone_avg" as AggregationMode, label: t.timetable.modePerZone, icon: "layers-triple" },
      { value: "field_avg" as AggregationMode, label: t.timetable.modeFieldAvg, icon: "vector-combine" },
    ],
    [t],
  );
  // Preset secenekler + sentinel "-1" = Custom (alt sira). Custom secilince setPreset zinciri date picker'i acar.
  const rangeDropdownOptions = useMemo(
    () => [
      ...presetRanges.map((p) => ({ value: p.hours, label: p.label })),
      { value: -1, label: t.timetable.custom, icon: "calendar-range" },
    ],
    [presetRanges, t],
  );

  // Apply / Reset enabled hesaplari
  const draftEqualsCurrent =
    draftMode === mode &&
    sameRange(draftRange, range) &&
    sameSet(draftMetrics, selectedMetrics) &&
    sameZones(draftZones, selectedZoneIds);

  const draftEqualsDefaults =
    draftMode === defaults.mode &&
    sameRange(draftRange, defaults.range) &&
    sameSet(draftMetrics, defaults.metrics) &&
    sameZones(draftZones, defaults.zones);

  const canApply = !draftEqualsCurrent;
  const canReset = !draftEqualsDefaults;

  const handleApply = useCallback(() => {
    setMode(draftMode);
    setRange(draftRange);
    setSelectedMetrics(draftMetrics);
    setSelectedZoneIds(draftZones);
    onClose();
  }, [
    draftMode,
    draftRange,
    draftMetrics,
    draftZones,
    setMode,
    setRange,
    setSelectedMetrics,
    setSelectedZoneIds,
    onClose,
  ]);

  const handleReset = useCallback(() => {
    setDraftMode(defaults.mode);
    setDraftRange(defaults.range);
    setDraftMetrics(new Set(defaults.metrics));
    setDraftZones(defaults.zones);
    // Reset ayrica parent'a uygulanir (sayfa yenilensin), modal acik kalir.
    setMode(defaults.mode);
    setRange(defaults.range);
    setSelectedMetrics(new Set(defaults.metrics));
    setSelectedZoneIds(defaults.zones);
  }, [
    defaults,
    setMode,
    setRange,
    setSelectedMetrics,
    setSelectedZoneIds,
  ]);

  return (
    <BottomSheet
      visible={visible}
      theme={theme}
      onClose={onClose}
      title={t.timetable.filters}
      scroll
      contentContainerStyle={{ paddingHorizontal: s(16), paddingBottom: vs(16) }}
      footer={
        <View
          style={{
            flexDirection: "row",
            gap: s(10),
            paddingHorizontal: s(16),
            paddingTop: vs(10),
            borderTopWidth: 1,
            borderTopColor: theme.divider,
          }}
        >
          <ActionButton
            theme={theme}
            label={t.timetable.resetFilters}
            variant="secondary"
            disabled={!canReset}
            onPress={handleReset}
          />
          <ActionButton
            theme={theme}
            label={t.timetable.applyFilters}
            variant="primary"
            disabled={!canApply}
            onPress={handleApply}
          />
        </View>
      }
    >
            {/* MOD + ZAMAN ARALIGI — yan yana iki sutun; her sutunun ustunde baslik var.
                Custom tarih araligi ZAMAN ARALIGI dropdown'inin icinde sentinel olarak yer alir;
                secince zincirleme from->to date picker'i acilir. */}
            <View
              style={{
                flexDirection: "row",
                gap: s(8),
                marginBottom: vs(12),
                marginTop: vs(4),
              }}
            >
              <View style={{ flex: 1 }}>
                <SectionLabel theme={theme} title={t.timetable.aggregationMode} />
                <OptionDropdown
                  theme={theme}
                  label={t.timetable.aggregationMode}
                  showLabel={false}
                  value={draftMode}
                  options={modeDropdownOptions}
                  onChange={setDraftMode}
                  statusBarTranslucent
                />
              </View>
              <View style={{ flex: 1 }}>
                <SectionLabel theme={theme} title={t.timetable.timeRange} />
                <OptionDropdown
                  theme={theme}
                  label={t.timetable.timeRange}
                  showLabel={false}
                  value={draftRange.preset ?? -1}
                  options={rangeDropdownOptions}
                  onChange={setPreset}
                  displayLabel={isCustom ? draftRange.label : undefined}
                  statusBarTranslucent
                />
              </View>
            </View>

            {/* Custom date picker — From secimi To picker'ini otomatik zincirler. */}
            {showFromPicker && (
              <DateTimePicker
                value={draftRange.from ?? new Date(Date.now() - 24 * 60 * 60 * 1000)}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(_, date) => {
                  setShowFromPicker(false);
                  if (date) {
                    const to = draftRange.to ?? new Date();
                    setCustomRange(date, to);
                    // Android'de from picker kapandiktan hemen sonra to picker'i ac.
                    if (Platform.OS === "android") setShowToPicker(true);
                  }
                }}
              />
            )}
            {showToPicker && (
              <DateTimePicker
                value={draftRange.to ?? new Date()}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(_, date) => {
                  setShowToPicker(false);
                  if (date) {
                    const from = draftRange.from ?? new Date(Date.now() - 24 * 60 * 60 * 1000);
                    setCustomRange(from, date);
                  }
                }}
              />
            )}

            {/* METRICS — multi-select OptionButton (draft).
                ET0 cikarildigi icin 3 metric kaldi; tek satirda esit dagilim icin flex:1. */}
            <SectionLabel theme={theme} title={t.timetable.metrics} />
            <View
              style={{
                flexDirection: "row",
                gap: 8,
                marginBottom: vs(12),
              }}
            >
              {metricOptions.map((m) => (
                <OptionButton
                  key={m.key}
                  theme={theme}
                  label={m.label}
                  active={draftMetrics.has(m.key)}
                  onPress={() => toggleMetric(m.key)}
                  style={{ flex: 1 }}
                />
              ))}
            </View>

            {/* ZONE FILTER — multi-select OptionButton (draft).
                "Select All/None" tek bir toggle butonu: hepsi seciliyse "None"a tikla -> bos set,
                aksi durumda "All"a tikla -> null (hepsi). */}
            {zones.length > 0 && (
              <>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: vs(6),
                  }}
                >
                  <Text
                    style={{
                      fontSize: ms(13, 0.3),
                      fontWeight: "700",
                      color: theme.textMain,
                    }}
                  >
                    {t.timetable.zones}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      if (allSelected) setDraftZones(new Set()); // hepsi acikti -> hicbiri
                      else selectAllZones(); // bazi/hicbiri acikti -> hepsi (null)
                    }}
                    style={{ paddingHorizontal: 8, paddingVertical: 4 }}
                  >
                    <Text
                      style={{
                        fontSize: ms(11, 0.3),
                        color: theme.primary,
                        fontWeight: "600",
                      }}
                    >
                      {allSelected ? t.timetable.selectNone : t.timetable.selectAll}
                    </Text>
                  </TouchableOpacity>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 8,
                    marginBottom: vs(8),
                  }}
                >
                  {zones.map((z) => {
                    const active =
                      draftZones === null || draftZones.has(z.zone_id);
                    return (
                      <OptionButton
                        key={z.zone_id}
                        theme={theme}
                        label={`${z.zone_name} (${z.node_ids.length})`}
                        active={active}
                        onPress={() => toggleZone(z.zone_id)}
                        style={{ flexBasis: "48%", flexGrow: 0 }}
                      />
                    );
                  })}
                </View>
              </>
            )}
    </BottomSheet>
  );
};

interface SectionLabelProps {
  theme: Theme;
  title: string;
}

const SectionLabel = ({ theme, title }: SectionLabelProps) => (
  <Text
    style={{
      fontSize: ms(13, 0.3),
      fontWeight: "700",
      color: theme.textMain,
      marginBottom: vs(6),
    }}
  >
    {title}
  </Text>
);

export default FilterMenu;
