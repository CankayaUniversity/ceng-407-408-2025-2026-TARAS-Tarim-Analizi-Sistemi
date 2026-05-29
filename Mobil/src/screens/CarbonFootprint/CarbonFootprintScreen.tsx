// Karbon ayak izi ekrani — dashboard gorunumu
// Ozet, en buyuk katki, donut grafik, son aktiviteler, kayit formu (modal)
// Is mantigi (API, state) degistirilmedi — sadece UI yeniden tasarlandi

import { memo, useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
  TouchableWithoutFeedback,
  Dimensions,
} from "react-native";
import Svg, { Circle } from "react-native-svg";
import { BlurView } from "expo-blur";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useLanguage } from "../../context/LanguageContext";
import { usePopupMessage } from "../../context/PopupMessageContext";
import { useDashboard } from "../../context/DashboardContext";
import { useTabReset } from "../../context/TabResetContext";
import { FocusableSection } from "../../components/FocusableSection";
import { BottomSheet } from "../../components/BottomSheet";
import { carbonAPI } from "../../utils/api";
import { spacing, ms, vs, s } from "../../utils/responsive";
import type {
  CarbonFootprintScreenProps,
  ActivityType,
  CarbonLog,
  CarbonSummary,
  CategoryKey,
} from "./types";

// ── Constants ──────────────────────────────────────────────────────────────────

const CATEGORIES: { key: CategoryKey; icon: string }[] = [
  { key: "YAKIT", icon: "gas-station" },
  { key: "GUBRE", icon: "sprout" },
  { key: "ELEKTRIK", icon: "lightning-bolt" },
];

// Donut chart geometry — sized relative to screen width so it dominates the page
const SCREEN_W = Dimensions.get("window").width;
const DONUT_DIAMETER = SCREEN_W * 0.58;
const DONUT_STROKE = DONUT_DIAMETER * 0.14;
const DONUT_RADIUS = (DONUT_DIAMETER - DONUT_STROKE) / 2;
const DONUT_SIZE = DONUT_DIAMETER + 4;
const CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;
const DONUT_CENTER = DONUT_SIZE / 2;

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function categoryLabel(
  key: CategoryKey,
  t: { categoryFuel: string; categoryFertilizer: string; categoryElectricity: string },
): string {
  const map: Record<CategoryKey, string> = {
    YAKIT: t.categoryFuel,
    GUBRE: t.categoryFertilizer,
    ELEKTRIK: t.categoryElectricity,
  };
  return map[key];
}

// ── Screen Component ───────────────────────────────────────────────────────────

