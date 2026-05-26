// Birlesik adim: tarla tipi + isim + (saksi ise) saksi sayisi
// Tek sayfada tum temel bilgileri toplar

import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useLanguage } from "../../context/LanguageContext";
import { s, vs, ms } from "../../utils/responsive";
import type { StepProps, FieldType } from "./types";

const MAX_POTS = 32;

export const FieldSetupStep = ({ theme, state, onUpdate, onNext }: StepProps) => {
  const { t } = useLanguage();
  const [error, setError] = useState<string | null>(null);
  const [potText, setPotText] = useState(
    state.potCount > 0 ? String(state.potCount) : "",
  );

  const selectedType = state.fieldType;

  const handleTypeSelect = (type: FieldType) => {
    onUpdate({ fieldType: type });
    if (error) setError(null);
  };

  const handleNext = () => {
    if (!selectedType) {
      setError(t.addField.selectFieldType);
      return;
    }
    if (!state.fieldName.trim()) {
      setError(t.addField.nameRequired);
      return;
    }
    if (selectedType === "pot") {
      const count = parseInt(potText, 10);
      if (!potText.trim() || isNaN(count) || count < 1) {
        setError(t.addField.potCountPositive);
        return;
      }
      if (count > MAX_POTS) {
        setError(t.addField.potCountMax);
        return;
      }
      onUpdate({ potCount: count });
    }
    setError(null);
    onNext();
  };

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: s(20), paddingBottom: vs(40) }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* Hata */}
      {error && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            borderRadius: 10,
            backgroundColor: theme.danger + "15",
            paddingVertical: vs(10),
            paddingHorizontal: s(14),
            marginBottom: vs(16),
          }}
        >
          <MaterialCommunityIcons
            name="alert-circle"
            size={18}
            color={theme.danger}
            style={{ marginRight: s(8) }}
          />
          <Text style={{ flex: 1, fontSize: ms(13, 0.3), color: theme.danger }}>
            {error}
          </Text>
        </View>
      )}

      {/* Tarla tipi secimi */}
      <Text
        style={{
          fontSize: ms(13, 0.3),
          fontWeight: "600",
          color: theme.textSecondary,
          marginBottom: vs(8),
        }}
      >
        {t.addField.selectFieldType}
      </Text>
      <View style={{ flexDirection: "row", gap: s(10), marginBottom: vs(20) }}>
        {(["greenhouse", "pot"] as FieldType[]).map((type) => {
          const active = selectedType === type;
          const icon = type === "greenhouse" ? "home-variant-outline" : "flower-outline";
          const label = type === "greenhouse" ? t.addField.greenhouse : t.addField.potArea;
          return (
            <TouchableOpacity
              key={type}
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: vs(12),
                borderRadius: 12,
                borderWidth: 1.5,
                borderColor: active ? theme.primary : theme.border,
                backgroundColor: active ? theme.primary + "12" : "transparent",
                gap: s(6),
              }}
              onPress={() => handleTypeSelect(type)}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons
                name={icon}
                size={20}
                color={active ? theme.primary : theme.textSecondary}
              />
              <Text
                style={{
                  fontSize: ms(14, 0.3),
                  fontWeight: active ? "700" : "500",
                  color: active ? theme.primary : theme.textMain,
                }}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Tarla adi */}
      <Text
        style={{
          fontSize: ms(13, 0.3),
          fontWeight: "600",
          color: theme.textSecondary,
          marginBottom: vs(6),
        }}
      >
        {t.addField.fieldNameLabel}
      </Text>
      <TextInput
        style={{
          paddingVertical: vs(12),
          paddingHorizontal: s(16),
          borderWidth: 1,
          borderRadius: 10,
          borderColor: theme.border,
          fontSize: ms(15, 0.3),
          color: theme.textMain,
          backgroundColor: theme.surface,
          marginBottom: vs(16),
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

      {/* Saksi sayisi — sadece pot seciliyse */}
      {selectedType === "pot" && (
        <>
          <Text
            style={{
              fontSize: ms(13, 0.3),
              fontWeight: "600",
              color: theme.textSecondary,
              marginBottom: vs(6),
            }}
          >
            {t.addField.potCountLabel}
          </Text>
          <TextInput
            style={{
              paddingVertical: vs(12),
              paddingHorizontal: s(16),
              borderWidth: 1,
              borderRadius: 10,
              borderColor: theme.border,
              fontSize: ms(15, 0.3),
              color: theme.textMain,
              backgroundColor: theme.surface,
              marginBottom: vs(16),
            }}
            placeholder={t.addField.potCountPlaceholder}
            placeholderTextColor={theme.textMuted}
            value={potText}
            onChangeText={(text) => {
              setPotText(text.replace(/[^0-9]/g, ""));
              if (error) setError(null);
            }}
            keyboardType="number-pad"
            maxLength={2}
          />
        </>
      )}

      {/* Ileri butonu */}
      <TouchableOpacity
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 12,
          backgroundColor: theme.primary,
          paddingVertical: vs(14),
          paddingHorizontal: s(24),
          marginTop: vs(4),
        }}
        onPress={handleNext}
        activeOpacity={0.7}
      >
        <Text
          style={{
            fontSize: ms(16, 0.3),
            color: theme.textOnPrimary,
            fontWeight: "bold",
          }}
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
