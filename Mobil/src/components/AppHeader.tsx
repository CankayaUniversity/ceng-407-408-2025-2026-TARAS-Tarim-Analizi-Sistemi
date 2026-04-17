// Uygulama ust basligi — logo, FieldSelector, bildirim butonu
// Tum state'i context'ten okuyor, prop almiyor

import React from "react";
import { View, Text, TouchableOpacity, ScrollView, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { useDashboard } from "../context/DashboardContext";
import { useLanguage } from "../context/LanguageContext";
import {
  spacing,
  s,
  vs,
  ms,
  getHeaderDimensions,
  getProfileButtonSize,
  useResponsive,
} from "../utils/responsive";
import LogoLight from "../assets/Taras-logo-light.svg";
import LogoDark from "../assets/Taras-logo-dark.svg";
import { NotificationsButton } from "./NotificationsButton";
import { NotificationsScreen } from "../screens";

export const AppHeader = () => {
  const { theme, isDark } = useTheme();
  const {
    fields,
    selectedFieldId,
    selectField,
    fieldSelectorOpen,
    setFieldSelectorOpen,
  } = useDashboard();
  const { t } = useLanguage();
  const { screenWidth } = useResponsive();
  const headerDims = getHeaderDimensions(screenWidth);
  const notificationsButtonSize = getProfileButtonSize(headerDims.logoSize);
  const [notificationsOpen, setNotificationsOpen] = React.useState(false);

  const fieldSelectorJSX =
    fields.length > 0 ? (
      <View className="flex-1 relative">
        <TouchableOpacity
          onPress={() => setFieldSelectorOpen(!fieldSelectorOpen)}
          className="row-between rounded-lg border"
          style={{
            paddingVertical: vs(6),
            paddingHorizontal: s(12),
            backgroundColor: theme.surface,
            borderColor: theme.primary + "30",
          }}
        >
          <View className="row flex-1" style={{ gap: s(6) }}>
            <Ionicons name="leaf" size={ms(14, 0.3)} color={theme.primary} />
            <Text
              className="font-semibold flex-1"
              style={{ fontSize: ms(13, 0.3), color: theme.textMain }}
              numberOfLines={1}
            >
              {fields.find((f) => f.id === selectedFieldId)?.name ?? t.home.selectField}
            </Text>
          </View>
          <Ionicons
            name={fieldSelectorOpen ? "chevron-up" : "chevron-down"}
            size={ms(14, 0.3)}
            color={theme.textSecondary}
            style={{ marginLeft: s(6) }}
          />
        </TouchableOpacity>

        {fieldSelectorOpen && (
          <View
            className="absolute left-0 right-0 rounded-lg border overflow-hidden z-[1001]"
            style={{
              top: vs(38),
              maxHeight: vs(200),
              backgroundColor: theme.surface,
              borderColor: theme.primary + "30",
              elevation: 10,
              shadowColor: theme.shadowColor,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.15,
              shadowRadius: 8,
            }}
          >
            <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
              {fields
                .filter((f) => f.id !== selectedFieldId)
                .map((field, index, arr) => (
                  <TouchableOpacity
                    key={field.id}
                    onPress={() => selectField(field.id)}
                    className="row"
                    style={[
                      { paddingHorizontal: s(12), paddingVertical: vs(10) },
                      index < arr.length - 1 && {
                        borderBottomWidth: 1,
                        borderBottomColor: theme.primary + "15",
                      },
                    ]}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="leaf-outline"
                      size={ms(14, 0.3)}
                      color={theme.textSecondary}
                      style={{ marginRight: s(8) }}
                    />
                    <Text
                      className="font-medium"
                      style={{ fontSize: ms(13, 0.3), color: theme.textMain }}
                    >
                      {field.name}
                    </Text>
                  </TouchableOpacity>
                ))}
            </ScrollView>
          </View>
        )}
      </View>
    ) : null;

  return (
    <View
      className="flex-row justify-between items-center z-[1000]"
      style={{
        paddingHorizontal: headerDims.headerPadding,
        paddingTop: headerDims.headerTopPadding,
        paddingBottom: spacing.xs,
        backgroundColor: theme.background,
      }}
    >
      <View style={{ marginLeft: headerDims.elementGap }}>
        {isDark ? (
          <LogoDark width={headerDims.logoSize} height={headerDims.logoSize} />
        ) : (
          <LogoLight width={headerDims.logoSize} height={headerDims.logoSize} />
        )}
      </View>

      <View className="flex-1 relative" style={{ marginHorizontal: spacing.sm }}>
        {fieldSelectorJSX}
      </View>

      <View className="row gap-2" style={{ marginRight: headerDims.elementGap }}>
        <NotificationsButton
          theme={theme}
          size={notificationsButtonSize}
          onPress={() => setNotificationsOpen(true)}
        />
      </View>

      <Modal
        visible={notificationsOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setNotificationsOpen(false)}
      >
        <NotificationsScreen onClose={() => setNotificationsOpen(false)} />
      </Modal>
    </View>
  );
};
