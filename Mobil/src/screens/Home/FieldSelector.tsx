import { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FieldSelectorProps } from "./types";

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
    <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 2 }}>
      <TouchableOpacity
        onPress={() => setIsOpen(!isOpen)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: theme.surface,
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: theme.accent + '25',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <Ionicons name="leaf" size={16} color={theme.accent} style={{ marginRight: 8 }} />
          <Text style={{ color: theme.text, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>
            {selectedField?.name ?? 'Tarla Secin'}
          </Text>
        </View>
        <Ionicons
          name={isOpen ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={theme.textSecondary}
        />
      </TouchableOpacity>

      {isOpen && (
        <View
          style={{
            position: 'absolute',
            top: 48,
            left: 16,
            right: 16,
            backgroundColor: theme.surface,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: theme.accent + '30',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.2,
            shadowRadius: 8,
            elevation: 10,
            zIndex: 1000,
            maxHeight: 200,
          }}
        >
          <ScrollView bounces={false}>
            {fields.map((field, index) => (
              <TouchableOpacity
                key={field.id}
                onPress={() => {
                  onSelectField(field.id);
                  setIsOpen(false);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  borderBottomWidth: index < fields.length - 1 ? 1 : 0,
                  borderBottomColor: theme.accent + '15',
                  backgroundColor: field.id === selectedFieldId ? theme.accent + '10' : 'transparent',
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontSize: 14, fontWeight: field.id === selectedFieldId ? '600' : '400' }}>
                    {field.name}
                  </Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 11 }}>
                    {field.area} ha
                  </Text>
                </View>
                {field.id === selectedFieldId && (
                  <Ionicons name="checkmark" size={16} color={theme.accent} />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
};
