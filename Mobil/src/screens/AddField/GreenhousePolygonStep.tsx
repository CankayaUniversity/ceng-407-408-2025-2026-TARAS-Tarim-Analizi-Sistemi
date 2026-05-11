// Adim 3a: Sera dis siniri cizimi — PolygonCanvas ile en az 3 nokta
// Cizilen poligon FieldPolygon.exterior olarak kullanilacak

import { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useLanguage } from "../../context/LanguageContext";
import { s, vs, ms } from "../../utils/responsive";
import { PolygonCanvas } from "./PolygonCanvas";
import type { StepProps } from "./types";

export const GreenhousePolygonStep = ({
  theme,
  state,
  onUpdate,
  onNext,
}: StepProps) => {
  const { t } = useLanguage();
  const [error, setError] = useState<string | null>(null);

  const handlePointsChange = (points: [number, number][]) => {
    onUpdate({ outerPolygon: points });
    if (error) setError(null);
  };

  const handleNext = () => {
    if (state.outerPolygon.length < 3) {
      setError(t.addField.minPoints);
      return;
    }
    setError(null);
    onNext();
  };

  return (
    <View style={{ flex: 1, padding: s(20) }}>
      <Text
        className="text-primary font-bold"
        style={{ fontSize: ms(20, 0.3), marginBottom: vs(4), color: theme.textMain }}
      >
        {t.addField.drawBoundary}
      </Text>
      <Text
        className="text-secondary"
        style={{ fontSize: ms(13, 0.3), marginBottom: vs(16), color: theme.textSecondary }}
      >
        {t.addField.drawBoundaryHint}
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

      {/* Polygon canvas */}
      <PolygonCanvas
        theme={theme}
        points={state.outerPolygon}
        onPointsChange={handlePointsChange}
      />

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
          marginTop: vs(16),
          opacity: state.outerPolygon.length < 3 ? 0.5 : 1,
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
    </View>
  );
};
