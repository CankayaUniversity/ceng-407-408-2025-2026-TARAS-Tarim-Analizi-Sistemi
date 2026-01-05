import { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FieldSelectorProps } from "./types";
import { spacing } from "../../utils/responsive";

export const FieldSelector = ({
  theme,
  fields,
  selectedFieldId,
  onSelectField,
}: FieldSelectorProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const selectedField = fields.find(f => f.id === selectedFieldId);

  if (fields.length === 0) return null;

  return (
    <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.xs, paddingBottom: spacing.xs, position: 'relative' }}>
      <TouchableOpacity
        onPress={() => setIsOpen(!isOpen)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
          backgroundColor: theme.surface,
          borderRadius: spacing.sm + 2,
          borderWidth: 1,
          borderColor: theme.accent + '30',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <Ionicons name="leaf" size={18} color={theme.accent} style={{ marginRight: spacing.sm }} />
          <Text
            style={{
              color: theme.text,
              fontSize: 15,
              fontWeight: '600',
            }}
            numberOfLines={1}
          >
            {selectedField?.name ?? 'Tarla Seçin'}
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
          style={{
            position: 'absolute',
            top: spacing.xs + spacing.sm + spacing.md + spacing.sm + spacing.xs + 2,
            left: spacing.md,
            right: spacing.md,
            backgroundColor: theme.surface,
            borderRadius: spacing.sm + 2,
            borderWidth: 1,
            borderColor: theme.accent + '30',
            maxHeight: 200,
            overflow: 'hidden',
            zIndex: 1000,
            elevation: 10,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.15,
            shadowRadius: 8,
          }}
        >
          <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
            {fields
              .filter(field => field.id !== selectedFieldId)
              .map((field, index, arr) => (
                <TouchableOpacity
                  key={field.id}
                  onPress={() => {
                    onSelectField(field.id);
                    setIsOpen(false);
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm + 2,
                    borderBottomWidth: index < arr.length - 1 ? 1 : 0,
                    borderBottomColor: theme.accent + '15',
                    backgroundColor: theme.surface,
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="leaf-outline" size={16} color={theme.textSecondary} style={{ marginRight: spacing.sm }} />
                  <Text style={{ color: theme.text, fontSize: 14, fontWeight: '500' }}>
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
