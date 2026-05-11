// Adim 3b: Saksi sayisi girisi — pozitif tamsayi, max 32 (shader limiti)

import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useLanguage } from "../../context/LanguageContext";
import { s, vs, ms } from "../../utils/responsive";
import type { StepProps } from "./types";

const MAX_POTS = 32;
const POT_SIZE = s(64);
const POT_GAP = s(10);

const PotIcon = ({ index, theme }: { index: number; theme: StepProps["theme"] }) => (
  <View
    style={{
      width: POT_SIZE,
      height: POT_SIZE + vs(14),
      alignItems: "center",
      justifyContent: "flex-end",
      margin: POT_GAP / 2,
    }}
  >
    {/* Toprak / bitki */}
    <View
      style={{
        width: POT_SIZE * 0.55,
        height: vs(10),
        borderRadius: 4,
        backgroundColor: theme.primary + "55",
        marginBottom: -vs(2),
        zIndex: 1,
      }}
    />
    {/* Saksı gövdesi */}
    <View
      style={{
        width: POT_SIZE,
        height: POT_SIZE * 0.72,
        backgroundColor: theme.primary,
        borderRadius: 6,
        borderBottomLeftRadius: 10,
        borderBottomRightRadius: 10,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: theme.shadowColor,
        shadowOpacity: 0.18,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
        elevation: 3,
      }}
    >
      <MaterialCommunityIcons name="flower-tulip-outline" size={s(22)} color={theme.textOnPrimary} />
      <Text
        style={{
          fontSize: ms(10, 0.3),
          color: theme.textOnPrimary,
          fontWeight: "bold",
          marginTop: vs(2),
        }}
      >
        {index + 1}
      </Text>
    </View>
    {/* Saksı tabanı */}
    <View
      style={{
        width: POT_SIZE * 0.75,
        height: vs(6),
        backgroundColor: theme.primary + "cc",
        borderBottomLeftRadius: 6,
        borderBottomRightRadius: 6,
      }}
    />
  </View>
);

export const PotCountStep = ({ theme, state, onUpdate, onNext }: StepProps) => {
  const { t } = useLanguage();
  const [error, setError] = useState<string | null>(null);
  const [inputText, setInputText] = useState(
    state.potCount > 0 ? String(state.potCount) : "",
  );

  const potCount = parseInt(inputText, 10);
  const validCount = !isNaN(potCount) && potCount >= 1 && potCount <= MAX_POTS ? potCount : 0;

  const handleNext = () => {
    if (!inputText.trim() || isNaN(potCount) || potCount < 1) {
      setError(t.addField.potCountPositive);
      return;
    }
    if (potCount > MAX_POTS) {
      setError(t.addField.potCountMax);
      return;
    }
    setError(null);
    onUpdate({ potCount });
    onNext();
  };

  const handleChange = (text: string) => {
    const cleaned = text.replace(/[^0-9]/g, "");
    setInputText(cleaned);
    if (error) setError(null);
  };

  return (
    <View style={{ flex: 1, padding: s(20) }}>
      <Text
        style={{ fontSize: ms(20, 0.3), marginBottom: vs(8), color: theme.textMain, fontWeight: "bold" }}
      >
        {t.addField.potCount}
      </Text>
      <Text
        style={{ fontSize: ms(13, 0.3), marginBottom: vs(20), color: theme.textSecondary }}
      >
        {t.addField.potCountHint}
      </Text>

      {/* Hata mesaji */}
      {error && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
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
          <Text style={{ flex: 1, fontSize: ms(13, 0.3), color: theme.danger }}>
            {error}
          </Text>
        </View>
      )}

      {/* Sayi girisi */}
      <View style={{ marginBottom: vs(16) }}>
        <Text
          style={{ fontSize: ms(13, 0.3), marginBottom: vs(6), color: theme.textSecondary, fontWeight: "600" }}
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
          }}
          placeholder={t.addField.potCountPlaceholder}
          placeholderTextColor={theme.textMuted}
          value={inputText}
          onChangeText={handleChange}
          keyboardType="number-pad"
          maxLength={2}
        />
      </View>

      {/* Saksi grid önizlemesi */}
      {validCount > 0 && (
        <ScrollView
          style={{ flex: 1, marginBottom: vs(16) }}
          contentContainerStyle={{
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: "flex-start",
            paddingBottom: vs(8),
          }}
          showsVerticalScrollIndicator={false}
        >
          {Array.from({ length: validCount }).map((_, i) => (
            <PotIcon key={i} index={i} theme={theme} />
          ))}
        </ScrollView>
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
          marginTop: validCount > 0 ? 0 : vs(12),
        }}
        onPress={handleNext}
        activeOpacity={0.7}
      >
        <Text
          style={{ fontSize: ms(16, 0.3), color: theme.textOnPrimary, fontWeight: "bold" }}
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
