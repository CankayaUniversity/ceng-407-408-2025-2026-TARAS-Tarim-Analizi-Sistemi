// Adim 1: Tarla tipi secimi — Sera veya Saksi Alani
// HardwareSetupModal menu karti stilini takip eder

import { View, Text, TouchableOpacity } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useLanguage } from "../../context/LanguageContext";
import { s, vs, ms } from "../../utils/responsive";
import type { StepProps, FieldType } from "./types";

export const FieldTypeStep = ({ theme, onUpdate, onNext }: StepProps) => {
  const { t } = useLanguage();

  const handleSelect = (type: FieldType) => {
    onUpdate({ fieldType: type });
    onNext();
  };

  return (
    <View style={{ padding: s(20) }}>
      <Text
        className="text-primary font-bold"
        style={{ fontSize: ms(20, 0.3), marginBottom: vs(20), color: theme.textMain }}
      >
        {t.addField.selectFieldType}
      </Text>

      {/* Sera */}
      <TouchableOpacity
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          padding: s(16),
          marginBottom: s(16),
          backgroundColor: theme.surface,
          borderRadius: 12,
          elevation: 2,
          shadowColor: theme.shadowColor,
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.1,
          shadowRadius: 3,
        }}
        onPress={() => handleSelect("greenhouse")}
        activeOpacity={0.7}
      >
        <View
          style={{
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 12,
            width: s(56),
            height: s(56),
            backgroundColor: theme.primary + "20",
            marginRight: s(16),
          }}
        >
          <MaterialCommunityIcons
            name="home-variant-outline"
            size={32}
            color={theme.primary}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            className="text-primary font-bold"
            style={{ fontSize: ms(16, 0.3), marginBottom: vs(4), color: theme.textMain }}
          >
            {t.addField.greenhouse}
          </Text>
          <Text
            className="text-secondary"
            style={{ fontSize: ms(13, 0.3), lineHeight: ms(18, 0.3), color: theme.textSecondary }}
          >
            {t.addField.greenhouseDesc}
          </Text>
        </View>
        <MaterialCommunityIcons
          name="chevron-right"
          size={24}
          color={theme.textSecondary}
        />
      </TouchableOpacity>

      {/* Saksi Alani */}
      <TouchableOpacity
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          padding: s(16),
          backgroundColor: theme.surface,
          borderRadius: 12,
          elevation: 2,
          shadowColor: theme.shadowColor,
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.1,
          shadowRadius: 3,
        }}
        onPress={() => handleSelect("pot")}
        activeOpacity={0.7}
      >
        <View
          style={{
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 12,
            width: s(56),
            height: s(56),
            backgroundColor: theme.primary + "20",
            marginRight: s(16),
          }}
        >
          <MaterialCommunityIcons
            name="flower-outline"
            size={32}
            color={theme.primary}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            className="text-primary font-bold"
            style={{ fontSize: ms(16, 0.3), marginBottom: vs(4), color: theme.textMain }}
          >
            {t.addField.potArea}
          </Text>
          <Text
            className="text-secondary"
            style={{ fontSize: ms(13, 0.3), lineHeight: ms(18, 0.3), color: theme.textSecondary }}
          >
            {t.addField.potAreaDesc}
          </Text>
        </View>
        <MaterialCommunityIcons
          name="chevron-right"
          size={24}
          color={theme.textSecondary}
        />
      </TouchableOpacity>
    </View>
  );
};
