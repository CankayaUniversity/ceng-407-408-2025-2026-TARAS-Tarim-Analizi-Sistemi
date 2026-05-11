// Tarla ekleme modali — HardwareSetupModal pattern'ini takip eder
// Tam ekran modal, primary header bar, geri/kapat butonlari

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
import { AddFieldFlow } from "./AddFieldFlow";
import type { WizardStep } from "./types";

interface AddFieldModalProps {
  visible: boolean;
  theme: Theme;
  onClose: () => void;
}

// Adim → baslik esleme
const getStepTitle = (
  step: WizardStep,
  t: ReturnType<typeof useLanguage>["t"],
): string => {
  switch (step) {
    case "fieldType":
      return t.addField.selectFieldType;
    case "fieldInfo":
      return t.addField.fieldName;
    case "greenhousePolygon":
      return t.addField.drawBoundary;
    case "greenhouseZones":
      return t.addField.drawZones;
    case "potCount":
      return t.addField.potCount;
    case "preview":
      return t.addField.preview;
  }
};

export const AddFieldModal = ({
  visible,
  theme,
  onClose,
}: AddFieldModalProps) => {
  const { t } = useLanguage();
  const [currentStep, setCurrentStep] = useState<WizardStep>("fieldType");

  // Modal kapanirken state sifirla
  const handleClose = useCallback(() => {
    setCurrentStep("fieldType");
    onClose();
  }, [onClose]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
    >
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: theme.background,
          paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
        }}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: theme.primary,
            paddingHorizontal: s(16),
            paddingVertical: vs(14),
          }}
        >
          <TouchableOpacity
            onPress={handleClose}
            style={{ width: s(40), height: s(40), alignItems: 'center', justifyContent: 'center' }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialCommunityIcons
              name={currentStep === "fieldType" ? "close" : "arrow-left"}
              size={24}
              color={theme.textOnPrimary}
            />
          </TouchableOpacity>

          <Text
            style={{ flex: 1, textAlign: 'center', fontWeight: 'bold', fontSize: ms(18, 0.3), color: theme.textOnPrimary }}
            numberOfLines={1}
          >
            {getStepTitle(currentStep, t)}
          </Text>

          {/* Sag taraf bosluk (header simetrik olsun) */}
          <View style={{ width: s(40) }} />
        </View>

        {/* Icerik */}
        <View style={{ flex: 1, backgroundColor: theme.background }}>
          <AddFieldFlow
            theme={theme}
            onStepChange={setCurrentStep}
            onBack={handleClose}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
};
