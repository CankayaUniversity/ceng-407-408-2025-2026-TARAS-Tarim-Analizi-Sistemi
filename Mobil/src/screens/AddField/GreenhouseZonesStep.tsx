// Adim 4a: Sera bolge cizimi — dis sinir icinde birden fazla bolge poligonu
// Her bolge en az 3 nokta + isim gerektirir

import { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useLanguage } from "../../context/LanguageContext";
import { s, vs, ms } from "../../utils/responsive";
import { PolygonCanvas } from "./PolygonCanvas";
import { generateId } from "./addFieldUtils";
import type { StepProps, ZoneDraft } from "./types";

export const GreenhouseZonesStep = ({
  theme,
  state,
  onUpdate,
  onNext,
}: StepProps) => {
  const { t } = useLanguage();
  const [error, setError] = useState<string | null>(null);

  // Aktif olarak cizilen bolge noktalar
  const [currentPoints, setCurrentPoints] = useState<[number, number][]>([]);
  const [currentZoneName, setCurrentZoneName] = useState(
    `${t.addField.zoneNamePlaceholder.replace("örn. ", "").replace("e.g. ", "")} ${state.zones.length + 1}`,
  );

  const handleAddZone = useCallback(() => {
    if (currentPoints.length < 3) {
      setError(t.addField.minPoints);
      return;
    }
    if (!currentZoneName.trim()) {
      setError(t.addField.zoneNameRequired);
      return;
    }
    setError(null);

    const newZone: ZoneDraft = {
      id: generateId(),
      name: currentZoneName.trim(),
      zoneType: "POLYGON",
      polygonPoints: [...currentPoints],
    };

    const updatedZones = [...state.zones, newZone];
    onUpdate({ zones: updatedZones });
    setCurrentPoints([]);
    setCurrentZoneName(
      `${t.addField.zoneNamePlaceholder.replace("örn. ", "").replace("e.g. ", "")} ${updatedZones.length + 1}`,
    );
  }, [currentPoints, currentZoneName, state.zones, onUpdate, t]);

  const handleDeleteZone = useCallback(
    (zoneId: string) => {
      onUpdate({ zones: state.zones.filter((z) => z.id !== zoneId) });
    },
    [state.zones, onUpdate],
  );

  const handleNext = () => {
    if (state.zones.length === 0) {
      setError(t.addField.minOneZone);
      return;
    }
    setError(null);
    onNext();
  };

  return (
    <ScrollView
      className="flex-1"
      style={{ padding: s(20) }}
      keyboardShouldPersistTaps="handled"
    >
      <Text
        className="text-primary font-bold"
        style={{ fontSize: ms(20, 0.3), marginBottom: vs(4), color: theme.textMain }}
      >
        {t.addField.drawZones}
      </Text>
      <Text
        className="text-secondary"
        style={{ fontSize: ms(13, 0.3), marginBottom: vs(16), color: theme.textSecondary }}
      >
        {t.addField.drawZonesHint}
      </Text>

      {/* Hata mesaji */}
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
          <Text
            style={{ flex: 1, fontSize: ms(13, 0.3), color: theme.danger }}
          >
            {error}
          </Text>
        </View>
      )}

      {/* Polygon canvas — dis sinir kilitli, mevcut bolgeler gosterilir */}
      <PolygonCanvas
        theme={theme}
        points={currentPoints}
        onPointsChange={setCurrentPoints}
        lockedBoundary={state.outerPolygon}
        completedZones={state.zones}
      />

      {/* Bolge adi girisi + ekle butonu */}
      <View style={{ marginTop: vs(12) }}>
        <Text
          className="text-secondary font-semibold"
          style={{ fontSize: ms(13, 0.3), marginBottom: vs(6), color: theme.textSecondary }}
        >
          {t.addField.zoneName}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
          <TextInput
            style={{
              flex: 1,
              borderRadius: 10,
              borderWidth: 1,
              paddingVertical: vs(10),
              paddingHorizontal: s(12),
              borderColor: theme.border,
              fontSize: ms(14, 0.3),
              color: theme.textMain,
              backgroundColor: theme.surface,
            }}
            placeholder={t.addField.zoneNamePlaceholder}
            placeholderTextColor={theme.textMuted}
            value={currentZoneName}
            onChangeText={setCurrentZoneName}
          />
          <TouchableOpacity
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              borderRadius: 10,
              backgroundColor: theme.primary,
              paddingVertical: vs(10),
              paddingHorizontal: s(14),
              opacity: currentPoints.length < 3 ? 0.5 : 1,
            }}
            onPress={handleAddZone}
            disabled={currentPoints.length < 3}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons
              name="plus"
              size={18}
              color={theme.textOnPrimary}
              style={{ marginRight: s(4) }}
            />
            <Text
              className="font-semibold"
              style={{ fontSize: ms(13, 0.3), color: theme.textOnPrimary }}
            >
              {t.addField.addZone}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Mevcut bolgeler listesi */}
      {state.zones.length > 0 && (
        <View style={{ marginTop: vs(16) }}>
          {state.zones.map((zone) => (
            <View
              key={zone.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: vs(10),
                paddingHorizontal: s(12),
                marginBottom: vs(8),
                backgroundColor: theme.surface,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: theme.border,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text
                  className="text-primary font-semibold"
                  style={{ fontSize: ms(14, 0.3), color: theme.textMain }}
                >
                  {zone.name}
                </Text>
                <Text
                  className="text-secondary"
                  style={{ fontSize: ms(12, 0.3), color: theme.textSecondary }}
                >
                  {zone.polygonPoints.length} pts
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => handleDeleteZone(zone.id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialCommunityIcons
                  name="close-circle-outline"
                  size={22}
                  color={theme.danger}
                />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Ileri butonu */}
      <TouchableOpacity
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 12,
          backgroundColor: theme.primary,
          paddingVertical: vs(14),
          paddingHorizontal: s(24),
          marginTop: vs(20),
          marginBottom: vs(40),
          opacity: state.zones.length === 0 ? 0.5 : 1,
        }}
        onPress={handleNext}
        activeOpacity={0.7}
      >
        <Text
          style={{ fontSize: ms(16, 0.3), color: theme.textOnPrimary, fontWeight: 'bold' }}
        >
          {t.addField.next}
        </Text>
        <MaterialCommunityIcons
          name="chevron-right"
          size={20}
          color={theme.textOnPrimary}
          style={{ marginLeft: s(4) }}
        />
      </TouchableOpacity>
    </ScrollView>
  );
};
