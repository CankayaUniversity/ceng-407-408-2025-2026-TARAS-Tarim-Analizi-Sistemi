// Donanim kurulum modali - gateway ve sensor ekleme akislari
// Props: visible, theme, onClose

import { useState } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
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
        style={[styles.container, { backgroundColor: theme.background }]}
      >
        {/* Header */}
        <View style={[styles.header, { backgroundColor: theme.accent }]}>
          <TouchableOpacity
            onPress={handleBack}
            style={styles.headerButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialCommunityIcons
              name={view === "menu" ? "close" : "arrow-left"}
              size={24}
              color="#fff"
            />
          </TouchableOpacity>

          <Text style={styles.headerTitle} numberOfLines={1}>
            {getTitle()}
          </Text>

          <TouchableOpacity
            onPress={handleClose}
            style={styles.headerButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            {view !== "menu" ? (
              <MaterialCommunityIcons name="close" size={24} color="#fff" />
            ) : (
              <View style={{ width: s(24) }} />
            )}
          </TouchableOpacity>
        </View>

        {/* Icerik */}
        <View style={[styles.content, { backgroundColor: theme.background }]}>
          {view === "menu" && (
            <View style={styles.menuContainer}>
              {/* Gateway Ekle */}
              <TouchableOpacity
                style={[styles.menuCard, { backgroundColor: theme.surface }]}
                onPress={() => setView("gateway")}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.menuIconWrap,
                    { backgroundColor: theme.accent + "20" },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="access-point"
                    size={32}
                    color={theme.accent}
                  />
                </View>
                <View style={styles.menuTextWrap}>
                  <Text style={[styles.menuTitle, { color: theme.text }]}>
                    {t.hardware.addGateway}
                  </Text>
                  <Text
                    style={[
                      styles.menuDesc,
                      { color: theme.textSecondary },
                    ]}
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
                style={[styles.menuCard, { backgroundColor: theme.surface }]}
                onPress={() => setView("sensor")}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.menuIconWrap,
                    { backgroundColor: theme.accent + "20" },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="thermometer-lines"
                    size={32}
                    color={theme.accent}
                  />
                </View>
                <View style={styles.menuTextWrap}>
                  <Text style={[styles.menuTitle, { color: theme.text }]}>
                    {t.hardware.addSensorNode}
                  </Text>
                  <Text
                    style={[
                      styles.menuDesc,
                      { color: theme.textSecondary },
                    ]}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: s(16),
    paddingVertical: vs(14),
  },
  headerButton: {
    width: s(40),
    height: s(40),
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    fontSize: ms(18, 0.3),
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
  },
  content: {
    flex: 1,
  },
  menuContainer: {
    padding: s(20),
    gap: s(16),
  },
  menuCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: s(16),
    borderRadius: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  menuIconWrap: {
    width: s(56),
    height: s(56),
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: s(16),
  },
  menuTextWrap: {
    flex: 1,
  },
  menuTitle: {
    fontSize: ms(16, 0.3),
    fontWeight: "700",
    marginBottom: vs(4),
  },
  menuDesc: {
    fontSize: ms(13, 0.3),
    lineHeight: ms(18, 0.3),
  },
});
