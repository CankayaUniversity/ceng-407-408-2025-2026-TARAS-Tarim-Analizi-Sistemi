// Birlesik adim: tarla tipi + isim + (saksi ise) saksi sayisi
// Tek sayfada tum temel bilgileri toplar. StepScaffold + FormInput ile kanonik gorunum;
// saksi sayisi blogu yumusak (FadeInDown) girer — eskiden anlik "pat" diye beliriyordu.

import { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import Animated, { FadeInDown, FadeOut, LinearTransition } from "react-native-reanimated";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useLanguage } from "../../context/LanguageContext";
import { s, vs, ms } from "../../utils/responsive";
import { ActionButton } from "../../components/ActionButton";
import { StepScaffold } from "./components/StepScaffold";
import { FormInput } from "./components/FormInput";
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
    <StepScaffold
      theme={theme}
      error={error}
      footer={
        <ActionButton
          theme={theme}
          label={t.addField.next}
          trailingIcon="chevron-right"
          onPress={handleNext}
        />
      }
    >
      {/* Tarla tipi secimi — segment kontrol (CTA degil), oldugu gibi korunur */}
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

      {/* Tarla adi + (saksi ise) saksi sayisi. layout=LinearTransition: pot blogu girip
          cikinca alttaki alanlar yumusak kayar (anlik atlama yok). */}
      <Animated.View layout={LinearTransition.duration(180)} style={{ gap: vs(16) }}>
        <FormInput
          theme={theme}
          label={t.addField.fieldNameLabel}
          placeholder={t.addField.fieldNamePlaceholder}
          value={state.fieldName}
          onChangeText={(text) => {
            onUpdate({ fieldName: text });
            if (error) setError(null);
          }}
          autoCapitalize="sentences"
          autoCorrect={false}
        />
        {selectedType === "pot" ? (
          <Animated.View
            entering={FadeInDown.duration(180)}
            exiting={FadeOut.duration(120)}
          >
            <FormInput
              theme={theme}
              label={t.addField.potCountLabel}
              placeholder={t.addField.potCountPlaceholder}
              value={potText}
              onChangeText={(text) => {
                setPotText(text.replace(/[^0-9]/g, ""));
                if (error) setError(null);
              }}
              keyboardType="number-pad"
              maxLength={2}
            />
          </Animated.View>
        ) : null}
      </Animated.View>
    </StepScaffold>
  );
};
