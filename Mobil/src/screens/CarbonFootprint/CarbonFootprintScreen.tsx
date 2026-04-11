// Karbon ayak izi ekrani
// Props: theme, isActive
// Ozet karti, kategori secimi, aktivite logu, son kayitlar

import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLanguage } from "../../context/LanguageContext";
import { usePopupMessage } from "../../context/PopupMessageContext";
import { carbonAPI, gatewayAPI } from "../../utils/api";
import { spacing } from "../../utils/responsive";
import type {
  CarbonFootprintScreenProps,
  ActivityType,
  CarbonLog,
  CarbonSummary,
  CategoryKey,
} from "./types";

const CATEGORIES: { key: CategoryKey; icon: string }[] = [
  { key: "YAKIT", icon: "gas-station" },
  { key: "GUBRE", icon: "sprout" },
  { key: "ELEKTRIK", icon: "lightning-bolt" },
];

// bugunun tarihini YYYY-MM-DD formatinda al
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// kategori key'ini cevirilmis isme donustur
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

export const CarbonFootprintScreen = ({
  theme,
  isActive: _isActive = false,
}: CarbonFootprintScreenProps) => {
  const { t } = useLanguage();
  const { showPopup } = usePopupMessage();
  const scrollRef = useRef<ScrollView>(null);

  // veri state'leri
  const [farmId, setFarmId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activityTypes, setActivityTypes] = useState<Record<string, ActivityType[]>>({});
  const [logs, setLogs] = useState<CarbonLog[]>([]);
  const [summary, setSummary] = useState<CarbonSummary | null>(null);

  // form state'leri
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey | null>(null);
  const [selectedType, setSelectedType] = useState<ActivityType | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayStr());
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ciftlik bilgisini ve verileri yukle
  const loadInitialData = async (): Promise<void> => {
    setIsLoading(true);
    try {
      // ciftlik id'sini al
      const farmsRes = await gatewayAPI.getFarms();
      if (!farmsRes.success || !farmsRes.data?.length) {
        console.log("[CARBON] no farms found");
        setIsLoading(false);
        return;
      }

      const fId = farmsRes.data[0].farm_id;
      setFarmId(fId);
      console.log("[CARBON] farm:", fId.slice(0, 8));

      // verileri paralel yukle
      const [typesRes, summaryRes, logsRes] = await Promise.all([
        carbonAPI.getActivityTypes(),
        carbonAPI.getSummary(fId),
        carbonAPI.getLogs(fId),
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

  // sadece log ve summary'yi yenile
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

  // ilk mount'ta verileri yukle
  useEffect(() => {
    if (!farmId) {
      loadInitialData();
    }
  }, []);

  // yeni log kaydet
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
        // formu temizle
        setAmount("");
        setNotes("");
        setSelectedType(null);
        // verileri yenile
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

  // log sil
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
              // summary'yi de yenile
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

  // kategori secilince dropdown'u sifirla
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

  // dropdown'dan activity type sec
  const handleTypeSelect = (type: ActivityType): void => {
    setSelectedType(type);
    setShowDropdown(false);
  };

  // secili kategorideki activity type'lar
  const filteredTypes: ActivityType[] = selectedCategory
    ? activityTypes[selectedCategory] ?? []
    : [];

  // --- LOADING STATE ---
  if (isLoading) {
    return (
      <View className="flex-1 center bg-platinum-50 dark:bg-onyx-950" style={{ gap: spacing.md }}>
        <ActivityIndicator size="large" color={theme.accent} />
        <Text className="text-secondary text-sm" style={{ marginTop: spacing.sm }}>
          {t.carbon.loadingFarms}
        </Text>
      </View>
    );
  }

  // --- NO FARM STATE ---
  if (!farmId) {
    return (
      <View className="flex-1 center bg-platinum-50 dark:bg-onyx-950" style={{ gap: spacing.md }}>
        <MaterialCommunityIcons name="barn" size={48} color={theme.textSecondary} />
        <Text className="text-primary text-base font-semibold">{t.carbon.noFarmFound}</Text>
      </View>
    );
  }

  // kategoriye gore ozet degeri bul
  const getCategoryTotal = (cat: string): number => {
    return summary?.by_category.find((c) => c.category === cat)?.total ?? 0;
  };

  return (
    <ScrollView
      ref={scrollRef}
      className="screen-bg"
      contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refreshData} tintColor={theme.accent} />
      }
    >
      {/* --- OZET KARTI --- */}
      <View className="surface-bg rounded-xl" style={{ padding: spacing.md }}>
        <Text className="text-secondary text-[13px] font-semibold uppercase tracking-wide" style={{ marginBottom: spacing.sm }}>
          {t.carbon.summaryTitle}
        </Text>
        <Text className="text-primary text-3xl font-bold">
          {summary?.total_emission?.toFixed(1) ?? "0"}{" "}
          <Text className="text-secondary text-base font-normal">{t.carbon.kgCO2}</Text>
        </Text>

        <View className="flex-row" style={{ gap: spacing.sm, marginTop: spacing.md }}>
          {CATEGORIES.map(({ key, icon }) => (
            <View
              key={key}
              className="flex-1 items-center bg-platinum-50 dark:bg-onyx-950 rounded-lg"
              style={{ padding: spacing.sm, gap: 4 }}
            >
              <MaterialCommunityIcons
                name={icon as any}
                size={20}
                color={theme.accent}
              />
              <Text className="text-primary text-base font-semibold">
                {getCategoryTotal(key).toFixed(1)}
              </Text>
              <Text className="text-secondary text-[11px]">
                {categoryLabel(key, t.carbon)}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* --- KAYIT FORMU --- */}
      <View className="surface-bg rounded-xl" style={{ padding: spacing.md }}>
        <Text className="text-secondary text-[13px] font-semibold uppercase tracking-wide" style={{ marginBottom: spacing.sm }}>
          {t.carbon.addLog}
        </Text>

        {/* kategori butonlari */}
        <View className="flex-row" style={{ gap: spacing.sm, marginBottom: spacing.md }}>
          {CATEGORIES.map(({ key, icon }) => {
            const isSelected = selectedCategory === key;
            return (
              <TouchableOpacity
                key={key}
                className="flex-1 row justify-center rounded-full border"
                style={{
                  gap: 6,
                  paddingVertical: spacing.sm,
                  backgroundColor: isSelected ? theme.accent : theme.background,
                  borderColor: theme.accent + "30",
                }}
                onPress={() => handleCategorySelect(key)}
              >
                <MaterialCommunityIcons
                  name={icon as any}
                  size={16}
                  color={isSelected ? theme.background : theme.textSecondary}
                />
                <Text
                  className="text-[13px] font-semibold"
                  style={{ color: isSelected ? theme.background : theme.text }}
                >
                  {categoryLabel(key, t.carbon)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* aktivite tipi dropdown */}
        {selectedCategory && (
          <>
            <TouchableOpacity
              className="row rounded-lg border bg-platinum-50 dark:bg-onyx-950"
              style={{
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm + 2,
                borderColor: theme.accent + "30",
                marginBottom: spacing.sm,
              }}
              onPress={() => setShowDropdown(!showDropdown)}
            >
              <Text className="flex-1" style={{ color: selectedType ? theme.text : theme.textSecondary }}>
                {selectedType
                  ? `${selectedType.name} (${selectedType.unit})`
                  : t.carbon.selectActivityType}
              </Text>
              <MaterialCommunityIcons
                name={showDropdown ? "chevron-up" : "chevron-down"}
                size={20}
                color={theme.textSecondary}
              />
            </TouchableOpacity>

            {showDropdown && (
              <View
                className="rounded-lg border overflow-hidden bg-platinum-50 dark:bg-onyx-950"
                style={{
                  borderColor: theme.accent + "20",
                  marginBottom: spacing.sm,
                }}
              >
                {filteredTypes.length === 0 ? (
                  <Text className="text-secondary text-[13px] text-center" style={{ padding: spacing.md }}>
                    {t.carbon.noData}
                  </Text>
                ) : (
                  filteredTypes.map((type) => (
                    <TouchableOpacity
                      key={type.activity_type_id}
                      className="flex-row justify-between items-center"
                      style={{
                        paddingHorizontal: spacing.md,
                        paddingVertical: spacing.sm + 2,
                        backgroundColor:
                          selectedType?.activity_type_id === type.activity_type_id
                            ? theme.accent + "15"
                            : undefined,
                      }}
                      onPress={() => handleTypeSelect(type)}
                    >
                      <Text className="text-primary">{type.name}</Text>
                      <Text className="text-secondary text-xs">{type.unit}</Text>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            )}
          </>
        )}

        {/* miktar ve tarih */}
        {selectedType && (
          <>
            <View className="flex-row" style={{ marginBottom: spacing.sm }}>
              <View style={{ flex: 1, marginRight: spacing.sm }}>
                <Text className="text-secondary text-xs font-medium mb-1">
                  {t.carbon.amount} ({selectedType.unit})
                </Text>
                <TextInput
                  className="border rounded-lg text-sm bg-platinum-50 dark:bg-onyx-950 text-primary"
                  style={{
                    borderColor: theme.accent + "30",
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                    marginBottom: spacing.sm,
                  }}
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={theme.textSecondary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text className="text-secondary text-xs font-medium mb-1">
                  {t.carbon.date}
                </Text>
                <TextInput
                  className="border rounded-lg text-sm bg-platinum-50 dark:bg-onyx-950 text-primary"
                  style={{
                    borderColor: theme.accent + "30",
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                    marginBottom: spacing.sm,
                  }}
                  value={date}
                  onChangeText={setDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={theme.textSecondary}
                />
              </View>
            </View>

            <Text className="text-secondary text-xs font-medium mb-1">{t.carbon.notes}</Text>
            <TextInput
              className="border rounded-lg text-sm bg-platinum-50 dark:bg-onyx-950 text-primary"
              style={{
                borderColor: theme.accent + "30",
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                marginBottom: spacing.sm,
              }}
              value={notes}
              onChangeText={setNotes}
              placeholder={t.carbon.notesPlaceholder}
              placeholderTextColor={theme.textSecondary}
            />

            <TouchableOpacity
              className="rounded-[10px] center"
              style={{
                backgroundColor: theme.accent,
                paddingVertical: spacing.sm + 4,
                marginTop: spacing.xs,
                opacity: isSubmitting ? 0.6 : 1,
              }}
              onPress={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color={theme.background} />
              ) : (
                <Text className="text-[15px] font-semibold" style={{ color: theme.background }}>
                  {t.carbon.logActivity}
                </Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* --- SON KAYITLAR --- */}
      <View className="surface-bg rounded-xl" style={{ padding: spacing.md }}>
        <Text className="text-secondary text-[13px] font-semibold uppercase tracking-wide" style={{ marginBottom: spacing.sm }}>
          {t.carbon.recentLogs}
        </Text>

        {logs.length === 0 ? (
          <View className="items-center" style={{ paddingVertical: spacing.xl, gap: spacing.xs }}>
            <MaterialCommunityIcons name="leaf" size={40} color={theme.textSecondary} />
            <Text className="text-primary text-base font-semibold">{t.carbon.noLogs}</Text>
            <Text className="text-secondary text-[13px]">
              {t.carbon.noLogsSubtitle}
            </Text>
          </View>
        ) : (
          logs.map((log) => (
            <View
              key={log.carbon_log_id}
              className="row"
              style={{
                paddingVertical: spacing.sm + 2,
                borderBottomWidth: 1,
                borderBottomColor: theme.accent + "10",
              }}
            >
              <View className="flex-1">
                <Text className="text-primary text-sm font-semibold mb-0.5">
                  {log.activity_type.name}
                </Text>
                <Text className="text-secondary text-xs">
                  {log.activity_amount} {log.activity_type.unit} · {log.emission_amount.toFixed(2)} {t.carbon.kgCO2}
                </Text>
                <Text className="text-secondary text-[11px]">
                  {new Date(log.activity_date).toLocaleDateString()}
                  {log.notes ? ` · ${log.notes}` : ""}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => handleDelete(log)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <MaterialCommunityIcons name="trash-can-outline" size={20} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      <View style={{ height: spacing.xxl }} />
    </ScrollView>
  );
};
