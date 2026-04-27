// Tarla secici dropdown - mevcut tarlalar arasinda secim yapar
// Props: theme, fields (tarla listesi), selectedFieldId, onSelectField

import { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FieldSelectorProps } from "./types";
import { spacing } from "../../utils/responsive";
import { useLanguage } from "../../context/LanguageContext";

export const FieldSelector = ({
  theme,
  fields,
  selectedFieldId,
  onSelectField,
}: FieldSelectorProps) => {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const selectedField = fields.find((f) => f.id === selectedFieldId);

  if (fields.length === 0) return null;

  return (
    <View className="relative" style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.xs }}>
      <TouchableOpacity
        onPress={() => setIsOpen(!isOpen)}
        className="row-between surface-bg rounded-xl"
        style={{
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
          borderWidth: 1,
          borderColor: theme.primary + "30",
        }}
      >
        <View className="row flex-1">
          <Ionicons
            name="leaf"
            size={18}
            color={theme.primary}
            style={{ marginRight: spacing.sm }}
          />
          <Text
            className="text-primary text-[15px] font-semibold"
            numberOfLines={1}
          >
            {selectedField?.name ?? t.home.selectField}
          </Text>
        </View>
        <Ionicons
          name={isOpen ? "chevron-up" : "chevron-down"}
          size={18}
          color={theme.textSecondary}
        />
      </TouchableOpacity>

      {isOpen && (
        <View
          className="absolute surface-bg rounded-xl overflow-hidden"
          style={{
            top:
              spacing.xs +
              spacing.sm +
              spacing.md +
              spacing.sm +
              spacing.xs +
              2,
            left: spacing.md,
            right: spacing.md,
            borderWidth: 1,
            borderColor: theme.primary + "30",
            maxHeight: 200,
            zIndex: 1000,
            elevation: 10,
            shadowColor: theme.shadowColor,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.15,
            shadowRadius: 8,
          }}
        >
          <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
            {fields
              .filter((field) => field.id !== selectedFieldId)
              .map((field, index, arr) => (
                <TouchableOpacity
                  key={field.id}
                  onPress={() => {
                    onSelectField(field.id);
                    setIsOpen(false);
                  }}
                  className="row surface-bg"
                  style={{
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm + 2,
                    borderBottomWidth: index < arr.length - 1 ? 1 : 0,
                    borderBottomColor: theme.primary + "15",
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="leaf-outline"
                    size={16}
                    color={theme.textSecondary}
                    style={{ marginRight: spacing.sm }}
                  />
                  <Text className="text-primary text-sm font-medium">
                    {field.name}
                  </Text>
                </TouchableOpacity>
              ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
};