export const CarbonFootprintScreen = memo(function CarbonFootprintScreen({
  theme,
  isActive: _isActive = false,
}: CarbonFootprintScreenProps) {
  const { t } = useLanguage();
  const { showPopup } = usePopupMessage();
  const { selectedFarmId: farmId } = useDashboard();
  const scrollRef = useRef<ScrollView>(null);

  // Category → color / icon (MaterialCommunityIcons)
  // Elektrik=sarı(warning), Yakıt=kırmızı(danger), Gübre=yeşil(success)
  const catConfig: Record<CategoryKey, { color: string; icon: string }> = {
    ELEKTRIK: { color: theme.warning, icon: "lightning-bolt" },
    YAKIT: { color: theme.danger, icon: "gas-station" },
    GUBRE: { color: theme.success, icon: "sprout" },
  };

  // ── Data state ─────────────────────────────────────────────────────────────
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activityTypes, setActivityTypes] = useState<Record<string, ActivityType[]>>({});
  const [logs, setLogs] = useState<CarbonLog[]>([]);
  const [summary, setSummary] = useState<CarbonSummary | null>(null);

  // ── Form state ─────────────────────────────────────────────────────────────
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey | null>(null);
  const [selectedType, setSelectedType] = useState<ActivityType | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayStr());
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── UI state ───────────────────────────────────────────────────────────────
  const [detailCategory, setDetailCategory] = useState<CategoryKey | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [recentExpanded, setRecentExpanded] = useState(true);

  // Aktif "carbon" sekmesine tekrar basilinca ana duruma don: acik detay/kayit
  // modallarini kapat ve en uste kaydir.
  useTabReset("carbon", () => {
    setDetailCategory(null);
    setShowAddModal(false);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  });

  // ── Helper ─────────────────────────────────────────────────────────────────
  const getCategoryTotal = (cat: string): number =>
    summary?.by_category.find((c) => c.category === cat)?.total ?? 0;

  // ── Computed values ────────────────────────────────────────────────────────
  const total = summary?.total_emission ?? 0;

  const donutSegments = useMemo(() => {
    const cats: CategoryKey[] = ["ELEKTRIK", "YAKIT", "GUBRE"];
    let offset = 0;
    return cats.map((key) => {
      const catTotal = summary?.by_category.find((c) => c.category === key)?.total ?? 0;
      const arcLength = total > 0 ? (catTotal / total) * CIRCUMFERENCE : 0;
      const seg = { key, arcLength, offset };
      offset += arcLength;
      return seg;
    });
  }, [summary, total]);

  // Sub-type breakdown per category (from individual log entries)
  const getSubTypes = (cat: CategoryKey) => {
    const catLogs = logs.filter((l) => l.activity_type.category === cat);
    const map: Record<string, number> = {};
    catLogs.forEach((log) => {
      const name = log.activity_type.name;
      map[name] = (map[name] ?? 0) + log.emission_amount;
    });
    const catTotal = getCategoryTotal(cat);
    return Object.entries(map)
      .map(([name, subTotal]) => ({
        name,
        total: subTotal,
        percentage: catTotal > 0 ? (subTotal / catTotal) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total);
  };

  const recentLogs = logs;

  const filteredTypes: ActivityType[] = selectedCategory
    ? activityTypes[selectedCategory] ?? []
    : [];

  // ── Data loading (unchanged) ───────────────────────────────────────────────
  const loadInitialData = async (): Promise<void> => {
    if (!farmId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      console.log("[CARBON] farm:", farmId.slice(0, 8));

      const [typesRes, summaryRes, logsRes] = await Promise.all([
        carbonAPI.getActivityTypes(),
        carbonAPI.getSummary(farmId),
        carbonAPI.getLogs(farmId),
      ]);

      if (typesRes.success && typesRes.data) {
        setActivityTypes(typesRes.data);
        console.log("[CARBON] types loaded");
      }
      if (summaryRes.success && summaryRes.data) {
        setSummary(summaryRes.data);
      }
      if (logsRes.success && logsRes.data) {
        setLogs(logsRes.data as CarbonLog[]);
        console.log("[CARBON] logs:", (logsRes.data as CarbonLog[]).length);
      }
    } catch (err) {
      console.log("[CARBON] err:", err);
      showPopup(t.carbon.loadError);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshData = async (): Promise<void> => {
    if (!farmId) return;
    setRefreshing(true);
    try {
      const [summaryRes, logsRes] = await Promise.all([
        carbonAPI.getSummary(farmId),
        carbonAPI.getLogs(farmId),
      ]);
      if (summaryRes.success && summaryRes.data) setSummary(summaryRes.data);
      if (logsRes.success && logsRes.data) setLogs(logsRes.data as CarbonLog[]);
    } catch {
      showPopup(t.carbon.loadError);
    } finally {
      setRefreshing(false);
    }
  };

  // ── Side effects ───────────────────────────────────────────────────────────
  useEffect(() => {
    loadInitialData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farmId]);

  // Reset form when add-modal closes
  useEffect(() => {
    if (!showAddModal) {
      setSelectedCategory(null);
      setSelectedType(null);
      setShowDropdown(false);
      setAmount("");
      setDate(todayStr());
      setNotes("");
    }
  }, [showAddModal]);

  // ── Form handlers (unchanged except submit closes modal) ───────────────────
  const handleSubmit = async (): Promise<void> => {
    if (!farmId || !selectedType) {
      showPopup(t.carbon.typeRequired);
      return;
    }
    const numAmount = parseFloat(amount);
    if (!amount || isNaN(numAmount) || numAmount <= 0) {
      showPopup(t.carbon.amountRequired);
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await carbonAPI.createLog(farmId, {
        activity_type_id: selectedType.activity_type_id,
        activity_date: date || todayStr(),
        activity_amount: numAmount,
        notes: notes || undefined,
      });

      if (res.success && res.data) {
        console.log("[CARBON] log created:", res.data.carbon_log_id.slice(0, 8));
        showPopup(
          `${t.carbon.logSuccess} — ${res.data.emission_amount.toFixed(2)} ${t.carbon.kgCO2}`,
        );
        setShowAddModal(false);
        await refreshData();
      } else {
        showPopup(t.carbon.logError);
      }
    } catch {
      showPopup(t.carbon.logError);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = (log: CarbonLog): void => {
    Alert.alert(t.carbon.deleteConfirmTitle, t.carbon.deleteConfirmMessage, [
      { text: t.common.cancel, style: "cancel" },
      {
        text: t.carbon.deleteConfirmTitle,
        style: "destructive",
        onPress: async () => {
          if (!farmId) return;
          try {
            const res = await carbonAPI.deleteLog(farmId, log.carbon_log_id);
            if (res.success) {
              console.log("[CARBON] deleted:", log.carbon_log_id.slice(0, 8));
              showPopup(t.carbon.deleteSuccess);
              setLogs((prev) =>
                prev.filter((l) => l.carbon_log_id !== log.carbon_log_id),
              );
              const summaryRes = await carbonAPI.getSummary(farmId);
              if (summaryRes.success && summaryRes.data) setSummary(summaryRes.data);
            } else {
              showPopup(t.carbon.deleteError);
            }
          } catch {
            showPopup(t.carbon.deleteError);
          }
        },
      },
    ]);
  };

  const handleCategorySelect = (cat: CategoryKey): void => {
    if (selectedCategory === cat) {
      setSelectedCategory(null);
      setSelectedType(null);
    } else {
      setSelectedCategory(cat);
      setSelectedType(null);
    }
    setShowDropdown(false);
  };

  const handleTypeSelect = (type: ActivityType): void => {
    setSelectedType(type);
    setShowDropdown(false);
  };

  // ── Loading state ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <View className="flex-1 center bg-porcelain dark:bg-carbonBlack" style={{ gap: spacing.md }}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text className="text-secondary text-sm" style={{ marginTop: spacing.sm }}>
          {t.carbon.loadingFarms}
        </Text>
      </View>
    );
  }

  // ── No farm state ──────────────────────────────────────────────────────────
  if (!farmId) {
    return (
      <View className="flex-1 center bg-porcelain dark:bg-carbonBlack" style={{ gap: spacing.md }}>
        <MaterialCommunityIcons name="barn" size={48} color={theme.textSecondary} />
        <Text className="text-primary text-base font-semibold">{t.carbon.noFarmFound}</Text>
      </View>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <>
      <ScrollView
        ref={scrollRef}
        className="screen-bg"
        contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refreshData}
            tintColor={theme.primary}
          />
        }
      >
        {/* ── 1. Donut chart (hero) + total + legend ──────────────────────── */}
        <FocusableSection
          id="summaryCard"
          screen="carbon"
          theme={theme}
          scrollViewRef={scrollRef}
        >
          <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>
            {t.carbon.summaryTitle}
          </Text>

          {/* Total value + Yeni button — same row */}
          <View
            className="flex-row items-center justify-between"
            style={{ marginBottom: vs(6) }}
          >
            <View className="flex-row items-baseline" style={{ gap: s(5) }}>
              <Text
                style={{
                  fontSize: ms(24, 0.3),
                  fontWeight: "800",
                  color: theme.textMain,
                }}
              >
                {total.toFixed(1)}
              </Text>
              <Text
                style={{
                  fontSize: ms(12, 0.3),
                  fontWeight: "500",
                  color: theme.textSecondary,
                }}
              >
                {t.carbon.kgCO2}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setShowAddModal(true)}
              hitSlop={8}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 999,
                backgroundColor: theme.primary + "15",
                borderWidth: 1,
                borderColor: theme.primary + "35",
              }}
            >
              <Ionicons name="add" size={14} color={theme.primary} />
              <Text style={{ color: theme.primary, fontSize: 12, fontWeight: "700" }}>
                {t.carbon.addLog}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Donut — dominates the page */}
          <View style={{ alignSelf: "center" }}>
            <Svg width={DONUT_SIZE} height={DONUT_SIZE}>
              <Circle
                cx={DONUT_CENTER}
                cy={DONUT_CENTER}
                r={DONUT_RADIUS}
                fill="none"
                stroke={theme.border}
                strokeWidth={DONUT_STROKE}
              />
              {donutSegments.map(
                (seg) =>
                  seg.arcLength > 0 && (
                    <Circle
                      key={seg.key}
                      cx={DONUT_CENTER}
                      cy={DONUT_CENTER}
                      r={DONUT_RADIUS}
                      fill="none"
                      stroke={catConfig[seg.key].color}
                      strokeWidth={DONUT_STROKE}
                      strokeDasharray={`${seg.arcLength} ${CIRCUMFERENCE - seg.arcLength}`}
                      strokeDashoffset={-seg.offset}
                      strokeLinecap="butt"
                      rotation={-90}
                      origin={`${DONUT_CENTER}, ${DONUT_CENTER}`}
                    />
                  ),
              )}
            </Svg>
          </View>

          {/* Legend — icon + name + %, all tappable */}
          <View style={{ marginTop: vs(14), gap: vs(6) }}>
            {(["ELEKTRIK", "YAKIT", "GUBRE"] as CategoryKey[]).map((key) => {
              const cfg = catConfig[key];
              const catTotal = getCategoryTotal(key);
              const pct = total > 0 ? ((catTotal / total) * 100).toFixed(0) : "0";
              return (
                <TouchableOpacity
                  key={key}
                  className="flex-row items-center justify-between"
                  style={{
                    paddingVertical: vs(6),
                    paddingHorizontal: s(4),
                    borderBottomWidth: key !== "GUBRE" ? 1 : 0,
                    borderBottomColor: theme.divider,
                  }}
                  activeOpacity={0.6}
                  onPress={() => setDetailCategory(key)}
                >
                  <View className="flex-row items-center" style={{ gap: 6 }}>
                    <MaterialCommunityIcons name={cfg.icon as any} size={16} color={cfg.color} />
                    <Text style={{ fontSize: 14, color: theme.textMain }}>
                      {categoryLabel(key, t.carbon)}
                    </Text>
                  </View>
                  <View className="flex-row items-center" style={{ gap: 8 }}>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: theme.textSecondary }}>
                      {catTotal.toFixed(1)} {t.carbon.kgCO2}
                    </Text>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: cfg.color }}>
                      {pct}%
                    </Text>
                    <Ionicons name="chevron-forward" size={14} color={theme.textMuted} />
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </FocusableSection>

        {/* ── 4. Recent Activities ──────────────────────────────────────────── */}
        {/* Baslik genel tespitler bolumuyle ayni yapida: chevron ile acilir/kapanir
            + sayi rozeti. Kartlar FocusableSection icinde kalir (LLM scroll hedefi). */}
        <View>
          <TouchableOpacity
            onPress={() => setRecentExpanded((v) => !v)}
            activeOpacity={0.8}
            hitSlop={8}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              marginBottom: recentExpanded ? vs(8) : 0,
              paddingHorizontal: 2,
            }}
          >
            <Ionicons
              name={recentExpanded ? "chevron-down" : "chevron-forward"}
              size={18}
              color={theme.textMuted}
            />
            <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>
              {t.carbon.recentLogs}{" "}
              {recentLogs.length > 0 ? `(${recentLogs.length})` : ""}
            </Text>
          </TouchableOpacity>

          <FocusableSection
            id="recentLogsList"
            screen="carbon"
            theme={theme}
            scrollViewRef={scrollRef}
          >
            {!recentExpanded ? null : recentLogs.length === 0 ? (
              <View className="flex-1 center" style={{ paddingVertical: vs(16) }}>
                <MaterialCommunityIcons name="leaf" size={48} color={theme.textSecondary} />
                <Text className="text-primary text-base font-semibold mt-3">
                  {t.carbon.noLogs}
                </Text>
                <Text className="text-secondary text-[13px] mt-1 text-center">
                  {t.carbon.noLogsSubtitle}
                </Text>
              </View>
            ) : (
              recentLogs.map((log) => {
              const catKey = log.activity_type.category as CategoryKey;
              const cfg = catConfig[catKey] ?? {
                color: theme.textSecondary,
                icon: "help-circle",
              };
              return (
                <View
                  key={log.carbon_log_id}
                  className="surface-bg rounded-xl"
                  style={[styles.diseaseCard, { borderColor: theme.primary + "20", shadowColor: theme.shadowColor }]}
                >
                  <View className="flex-row" style={{ gap: 10 }}>
                    {/* Category icon — like DiseaseResultCard thumbnail */}
                    <View
                      className="rounded-lg center"
                      style={{ width: 44, height: 44, backgroundColor: cfg.color + "15" }}
                    >
                      <MaterialCommunityIcons
                        name={cfg.icon as any}
                        size={18}
                        color={cfg.color}
                      />
                    </View>

                    <View
                      className="flex-1"
                      style={{ minHeight: 44, justifyContent: "space-between" }}
                    >
                      {/* Top: name + delete */}
                      <View className="flex-row items-start" style={{ gap: 8 }}>
                        <View className="flex-1">
                          <Text
                            className="text-primary font-semibold"
                            style={{ fontSize: 14 }}
                            numberOfLines={1}
                          >
                            {log.activity_type.name}
                          </Text>
                          <Text
                            className="text-secondary"
                            style={{ fontSize: 12, marginTop: 2 }}
                          >
                            {log.activity_amount} {log.activity_type.unit} ·{" "}
                            {log.emission_amount.toFixed(2)} {t.carbon.kgCO2}
                          </Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => handleDelete(log)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons
                            name="trash-outline"
                            size={15}
                            color={theme.textSecondary}
                            style={{ padding: 2 }}
                          />
                        </TouchableOpacity>
                      </View>

                      {/* Bottom: date */}
                      <Text
                        style={{
                          alignSelf: "flex-end",
                          color: theme.textSecondary,
                          fontSize: 11,
                        }}
                      >
                        {new Date(log.activity_date).toLocaleDateString()}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })
            )}
          </FocusableSection>
        </View>

        <View style={{ height: spacing.xxl }} />
      </ScrollView>

      {/* ── Category Detail Bottom Sheet ─────────────────────────────────── */}
      <Modal
        visible={detailCategory !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setDetailCategory(null)}
      >
        <BlurView
          intensity={40}
          tint={theme.isDark ? "dark" : "light"}
          style={StyleSheet.absoluteFill}
        />
        <TouchableWithoutFeedback onPress={() => setDetailCategory(null)}>
          <View style={StyleSheet.absoluteFill} />
        </TouchableWithoutFeedback>
        <View style={styles.sheetCenter}>
          <View
            style={[
              styles.sheet,
              { backgroundColor: theme.surface, borderColor: theme.primary + "30" },
            ]}
          >
            {detailCategory && (() => {
              const cfg = catConfig[detailCategory];
              const catTotal = getCategoryTotal(detailCategory);
              const pct = total > 0 ? ((catTotal / total) * 100).toFixed(1) : "0";
              const subTypes = getSubTypes(detailCategory);
              const isFuel = detailCategory === "YAKIT";

              return (
                <>
                  <View style={styles.sheetHeader}>
                    <View className="flex-row items-center" style={{ gap: 8 }}>
                      <MaterialCommunityIcons name={cfg.icon as any} size={22} color={cfg.color} />
                      <Text style={[styles.sheetTitle, { color: theme.textMain }]}>
                        {categoryLabel(detailCategory, t.carbon)}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => setDetailCategory(null)} hitSlop={10}>
                      <Ionicons name="close" size={22} color={theme.textSecondary} />
                    </TouchableOpacity>
                  </View>

                  {/* Summary row */}
                  <View className="flex-row items-baseline" style={{ gap: 6, marginBottom: vs(4) }}>
                    <Text style={{ fontSize: ms(20, 0.3), fontWeight: "700", color: theme.textMain }}>
                      {catTotal.toFixed(1)}
                    </Text>
                    <Text style={{ fontSize: 13, color: theme.textSecondary }}>
                      {t.carbon.kgCO2}
                    </Text>
                    <View
                      style={{
                        backgroundColor: cfg.color + "18",
                        borderRadius: 10,
                        paddingHorizontal: 7,
                        paddingVertical: 2,
                        marginLeft: 4,
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: "700", color: cfg.color }}>
                        {pct}%
                      </Text>
                    </View>
                  </View>

                  {/* Progress bar — share of total */}
                  <View
                    style={{
                      height: 5,
                      backgroundColor: cfg.color + "20",
                      borderRadius: 3,
                      overflow: "hidden",
                      marginBottom: vs(12),
                    }}
                  >
                    <View
                      style={{
                        width: `${Math.min(parseFloat(pct), 100)}%` as any,
                        height: 5,
                        backgroundColor: cfg.color,
                        borderRadius: 3,
                      }}
                    />
                  </View>

                  {/* Fuel sub-type breakdown (only for YAKIT) */}
                  {isFuel && subTypes.length > 0 && (
                    <View style={{ gap: 6 }}>
                      <Text style={[styles.sectionLabel, { color: theme.textMuted, marginBottom: vs(2) }]}>
                        {t.carbon.fuelBreakdown}
                      </Text>
                      {subTypes.map((sub) => (
                        <View
                          key={sub.name}
                          style={{
                            backgroundColor: theme.background,
                            borderRadius: 10,
                            padding: spacing.sm,
                            borderWidth: 1,
                            borderColor: theme.primary + "15",
                          }}
                        >
                          <View className="flex-row justify-between items-center">
                            <Text style={{ fontSize: 14, fontWeight: "600", color: theme.textMain }}>
                              {sub.name}
                            </Text>
                            <Text style={{ fontSize: 12, color: theme.textSecondary }}>
                              {sub.total.toFixed(2)} {t.carbon.kgCO2} · {sub.percentage.toFixed(0)}%
                            </Text>
                          </View>
                          <View
                            style={{
                              height: 4,
                              backgroundColor: cfg.color + "20",
                              borderRadius: 2,
                              overflow: "hidden",
                              marginTop: vs(5),
                            }}
                          >
                            <View
                              style={{
                                width: `${Math.min(sub.percentage, 100)}%` as any,
                                height: 4,
                                backgroundColor: cfg.color,
                                borderRadius: 2,
                              }}
                            />
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* ── Add New Log Bottom Sheet ──────────────────────────────────────── */}
      {/* Kayit ekleme — ortak BottomSheet (alttan kayan sheet + ModalHeader baslik/X + scroll).
          Eski elle yazilmis Modal/BlurView/KAV/header yerine paylasilan bilesen kullanilir. */}
      <BottomSheet
        visible={showAddModal}
        theme={theme}
        onClose={() => setShowAddModal(false)}
        title={t.carbon.addLog}
        blur
        avoidKeyboard
        scroll
        contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: vs(4) }}
      >
              {/* Category buttons */}
              <View className="flex-row" style={{ gap: spacing.sm, marginBottom: spacing.sm, marginTop: vs(6) }}>
                {CATEGORIES.map(({ key, icon }) => {
                  const isSelected = selectedCategory === key;
                  return (
                    <TouchableOpacity
                      key={key}
                      className="flex-1 row justify-center"
                      style={{
                        gap: 5,
                        paddingVertical: spacing.sm,
                        borderRadius: 20,
                        borderWidth: 1,
                        backgroundColor: isSelected ? theme.primary : theme.background,
                        borderColor: theme.primary + "30",
                      }}
                      onPress={() => handleCategorySelect(key)}
                    >
                      <MaterialCommunityIcons
                        name={icon as any}
                        size={15}
                        color={isSelected ? theme.textOnPrimary : theme.textSecondary}
                      />
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "600",
                          color: isSelected ? theme.textOnPrimary : theme.textMain,
                        }}
                      >
                        {categoryLabel(key, t.carbon)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Activity type dropdown — always visible when category selected */}
              <TouchableOpacity
                className="row rounded-[10px] border"
                style={{
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm,
                  borderColor: theme.primary + "30",
                  backgroundColor: theme.background,
                  marginBottom: spacing.sm,
                  opacity: selectedCategory ? 1 : 0.4,
                }}
                onPress={() => selectedCategory && setShowDropdown(!showDropdown)}
                disabled={!selectedCategory}
              >
                <Text
                  className="flex-1"
                  style={{
                    color: selectedType ? theme.textMain : theme.textSecondary,
                    fontSize: 14,
                  }}
                >
                  {selectedType
                    ? `${selectedType.name} (${selectedType.unit})`
                    : t.carbon.selectActivityType}
                </Text>
                <MaterialCommunityIcons
                  name={showDropdown ? "chevron-up" : "chevron-down"}
                  size={18}
                  color={theme.textSecondary}
                />
              </TouchableOpacity>

              {showDropdown && selectedCategory && (
                <View
                  className="rounded-[10px] border overflow-hidden"
                  style={{
                    borderColor: theme.primary + "20",
                    backgroundColor: theme.background,
                    marginBottom: spacing.sm,
                  }}
                >
                  {filteredTypes.length === 0 ? (
                    <Text
                      className="text-secondary text-center"
                      style={{ padding: spacing.md, fontSize: 13 }}
                    >
                      {t.carbon.noData}
                    </Text>
                  ) : (
                    filteredTypes.map((type) => (
                      <TouchableOpacity
                        key={type.activity_type_id}
                        className="flex-row justify-between items-center"
                        style={{
                          paddingHorizontal: spacing.md,
                          paddingVertical: spacing.sm,
                          backgroundColor:
                            selectedType?.activity_type_id === type.activity_type_id
                              ? theme.primary + "15"
                              : undefined,
                        }}
                        onPress={() => handleTypeSelect(type)}
                      >
                        <Text style={{ color: theme.textMain, fontSize: 14 }}>
                          {type.name}
                        </Text>
                        <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                          {type.unit}
                        </Text>
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              )}

              {/* Amount + Date */}
              <View className="flex-row" style={{ gap: spacing.sm, marginBottom: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
                    {t.carbon.amount}{selectedType ? ` (${selectedType.unit})` : ""}
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        borderColor: theme.primary + "30",
                        color: theme.textMain,
                        backgroundColor: theme.background,
                      },
                    ]}
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={theme.textSecondary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
                    {t.carbon.date}
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        borderColor: theme.primary + "30",
                        color: theme.textMain,
                        backgroundColor: theme.background,
                      },
                    ]}
                    value={date}
                    onChangeText={setDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={theme.textSecondary}
                  />
                </View>
              </View>

              {/* Notes */}
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>{t.carbon.notes}</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    borderColor: theme.primary + "30",
                    color: theme.textMain,
                    backgroundColor: theme.background,
                    marginBottom: spacing.md,
                  },
                ]}
                value={notes}
                onChangeText={setNotes}
                placeholder={t.carbon.notesPlaceholder}
                placeholderTextColor={theme.textSecondary}
              />

              {/* Submit */}
              <TouchableOpacity
                style={{
                  backgroundColor: theme.primary,
                  borderRadius: 10,
                  paddingVertical: vs(11),
                  alignItems: "center",
                  opacity: isSubmitting || !selectedType ? 0.5 : 1,
                  marginBottom: spacing.sm,
                }}
                onPress={handleSubmit}
                disabled={isSubmitting || !selectedType}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color={theme.textOnPrimary} />
                ) : (
                  <Text
                    style={{
                      fontSize: ms(14, 0.3),
                      fontWeight: "700",
                      color: theme.textOnPrimary,
                    }}
                  >
                    {t.carbon.logActivity}
                  </Text>
                )}
              </TouchableOpacity>
      </BottomSheet>
    </>
  );
});

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Matches DiseaseResultCard — theme-dependent colors applied inline
  diseaseCard: {
    padding: 5,
    marginBottom: 6,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 9,
    elevation: 9,
  },
  sectionLabel: {
    fontSize: ms(11, 0.3),
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: vs(4),
  },
  sheetCenter: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    padding: spacing.md,
    maxHeight: "80%",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: vs(4),
  },
  sheetTitle: {
    fontSize: ms(17, 0.3),
    fontWeight: "700",
  },
});
