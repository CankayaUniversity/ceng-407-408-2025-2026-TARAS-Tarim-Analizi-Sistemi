// Son adim: Ozet ve olusturma — tarla bilgilerini gosterir, onayla butonu
// Backend API cagirarak tarlayi veritabanina kaydeder

import { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useLanguage } from "../../context/LanguageContext";
import { usePopupMessage } from "../../context/PopupMessageContext";
import { useDashboard } from "../../context/DashboardContext";
import { useAuth } from "../../context/AuthContext";
import { dashboardAPI } from "../../utils/api";
import { s, vs, ms } from "../../utils/responsive";
import {
  generateGreenhouseFieldData,
  generatePotFieldData,
  generateMockDashboardData,
  calculatePolygonArea,
} from "./addFieldUtils";
import type { StepProps } from "./types";

export const PreviewStep = ({ theme, state }: StepProps) => {
  const { t } = useLanguage();
  const { showPopup } = usePopupMessage();
  const { addLocalField, refreshFields } = useDashboard();
  const { dataSource } = useAuth();
  const [creating, setCreating] = useState(false);

  const isGreenhouse = state.fieldType === "greenhouse";
  const zoneCount = isGreenhouse ? state.zones.length : state.potCount;

  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);

    try {
      const fieldData = isGreenhouse
        ? generateGreenhouseFieldData(state.outerPolygon, state.zones)
        : generatePotFieldData(state.potCount);

      const area = isGreenhouse
        ? calculatePolygonArea(state.outerPolygon)
        : calculatePolygonArea(fieldData.polygon.exterior);

      const zonesPayload = state.zones.map((z) => ({
        name: z.name,
        polygon: { exterior: z.polygonPoints },
      }));

      // Demo modda lokal kaydet, gercek modda backend'e gonder
      if (dataSource === "demo") {
        const dashboardData = generateMockDashboardData(fieldData);
        addLocalField(
          { id: `demo-${Date.now()}`, name: state.fieldName, area: Math.round(area) },
          dashboardData,
        );
      } else {
        const res = await dashboardAPI.createField({
          fieldName: state.fieldName,
          cropName: state.cropName || undefined,
          fieldType: state.fieldType as "greenhouse" | "pot",
          polygon: { exterior: isGreenhouse ? state.outerPolygon : fieldData.polygon.exterior },
          area: Math.round(area),
          zones: zonesPayload,
        });

        if (res.success && res.data) {
          await refreshFields(res.data.id);
        }
      }

      showPopup(t.addField.fieldCreated);
    } catch (err) {
      console.log("[AddField] create error:", err);
      showPopup(t.addField.fieldCreateError);
    } finally {
      setCreating(false);
    }
  };

  return (
    <View style={{ flex: 1, padding: s(20) }}>
      <Text
        className="text-primary font-bold"
        style={{ fontSize: ms(20, 0.3), marginBottom: vs(20), color: theme.textMain }}
      >
        {t.addField.preview}
      </Text>

      {/* Ozet kartlari */}
      <View
        style={{
          padding: s(16),
          gap: vs(12),
          marginBottom: vs(24),
          backgroundColor: theme.surface,
          borderRadius: 12,
        }}
      >
        <SummaryRow
          theme={theme}
          label={t.addField.fieldNameLabel}
          value={state.fieldName}
        />
        <SummaryRow
          theme={theme}
          label={t.addField.fieldTypeLabel}
          value={isGreenhouse ? t.addField.greenhouse : t.addField.potArea}
        />
        {state.cropName.trim() !== "" && (
          <SummaryRow
            theme={theme}
            label={t.addField.cropLabel}
            value={state.cropName}
          />
        )}
        <SummaryRow
          theme={theme}
          label={isGreenhouse ? t.addField.zoneCountLabel : t.addField.potCountLabel}
          value={String(zoneCount)}
        />

        {/* Sera bolge isimleri */}
        {isGreenhouse && state.zones.length > 0 && (
          <View style={{ marginTop: vs(4) }}>
            {state.zones.map((zone) => (
              <Text
                key={zone.id}
                style={{ fontSize: ms(13, 0.3), marginLeft: s(4), color: theme.textSecondary }}
              >
                {"• "}
                {zone.name} ({zone.polygonPoints.length} {t.addField.minPoints.split(" ")[2]})
              </Text>
            ))}
          </View>
        )}

        {/* Saksı alani: görsel grid */}
        {!isGreenhouse && state.zones.length > 0 && (          <View style={{ marginTop: vs(4) }}>
            <Text
              style={{ fontSize: ms(12, 0.3), color: theme.textSecondary, marginBottom: vs(8) }}
            >
              {state.zones.length} saksı bağımsız zone olarak oluşturulacak
            </Text>
            <ScrollView
              horizontal={false}
              showsVerticalScrollIndicator={false}
              style={{ maxHeight: vs(200) }}
              contentContainerStyle={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: s(8),
              }}
            >
              {state.zones.map((zone, i) => (
                <View
                  key={zone.id}
                  style={{
                    width: s(56),
                    alignItems: "center",
                  }}
                >
                  {/* Saksı gövdesi */}
                  <View
                    style={{
                      width: s(44),
                      height: s(40),
                      backgroundColor: theme.primary,
                      borderRadius: 6,
                      borderBottomLeftRadius: 10,
                      borderBottomRightRadius: 10,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <MaterialCommunityIcons
                      name="flower-tulip-outline"
                      size={s(18)}
                      color={theme.textOnPrimary}
                    />
                  </View>
                  {/* Taban */}
                  <View
                    style={{
                      width: s(34),
                      height: vs(5),
                      backgroundColor: theme.primary + "bb",
                      borderBottomLeftRadius: 4,
                      borderBottomRightRadius: 4,
                    }}
                  />
                  <Text
                    style={{
                      fontSize: ms(10, 0.3),
                      color: theme.textSecondary,
                      marginTop: vs(3),
                    }}
                  >
                    {i + 1}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>
        )}
      </View>

      {/* Olustur butonu */}
      <TouchableOpacity
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 12,
          backgroundColor: creating ? theme.primary + "88" : theme.primary,
          paddingVertical: vs(14),
          paddingHorizontal: s(24),
        }}
        onPress={handleCreate}
        activeOpacity={0.7}
        disabled={creating}
      >
        {creating ? (
          <ActivityIndicator size="small" color={theme.textOnPrimary} style={{ marginRight: s(8) }} />
        ) : (
          <MaterialCommunityIcons
            name="check-circle"
            size={20}
            color={theme.textOnPrimary}
            style={{ marginRight: s(8) }}
          />
        )}
        <Text
          style={{ fontSize: ms(16, 0.3), color: theme.textOnPrimary, fontWeight: 'bold' }}
        >
          {creating ? t.addField.creating : t.addField.createField}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

// Ozet satirlari
const SummaryRow = ({
  label,
  value,
  theme,
}: {
  label: string;
  value: string;
  theme: any;
}) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
    <Text
      className="text-secondary font-semibold"
      style={{ fontSize: ms(13, 0.3), color: theme.textSecondary }}
    >
      {label}
    </Text>
    <Text
      className="text-primary font-medium"
      style={{ fontSize: ms(14, 0.3), maxWidth: "60%", textAlign: "right", color: theme.textMain }}
    >
      {value}
    </Text>
  </View>
);
