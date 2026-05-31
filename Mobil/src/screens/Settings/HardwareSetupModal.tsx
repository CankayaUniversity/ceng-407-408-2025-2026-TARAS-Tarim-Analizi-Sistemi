// Donanim kurulum modali - gateway ve sensor ekleme akislari
// FullScreenModal primitifi uzerine (duz buyuk-baslik header + duz menu satirlari)
// Props: visible, theme, onClose

import { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Theme } from "../../types";
import { useLanguage } from "../../context/LanguageContext";
import { s, vs, ms } from "../../utils/responsive";
import { FullScreenModal } from "../../components/FullScreenModal";
import { AddGatewayFlow } from "./AddGatewayFlow";
import { AddSensorNodeFlow } from "./AddSensorNodeFlow";

type ViewType = "menu" | "gateway" | "sensor";

interface HardwareSetupModalProps {
  visible: boolean;
  theme: Theme;
  onClose: () => void;
}

// Donanim menusu satiri — duz liste (kart degil): ikon kutusu + baslik/aciklama + chevron.
const MenuRow = ({
  theme,
  icon,
  title,
  desc,
  onPress,
  bordered = false,
}: {
  theme: Theme;
  icon: string;
  title: string;
  desc: string;
  onPress: () => void;
  bordered?: boolean;
}) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.7}
    style={{
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: vs(14),
      paddingHorizontal: s(20),
      borderBottomWidth: bordered ? 1 : 0,
      borderBottomColor: theme.divider,
    }}
  >
    <View
      style={{
        width: s(44),
        height: s(44),
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: theme.primary + "15",
        marginRight: s(14),
      }}
    >
      <MaterialCommunityIcons name={icon as any} size={24} color={theme.primary} />
    </View>
    <View style={{ flex: 1 }}>
      <Text
        style={{ fontSize: ms(16, 0.3), fontWeight: "700", color: theme.textMain, marginBottom: vs(2) }}
      >
        {title}
      </Text>
      <Text
        style={{ fontSize: ms(13, 0.3), lineHeight: ms(18, 0.3), color: theme.textSecondary }}
      >
        {desc}
      </Text>
    </View>
    <MaterialCommunityIcons name="chevron-right" size={22} color={theme.textMuted} />
  </TouchableOpacity>
);

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
    <FullScreenModal
      visible={visible}
      theme={theme}
      onRequestClose={handleBack}
      title={getTitle()}
      // Geri chevron yalnizca alt akista (menuye doner); X her zaman kapatir.
      onBack={view !== "menu" ? () => setView("menu") : undefined}
      onClose={handleClose}
    >
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        {view === "menu" && (
          <View>
            <MenuRow
              theme={theme}
              icon="access-point"
              title={t.hardware.addGateway}
              desc={t.hardware.addGatewayDesc}
              onPress={() => setView("gateway")}
              bordered
            />
            <MenuRow
              theme={theme}
              icon="thermometer-lines"
              title={t.hardware.addSensorNode}
              desc={t.hardware.addSensorNodeDesc}
              onPress={() => setView("sensor")}
            />
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
    </FullScreenModal>
  );
};
