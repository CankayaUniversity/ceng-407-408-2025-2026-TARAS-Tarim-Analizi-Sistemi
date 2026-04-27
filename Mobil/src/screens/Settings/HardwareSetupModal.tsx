// Donanim kurulum modali - gateway ve sensor ekleme akislari
// Props: visible, theme, onClose

import { useState } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Platform,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
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

  // Geri tusuna basildiginda menu veya kapat
  const handleBack = (): void => {
    if (view === "menu") {
      handleClose();
    } else {
      setView("menu");
    }
  };

  // Modal kapanirken state sifirla
  const handleClose = (): void => {
    setView("menu");
    onClose();
  };

  // Alt akis tamamlandiginda menuye don
  const handleFlowComplete = (): void => {
    setView("menu");
  };

  // Baslik metni
  const getTitle = (): string => {
    switch (view) {
      case "gateway":
        return t.hardware.addGateway;
      case "sensor":
        return t.hardware.addSensorNode;
      default:
        return t.hardware.title;
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleBack}
    >
      <SafeAreaView
        className="screen-bg"
        style={{
          paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
        }}
      >
        {/* Header */}
        <View
          className="row-between"
          style={{
            backgroundColor: theme.primary,
            paddingHorizontal: s(16),
            paddingVertical: vs(14),
          }}
        >
          <TouchableOpacity
            onPress={handleBack}
            className="center"
            style={{ width: s(40), height: s(40) }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialCommunityIcons
              name={view === "menu" ? "close" : "arrow-left"}
              size={24}
              color={theme.textOnPrimary}
            />
          </TouchableOpacity>

          <Text
            className="flex-1 text-center font-bold"
            style={{ fontSize: ms(18, 0.3), color: theme.textOnPrimary }}
            numberOfLines={1}
          >
            {getTitle()}
          </Text>

          <TouchableOpacity
            onPress={handleClose}
            className="center"
            style={{ width: s(40), height: s(40) }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            {view !== "menu" ? (
              <MaterialCommunityIcons name="close" size={24} color={theme.textOnPrimary} />
            ) : (
              <View style={{ width: s(24) }} />
            )}
          </TouchableOpacity>
        </View>

        {/* Icerik */}
        <View className="screen-bg">
          {view === "menu" && (
            <View style={{ padding: s(20), gap: s(16) }}>
              {/* Gateway Ekle */}
              <TouchableOpacity
                className="row surface-bg rounded-xl"
                style={{
                  padding: s(16),
                  elevation: 2,
                  shadowColor: theme.shadowColor,
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.1,
                  shadowRadius: 3,
                }}
                onPress={() => setView("gateway")}
                activeOpacity={0.7}
              >
                <View
                  className="center rounded-xl"
                  style={{
                    width: s(56),
                    height: s(56),
                    backgroundColor: theme.primary + "20",
                    marginRight: s(16),
                  }}
                >
                  <MaterialCommunityIcons
                    name="access-point"
                    size={32}
                    color={theme.primary}
                  />
                </View>
                <View className="flex-1">
                  <Text
                    className="text-primary font-bold"
                    style={{ fontSize: ms(16, 0.3), marginBottom: vs(4) }}
                  >
                    {t.hardware.addGateway}
                  </Text>
                  <Text
                    className="text-secondary"
                    style={{ fontSize: ms(13, 0.3), lineHeight: ms(18, 0.3) }}
                  >
                    {t.hardware.addGatewayDesc}
                  </Text>
                </View>
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={24}
                  color={theme.textSecondary}
                />
              </TouchableOpacity>

              {/* Sensor Node Ekle */}
              <TouchableOpacity
                className="row surface-bg rounded-xl"
                style={{
                  padding: s(16),
                  elevation: 2,
                  shadowColor: theme.shadowColor,
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.1,
                  shadowRadius: 3,
                }}
                onPress={() => setView("sensor")}
                activeOpacity={0.7}
              >
                <View
                  className="center rounded-xl"
                  style={{
                    width: s(56),
                    height: s(56),
                    backgroundColor: theme.primary + "20",
                    marginRight: s(16),
                  }}
                >
                  <MaterialCommunityIcons
                    name="thermometer-lines"
                    size={32}
                    color={theme.primary}
                  />
                </View>
                <View className="flex-1">
                  <Text
                    className="text-primary font-bold"
                    style={{ fontSize: ms(16, 0.3), marginBottom: vs(4) }}
                  >
                    {t.hardware.addSensorNode}
                  </Text>
                  <Text
                    className="text-secondary"
                    style={{ fontSize: ms(13, 0.3), lineHeight: ms(18, 0.3) }}
                  >
                    {t.hardware.addSensorNodeDesc}
                  </Text>
                </View>
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={24}
                  color={theme.textSecondary}
                />
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
