// Son adim: Ozet ve olusturma — tarla bilgilerini gosterir, onayla butonu
// Backend API cagirarak tarlayi veritabanina kaydeder.

import { useState } from "react";
import { View, Text } from "react-native";
import { useLanguage } from "../../context/LanguageContext";
import { usePopupMessage } from "../../context/PopupMessageContext";
import { useDashboard } from "../../context/DashboardContext";
import { useAuth } from "../../context/AuthContext";
import { dashboardAPI } from "../../utils/api";
import { s, vs, ms } from "../../utils/responsive";
import { ActionButton } from "../../components/ActionButton";
import { StepScaffold } from "./components/StepScaffold";
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
  const { addLocalField, refreshFields, selectedFarmId } = useDashboard();
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
        cropId: z.cropId,
        plantingDate: z.plantingDate,
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
          fieldType: state.fieldType as "greenhouse" | "pot",
          polygon: { exterior: isGreenhouse ? state.outerPolygon : fieldData.polygon.exterior },
          area: Math.round(area),
          zones: zonesPayload,
          farmId: selectedFarmId ?? undefined,
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

  const zoneColors = ["#4CAF50", "#2196F3", "#FF9800", "#9C27B0", "#F44336", "#00BCD4", "#795548", "#607D8B"];

  return (
    <StepScaffold
      theme={theme}
      title={t.addField.preview}
      footer={
        <ActionButton
          theme={theme}
          label={t.addField.createField}
          icon="check-circle"
          loading={creating}
          onPress={handleCreate}
        />
      }
    >
      {/* Ozet kartlari */}
      <View
        style={{
          padding: s(16), gap: vs(12), marginBottom: vs(16),
          backgroundColor: theme.surface, borderRadius: 12,
        }}
      >
        <SummaryRow theme={theme} label={t.addField.fieldNameLabel} value={state.fieldName} />
        <SummaryRow
          theme={theme}
          label={t.addField.fieldTypeLabel}
          value={isGreenhouse ? t.addField.greenhouse : t.addField.potArea}
        />
        <SummaryRow
          theme={theme}
          label={isGreenhouse ? t.addField.zoneCountLabel : t.addField.potCountLabel}
          value={String(zoneCount)}
        />
      </View>

      {/* Zone detaylari — ekim bilgileriyle */}
      {state.zones.length > 0 && (
        <View>
          {state.zones.map((zone, i) => {
            const color = zoneColors[i % zoneColors.length];
            return (
              <View
                key={zone.id}
                style={{
                  flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                  paddingVertical: vs(10), paddingHorizontal: s(12), marginBottom: vs(6),
                  backgroundColor: theme.surface, borderRadius: 8,
                  borderLeftWidth: 4, borderLeftColor: color,
                }}
              >
                <Text style={{ fontSize: ms(14, 0.3), fontWeight: "600", color: theme.textMain }}>
                  {zone.name}
                </Text>
                <View style={{ alignItems: "flex-end" }}>
                  {zone.plantingDate && (
                    <Text style={{ fontSize: ms(12, 0.3), color: theme.textSecondary }}>
                      {new Date(zone.plantingDate).toLocaleDateString("tr-TR")}
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </StepScaffold>
  );
};

const SummaryRow = ({
  label, value, theme,
}: {
  label: string; value: string; theme: any;
}) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
    <Text style={{ fontSize: ms(13, 0.3), color: theme.textSecondary, fontWeight: "600" }}>
      {label}
    </Text>
    <Text style={{ fontSize: ms(14, 0.3), maxWidth: "60%", textAlign: "right", color: theme.textMain }}>
      {value}
    </Text>
  </View>
);
