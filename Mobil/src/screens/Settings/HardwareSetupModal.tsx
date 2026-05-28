// Donanim kurulum modali - gateway ve sensor ekleme akislari
// AddFieldModal tasarim diline uygun — beyaz header, pageSheet (iOS)

import { useState, useCallback } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Platform,
} from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Theme } from "../../types";
import { useLanguage } from "../../context/LanguageContext";
import { s, vs, ms } from "../../utils/responsive";
import { AddGatewayFlow } from "./AddGatewayFlow";
import { AddSensorNodeFlow } from "./AddSensorNodeFlow";

type ViewType = "menu" | "gateway" | "sensor";

interface HardwareSetupModalProps {
  visible: boolean;
  theme: Theme;
  onClose: () => void;
}

export const HardwareSetupModal = ({
  visible,
  theme,
  onClose,
}: HardwareSetupModalProps) => {
  const { t } = useLanguage();
  const [view, setView] = useState<ViewType>("menu");

  const handleClose = useCallback((): void => {
    setView("menu");
    onClose();
  }, [onClose]);

  const handleBack = useCallback((): void => {
    if (view === "menu") handleClose();
    else setView("menu");
  }, [view, handleClose]);

  const handleFlowComplete = useCallback((): void => {
    setView("menu");
  }, []);

  const getTitle = (): string => {
    switch (view) {
      case "gateway": return t.hardware.addGateway;
      case "sensor":  return t.hardware.addSensorNode;
      default:        return t.hardware.title;
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === "ios" ? "pageSheet" : "fullScreen"}
      onRequestClose={handleBack}
    >
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: theme.background,
          paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
        }}
      >
        {/* Header — AddFieldModal ile ayni stil */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: s(16),
            paddingTop: vs(8),
            paddingBottom: vs(12),
            borderBottomWidth: 1,
            borderBottomColor: theme.divider,
          }}
        >
          <TouchableOpacity
            onPress={handleBack}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialCommunityIcons
              name={
                Platform.OS === "ios"
                  ? view === "menu" ? "chevron-down" : "arrow-left"
                  : view === "menu" ? "close" : "arrow-left"
              }
              size={Platform.OS === "ios" ? 28 : 24}
              color={theme.textMain}
            />
          </TouchableOpacity>

          <Text
            style={{
              flex: 1,
              fontWeight: "700",
              fontSize: ms(18, 0.3),
              color: theme.textMain,
              marginLeft: s(12),
            }}
            numberOfLines={1}
          >
            {getTitle()}
          </Text>

          {view !== "menu" ? (
            <TouchableOpacity
              onPress={handleClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialCommunityIcons name="close" size={22} color={theme.textSecondary} />
            </TouchableOpacity>
          ) : (
            <View style={{ width: s(22) }} />
          )}
        </View>

        {/* Icerik */}
        <View style={{ flex: 1, backgroundColor: theme.background }}>
          {view === "menu" && (
            <View style={{ padding: s(20), gap: s(12) }}>
              {/* Gateway Ekle */}
              <TouchableOpacity
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  padding: s(14),
                  backgroundColor: theme.surface,
                  borderRadius: 12,
                  elevation: 1,
                  shadowColor: theme.shadowColor,
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.08,
                  shadowRadius: 3,
                }}
                onPress={() => setView("gateway")}
                activeOpacity={0.7}
              >
                <View
                  style={{
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 10,
                    width: s(48),
                    height: s(48),
                    backgroundColor: theme.primary + "20",
                    marginRight: s(14),
                  }}
                >
                  <MaterialCommunityIcons name="access-point" size={26} color={theme.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: ms(15, 0.3), fontWeight: "700", color: theme.textMain, marginBottom: vs(3) }}>
                    {t.hardware.addGateway}
                  </Text>
                  <Text style={{ fontSize: ms(12, 0.3), lineHeight: ms(17, 0.3), color: theme.textSecondary }}>
                    {t.hardware.addGatewayDesc}
                  </Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={theme.textSecondary} />
              </TouchableOpacity>

              {/* Sensor Node Ekle */}
              <TouchableOpacity
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  padding: s(14),
                  backgroundColor: theme.surface,
                  borderRadius: 12,
                  elevation: 1,
                  shadowColor: theme.shadowColor,
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.08,
                  shadowRadius: 3,
                }}
                onPress={() => setView("sensor")}
                activeOpacity={0.7}
              >
                <View
                  style={{
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 10,
                    width: s(48),
                    height: s(48),
                    backgroundColor: theme.primary + "20",
                    marginRight: s(14),
                  }}
                >
                  <MaterialCommunityIcons name="thermometer-lines" size={26} color={theme.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: ms(15, 0.3), fontWeight: "700", color: theme.textMain, marginBottom: vs(3) }}>
                    {t.hardware.addSensorNode}
                  </Text>
                  <Text style={{ fontSize: ms(12, 0.3), lineHeight: ms(17, 0.3), color: theme.textSecondary }}>
                    {t.hardware.addSensorNodeDesc}
                  </Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
          )}

          {view === "gateway" && (
            <AddGatewayFlow
              theme={theme}
              onComplete={handleFlowComplete}
              onBack={() => setView("menu")}
            />
          )}

          {view === "sensor" && (
            <AddSensorNodeFlow
              theme={theme}
              onComplete={handleFlowComplete}
              onBack={() => setView("menu")}
            />
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
};
