// Adim: Her zone icin mahsul secimi ve ekim tarihi
// CropDetail listesini backend'den ceker, zone bazli atama yapar

import { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Platform,
  Modal,
  FlatList,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useLanguage } from "../../context/LanguageContext";
import { dashboardAPI } from "../../utils/api";
import { s, vs, ms } from "../../utils/responsive";
import type { StepProps, ZoneDraft } from "./types";

interface CropItem {
  crop_id: number;
  name: string;
  default_kc: number | null;
  growth_days: number | null;
  optimal_sm_min: number | null;
  optimal_sm_max: number | null;
}

export const PlantingStep = ({ theme, state, onUpdate, onNext }: StepProps) => {
  const { t } = useLanguage();
  const [error, setError] = useState<string | null>(null);
  const [crops, setCrops] = useState<CropItem[]>([]);
  const [loadingCrops, setLoadingCrops] = useState(true);

  // DatePicker state
  const [datePickerZoneId, setDatePickerZoneId] = useState<string | null>(null);
  const [tempDate, setTempDate] = useState(new Date());

  // Crop picker state
  const [cropPickerZoneId, setCropPickerZoneId] = useState<string | null>(null);

  useEffect(() => {
    dashboardAPI.getCrops().then((res) => {
      if (res.success && res.data) setCrops(res.data);
    }).catch(() => {}).finally(() => setLoadingCrops(false));
  }, []);

  const updateZone = (zoneId: string, partial: Partial<ZoneDraft>) => {
    onUpdate({
      zones: state.zones.map((z) =>
        z.id === zoneId ? { ...z, ...partial } : z,
      ),
    });
  };

  const handleSelectCrop = (zoneId: string, crop: CropItem) => {
    updateZone(zoneId, { cropId: crop.crop_id });
    setCropPickerZoneId(null);
  };

  const handleDateChange = (_: any, selectedDate?: Date) => {
    if (Platform.OS === "android") {
      setDatePickerZoneId(null);
    }
    if (selectedDate && datePickerZoneId) {
      setTempDate(selectedDate);
      updateZone(datePickerZoneId, {
        plantingDate: selectedDate.toISOString().split("T")[0],
      });
    }
  };

  const handleNext = () => {
    // Her zone'da planting date zorunlu
    const missing = state.zones.find((z) => !z.plantingDate);
    if (missing) {
      setError(t.addField.plantingDateRequired || "Tüm bölgelerde ekim tarihi zorunludur");
      return;
    }
    setError(null);
    onNext();
  };

  const getCropName = (cropId?: number) => {
    if (!cropId) return null;
    return crops.find((c) => c.crop_id === cropId)?.name ?? null;
  };

  const zoneColors = ["#4CAF50", "#2196F3", "#FF9800", "#9C27B0", "#F44336", "#00BCD4", "#795548", "#607D8B"];

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: s(20), paddingBottom: vs(40) }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Text
        style={{ fontSize: ms(20, 0.3), marginBottom: vs(4), color: theme.textMain, fontWeight: "bold" }}
      >
        {t.addField.plantingTitle || "Ekim Bilgileri"}
      </Text>
      <Text
        style={{ fontSize: ms(13, 0.3), marginBottom: vs(16), color: theme.textSecondary }}
      >
        {t.addField.plantingHint || "Her bölge için mahsul ve ekim tarihini girin"}
      </Text>

      {error && (
        <View
          style={{
            flexDirection: "row", alignItems: "center", borderRadius: 10,
            backgroundColor: theme.danger + "15",
            paddingVertical: vs(10), paddingHorizontal: s(14), marginBottom: vs(16),
          }}
        >
          <MaterialCommunityIcons name="alert-circle" size={18} color={theme.danger} style={{ marginRight: s(8) }} />
          <Text style={{ flex: 1, fontSize: ms(13, 0.3), color: theme.danger }}>{error}</Text>
        </View>
      )}

      {/* Zone kartlari */}
      {state.zones.map((zone, i) => {
        const color = zoneColors[i % zoneColors.length];
        const cropName = getCropName(zone.cropId);

        return (
          <View
            key={zone.id}
            style={{
              marginBottom: vs(16), padding: s(16),
              backgroundColor: theme.surface, borderRadius: 12,
              borderLeftWidth: 4, borderLeftColor: color,
            }}
          >
            <Text style={{ fontSize: ms(15, 0.3), fontWeight: "700", color: theme.textMain, marginBottom: vs(12) }}>
              {zone.name}
            </Text>

            {/* Mahsul secimi */}
            <Text style={{ fontSize: ms(12, 0.3), fontWeight: "600", color: theme.textSecondary, marginBottom: vs(4) }}>
              {t.addField.cropLabel || "Mahsul"}
            </Text>
            <TouchableOpacity
              style={{
                flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                paddingVertical: vs(12), paddingHorizontal: s(14),
                borderWidth: 1, borderRadius: 10, borderColor: theme.border,
                backgroundColor: theme.background, marginBottom: vs(12),
              }}
              onPress={() => setCropPickerZoneId(zone.id)}
              activeOpacity={0.7}
            >
              <Text style={{
                fontSize: ms(14, 0.3),
                color: cropName ? theme.textMain : theme.textMuted,
              }}>
                {cropName ?? (t.addField.selectCrop || "Mahsul seçin (opsiyonel)")}
              </Text>
              <MaterialCommunityIcons name="chevron-down" size={20} color={theme.textSecondary} />
            </TouchableOpacity>

            {/* Ekim tarihi */}
            <Text style={{ fontSize: ms(12, 0.3), fontWeight: "600", color: theme.textSecondary, marginBottom: vs(4) }}>
              {t.addField.plantingDateLabel || "Ekim Tarihi"}
            </Text>
            <TouchableOpacity
              style={{
                flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                paddingVertical: vs(12), paddingHorizontal: s(14),
                borderWidth: 1, borderRadius: 10, borderColor: theme.border,
                backgroundColor: theme.background,
              }}
              onPress={() => {
                setDatePickerZoneId(zone.id);
                setTempDate(zone.plantingDate ? new Date(zone.plantingDate) : new Date());
              }}
              activeOpacity={0.7}
            >
              <Text style={{
                fontSize: ms(14, 0.3),
                color: zone.plantingDate ? theme.textMain : theme.textMuted,
              }}>
                {zone.plantingDate
                  ? new Date(zone.plantingDate).toLocaleDateString("tr-TR")
                  : (t.addField.selectDate || "Tarih seçin")}
              </Text>
              <MaterialCommunityIcons name="calendar" size={20} color={theme.textSecondary} />
            </TouchableOpacity>

            {/* Android: inline DatePicker */}
            {Platform.OS === "android" && datePickerZoneId === zone.id && (
              <DateTimePicker
                value={tempDate}
                mode="date"
                display="default"
                onChange={handleDateChange}
              />
            )}
          </View>
        );
      })}

      {/* iOS: DatePicker modal */}
      {Platform.OS === "ios" && datePickerZoneId && (
        <View style={{ backgroundColor: theme.surface, borderRadius: 12, padding: s(16), marginBottom: vs(16) }}>
          <DateTimePicker
            value={tempDate}
            mode="date"
            display="spinner"
            onChange={handleDateChange}
          />
          <TouchableOpacity
            style={{
              alignSelf: "center", paddingVertical: vs(8), paddingHorizontal: s(24),
              backgroundColor: theme.primary, borderRadius: 8, marginTop: vs(8),
            }}
            onPress={() => setDatePickerZoneId(null)}
          >
            <Text style={{ fontSize: ms(14, 0.3), color: theme.textOnPrimary, fontWeight: "600" }}>
              {t.addField.next || "Tamam"}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Ileri butonu */}
      <TouchableOpacity
        style={{
          flexDirection: "row", alignItems: "center", justifyContent: "center",
          borderRadius: 12, backgroundColor: theme.primary,
          paddingVertical: vs(14), paddingHorizontal: s(24), marginTop: vs(4),
        }}
        onPress={handleNext}
        activeOpacity={0.7}
      >
        <Text style={{ fontSize: ms(16, 0.3), color: theme.textOnPrimary, fontWeight: "bold" }}>
          {t.addField.next}
        </Text>
        <MaterialCommunityIcons name="chevron-right" size={20} color={theme.textOnPrimary} style={{ marginLeft: s(4) }} />
      </TouchableOpacity>

      {/* Crop picker modal */}
      <Modal
        visible={cropPickerZoneId !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setCropPickerZoneId(null)}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: s(32) }}
          activeOpacity={1}
          onPress={() => setCropPickerZoneId(null)}
        >
          <View style={{ backgroundColor: theme.surface, borderRadius: 16, maxHeight: "60%", overflow: "hidden" }}>
            <View style={{ padding: s(16), borderBottomWidth: 1, borderBottomColor: theme.divider }}>
              <Text style={{ fontSize: ms(16, 0.3), fontWeight: "700", color: theme.textMain }}>
                {t.addField.selectCrop || "Mahsul Seçin"}
              </Text>
            </View>

            {loadingCrops ? (
              <Text style={{ padding: s(20), textAlign: "center", color: theme.textSecondary }}>...</Text>
            ) : crops.length === 0 ? (
              <Text style={{ padding: s(20), textAlign: "center", color: theme.textSecondary }}>
                {t.addField.noCrops || "Henüz mahsul tanımlanmamış"}
              </Text>
            ) : (
              <FlatList
                data={crops}
                keyExtractor={(item) => String(item.crop_id)}
                renderItem={({ item }) => {
                  const selected = cropPickerZoneId
                    ? state.zones.find((z) => z.id === cropPickerZoneId)?.cropId === item.crop_id
                    : false;
                  return (
                    <TouchableOpacity
                      style={{
                        flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                        paddingVertical: vs(14), paddingHorizontal: s(16),
                        borderBottomWidth: 1, borderBottomColor: theme.divider,
                        backgroundColor: selected ? theme.primary + "10" : "transparent",
                      }}
                      onPress={() => cropPickerZoneId && handleSelectCrop(cropPickerZoneId, item)}
                    >
                      <View>
                        <Text style={{ fontSize: ms(15, 0.3), fontWeight: "600", color: theme.textMain, textTransform: "capitalize" }}>
                          {item.name}
                        </Text>
                        {item.growth_days && (
                          <Text style={{ fontSize: ms(11, 0.3), color: theme.textSecondary, marginTop: vs(2) }}>
                            {item.growth_days} {t.addField.growthDays || "gün"}
                          </Text>
                        )}
                      </View>
                      {selected && (
                        <MaterialCommunityIcons name="check" size={20} color={theme.primary} />
                      )}
                    </TouchableOpacity>
                  );
                }}
              />
            )}

            {/* Secim kaldir butonu */}
            <TouchableOpacity
              style={{
                paddingVertical: vs(14), paddingHorizontal: s(16),
                borderTopWidth: 1, borderTopColor: theme.divider,
              }}
              onPress={() => {
                if (cropPickerZoneId) updateZone(cropPickerZoneId, { cropId: undefined });
                setCropPickerZoneId(null);
              }}
            >
              <Text style={{ fontSize: ms(14, 0.3), color: theme.textSecondary, textAlign: "center" }}>
                {t.addField.clearAll || "Temizle"}
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
};
