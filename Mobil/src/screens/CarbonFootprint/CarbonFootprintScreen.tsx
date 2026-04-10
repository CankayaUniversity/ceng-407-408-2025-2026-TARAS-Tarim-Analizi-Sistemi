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
  StyleSheet,
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
      <View style={[s.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.accent} />
        <Text style={[s.loadingText, { color: theme.textSecondary }]}>
          {t.carbon.loadingFarms}
        </Text>
      </View>
    );
  }

  // --- NO FARM STATE ---
  if (!farmId) {
    return (
      <View style={[s.center, { backgroundColor: theme.background }]}>
        <MaterialCommunityIcons name="barn" size={48} color={theme.textSecondary} />
        <Text style={[s.emptyTitle, { color: theme.text }]}>{t.carbon.noFarmFound}</Text>
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
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={s.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refreshData} tintColor={theme.accent} />
      }
    >
      {/* --- OZET KARTI --- */}
      <View style={[s.card, { backgroundColor: theme.surface }]}>
        <Text style={[s.cardTitle, { color: theme.textSecondary }]}>
          {t.carbon.summaryTitle}
        </Text>
        <Text style={[s.totalValue, { color: theme.text }]}>
          {summary?.total_emission?.toFixed(1) ?? "0"}{" "}
          <Text style={[s.totalUnit, { color: theme.textSecondary }]}>{t.carbon.kgCO2}</Text>
        </Text>

        <View style={s.categoryRow}>
          {CATEGORIES.map(({ key, icon }) => (
            <View key={key} style={[s.categoryCard, { backgroundColor: theme.background }]}>
              <MaterialCommunityIcons
                name={icon as any}
                size={20}
                color={theme.accent}
              />
              <Text style={[s.categoryValue, { color: theme.text }]}>
                {getCategoryTotal(key).toFixed(1)}
              </Text>
              <Text style={[s.categoryLabel, { color: theme.textSecondary }]}>
                {categoryLabel(key, t.carbon)}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* --- KAYIT FORMU --- */}
      <View style={[s.card, { backgroundColor: theme.surface }]}>
        <Text style={[s.cardTitle, { color: theme.textSecondary }]}>
          {t.carbon.addLog}
        </Text>

        {/* kategori butonlari */}
        <View style={s.pillRow}>
          {CATEGORIES.map(({ key, icon }) => {
            const isSelected = selectedCategory === key;
            return (
              <TouchableOpacity
                key={key}
                style={[
                  s.pill,
                  {
                    backgroundColor: isSelected ? theme.accent : theme.background,
                    borderColor: theme.accent + "30",
                  },
                ]}
                onPress={() => handleCategorySelect(key)}
              >
                <MaterialCommunityIcons
                  name={icon as any}
                  size={16}
                  color={isSelected ? theme.background : theme.textSecondary}
                />
                <Text
                  style={[
                    s.pillText,
                    { color: isSelected ? theme.background : theme.text },
                  ]}
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
              style={[s.dropdown, { borderColor: theme.accent + "30", backgroundColor: theme.background }]}
              onPress={() => setShowDropdown(!showDropdown)}
            >
              <Text style={{ color: selectedType ? theme.text : theme.textSecondary, flex: 1 }}>
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
              <View style={[s.dropdownList, { backgroundColor: theme.background, borderColor: theme.accent + "20" }]}>
                {filteredTypes.length === 0 ? (
                  <Text style={[s.dropdownEmpty, { color: theme.textSecondary }]}>
                    {t.carbon.noData}
                  </Text>
                ) : (
                  filteredTypes.map((type) => (
                    <TouchableOpacity
                      key={type.activity_type_id}
                      style={[
                        s.dropdownItem,
                        selectedType?.activity_type_id === type.activity_type_id && {
                          backgroundColor: theme.accent + "15",
                        },
                      ]}
                      onPress={() => handleTypeSelect(type)}
                    >
                      <Text style={{ color: theme.text }}>{type.name}</Text>
                      <Text style={{ color: theme.textSecondary, fontSize: 12 }}>{type.unit}</Text>
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
            <View style={s.formRow}>
              <View style={{ flex: 1, marginRight: spacing.sm }}>
                <Text style={[s.inputLabel, { color: theme.textSecondary }]}>
                  {t.carbon.amount} ({selectedType.unit})
                </Text>
                <TextInput
                  style={[s.input, { color: theme.text, borderColor: theme.accent + "30", backgroundColor: theme.background }]}
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={theme.textSecondary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.inputLabel, { color: theme.textSecondary }]}>
                  {t.carbon.date}
                </Text>
                <TextInput
                  style={[s.input, { color: theme.text, borderColor: theme.accent + "30", backgroundColor: theme.background }]}
                  value={date}
                  onChangeText={setDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={theme.textSecondary}
                />
              </View>
            </View>

            <Text style={[s.inputLabel, { color: theme.textSecondary }]}>{t.carbon.notes}</Text>
            <TextInput
              style={[s.input, { color: theme.text, borderColor: theme.accent + "30", backgroundColor: theme.background }]}
              value={notes}
              onChangeText={setNotes}
              placeholder={t.carbon.notesPlaceholder}
              placeholderTextColor={theme.textSecondary}
            />

            <TouchableOpacity
              style={[s.submitBtn, { backgroundColor: theme.accent, opacity: isSubmitting ? 0.6 : 1 }]}
              onPress={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color={theme.background} />
              ) : (
                <Text style={[s.submitText, { color: theme.background }]}>
                  {t.carbon.logActivity}
                </Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* --- SON KAYITLAR --- */}
      <View style={[s.card, { backgroundColor: theme.surface }]}>
        <Text style={[s.cardTitle, { color: theme.textSecondary }]}>
          {t.carbon.recentLogs}
        </Text>

        {logs.length === 0 ? (
          <View style={s.emptyLogs}>
            <MaterialCommunityIcons name="leaf" size={40} color={theme.textSecondary} />
            <Text style={[s.emptyTitle, { color: theme.text }]}>{t.carbon.noLogs}</Text>
            <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
              {t.carbon.noLogsSubtitle}
            </Text>
          </View>
        ) : (
          logs.map((log) => (
            <View
              key={log.carbon_log_id}
              style={[s.logRow, { borderBottomColor: theme.accent + "10" }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[s.logName, { color: theme.text }]}>
                  {log.activity_type.name}
                </Text>
                <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                  {log.activity_amount} {log.activity_type.unit} · {log.emission_amount.toFixed(2)} {t.carbon.kgCO2}
                </Text>
                <Text style={{ color: theme.textSecondary, fontSize: 11 }}>
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

const s = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.md,
  },
  content: {
    padding: spacing.md,
    gap: spacing.md,
  },
  loadingText: {
    fontSize: 14,
    marginTop: spacing.sm,
  },
  card: {
    borderRadius: 12,
    padding: spacing.md,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  totalValue: {
    fontSize: 32,
    fontWeight: "700",
  },
  totalUnit: {
    fontSize: 16,
    fontWeight: "400",
  },
  categoryRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  categoryCard: {
    flex: 1,
    borderRadius: 8,
    padding: spacing.sm,
    alignItems: "center",
    gap: 4,
  },
  categoryValue: {
    fontSize: 16,
    fontWeight: "600",
  },
  categoryLabel: {
    fontSize: 11,
  },
  pillRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  pill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 13,
    fontWeight: "600",
  },
  dropdown: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  dropdownList: {
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: spacing.sm,
    overflow: "hidden",
  },
  dropdownItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  dropdownEmpty: {
    padding: spacing.md,
    textAlign: "center",
    fontSize: 13,
  },
  formRow: {
    flexDirection: "row",
    marginBottom: spacing.sm,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "500",
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    marginBottom: spacing.sm,
  },
  submitBtn: {
    borderRadius: 10,
    paddingVertical: spacing.sm + 4,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xs,
  },
  submitText: {
    fontSize: 15,
    fontWeight: "600",
  },
  emptyLogs: {
    alignItems: "center",
    paddingVertical: spacing.xl,
    gap: spacing.xs,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  logRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
  },
  logName: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 2,
  },
});
