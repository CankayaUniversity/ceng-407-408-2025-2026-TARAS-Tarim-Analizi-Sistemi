// Adim 2: Temel tarla bilgileri — ad ve mahsul tipi
// AddGatewayFlow WiFi input stilini takip eder

import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useLanguage } from "../../context/LanguageContext";
import { s, vs, ms } from "../../utils/responsive";
import type { StepProps } from "./types";

export const FieldInfoStep = ({ theme, state, onUpdate, onNext }: StepProps) => {
  const { t } = useLanguage();
  const [error, setError] = useState<string | null>(null);

  const handleNext = () => {
    if (!state.fieldName.trim()) {
      setError(t.addField.nameRequired);
      return;
    }
    setError(null);
    onNext();
  };

  return (
    <View style={{ flex: 1, padding: s(20) }}>
      <Text
        className="text-primary font-bold"
        style={{ fontSize: ms(20, 0.3), marginBottom: vs(20), color: theme.textMain }}
      >
        {t.addField.fieldName}
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
            marginBottom: vs(16),
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

      {/* Tarla adi */}
      <View style={{ marginBottom: vs(16) }}>
        <Text
          className="text-secondary font-semibold"
          style={{ fontSize: ms(13, 0.3), marginBottom: vs(6), color: theme.textSecondary }}
        >
          {t.addField.fieldNameLabel}
        </Text>
        <TextInput
          className="rounded-[10px] border"
          style={{
            paddingVertical: vs(12),
            paddingHorizontal: s(16),
            borderWidth: 1,
            borderRadius: 10,
            borderColor: theme.border,
            fontSize: ms(15, 0.3),
            color: theme.textMain,
            backgroundColor: theme.surface,
          }}
          placeholder={t.addField.fieldNamePlaceholder}
          placeholderTextColor={theme.textMuted}
          value={state.fieldName}
          onChangeText={(text) => {
            onUpdate({ fieldName: text });
            if (error) setError(null);
          }}
          autoCapitalize="sentences"
          autoCorrect={false}
        />
      </View>

      {/* Mahsul tipi — PlantingStep'e taşındı */}

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
          marginTop: vs(12),
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
