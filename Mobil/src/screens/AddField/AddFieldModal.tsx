// Tarla ekleme modali — pageSheet (iOS) / fullScreen (Android)
// Baslik + AddFieldFlow wizard

import { useState, useCallback, useRef } from "react";
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
      return t.addField.addNewField;
    case "greenhousePolygon":
      return t.addField.drawBoundary;
    case "greenhouseZones":
      return t.addField.drawZones;
    case "planting":
      return t.addField.plantingTitle || "Ekim Bilgileri";
    case "preview":
      return t.addField.preview;
    default:
      return t.addField.addNewField;
  }
};

export const AddFieldModal = ({
  visible,
  theme,
  onClose,
}: AddFieldModalProps) => {
  const { t } = useLanguage();
  const [currentStep, setCurrentStep] = useState<WizardStep>("fieldType");
  const goBackRef = useRef<(() => void) | null>(null);

  // Modal kapanirken state sifirla
  const handleClose = useCallback(() => {
    setCurrentStep("fieldType");
    onClose();
  }, [onClose]);

  // Header geri butonu: ilk adimda modal'i kapat, digerlerinde onceki adima don
  const handleHeaderBack = useCallback(() => {
    if (currentStep === "fieldType") {
      handleClose();
    } else if (goBackRef.current) {
      goBackRef.current();
    }
  }, [currentStep, handleClose]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === "ios" ? "pageSheet" : "fullScreen"}
      onRequestClose={handleHeaderBack}
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
            paddingHorizontal: s(16),
            paddingTop: vs(8),
            paddingBottom: vs(12),
            borderBottomWidth: 1,
            borderBottomColor: theme.divider,
          }}
        >
          <TouchableOpacity
            onPress={handleHeaderBack}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialCommunityIcons
              name={Platform.OS === "ios"
                ? "chevron-down"
                : (currentStep === "fieldType" ? "close" : "arrow-left")}
              size={Platform.OS === "ios" ? 28 : 24}
              color={theme.textMain}
            />
          </TouchableOpacity>

          <Text
            style={{
              fontWeight: '700',
              fontSize: ms(18, 0.3),
              color: theme.textMain,
              marginLeft: s(12),
            }}
            numberOfLines={1}
          >
            {getStepTitle(currentStep, t)}
          </Text>
        </View>

        {/* Icerik */}
        <View style={{ flex: 1, backgroundColor: theme.background }}>
          <AddFieldFlow
            theme={theme}
            onStepChange={setCurrentStep}
            onBack={handleClose}
            goBackRef={goBackRef}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
};
