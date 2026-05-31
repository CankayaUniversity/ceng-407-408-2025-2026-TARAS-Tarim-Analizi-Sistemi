// Tarla ekleme modali — FullScreenModal (buyuk baslik) uzerine
// Baslik = adim adi, caption + ilerleme cubugu = wizard adimi, AddFieldFlow icerik

import { useState, useCallback, useRef } from "react";
import { View } from "react-native";
import { Theme } from "../../types";
import { useLanguage } from "../../context/LanguageContext";
import { FullScreenModal } from "../../components/FullScreenModal";
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
  const { t, language } = useLanguage();
  const [currentStep, setCurrentStep] = useState<WizardStep>("fieldType");
  const [progress, setProgress] = useState({ current: 1, total: 5 });
  const goBackRef = useRef<(() => void) | null>(null);

  // Modal kapanirken state sifirla
  const handleClose = useCallback(() => {
    setCurrentStep("fieldType");
    onClose();
  }, [onClose]);

  // Header geri chevron'u — yalnizca ilk adim disinda gosterilir, onceki adima doner.
  const handleStepBack = useCallback(() => {
    goBackRef.current?.();
  }, []);

  // Android geri / required: ilk adimda kapat, digerlerinde adim geri.
  const handleRequestClose = useCallback(() => {
    if (currentStep === "fieldType") {
      handleClose();
    } else {
      goBackRef.current?.();
    }
  }, [currentStep, handleClose]);

  const handleProgress = useCallback((current: number, total: number) => {
    setProgress({ current, total });
  }, []);

  const caption =
    language === "tr"
      ? `Adım ${progress.current}/${progress.total}`
      : `Step ${progress.current} of ${progress.total}`;

  return (
    <FullScreenModal
      visible={visible}
      theme={theme}
      onRequestClose={handleRequestClose}
      title={getStepTitle(currentStep, t)}
      caption={caption}
      progress={progress.current / progress.total}
      onBack={currentStep === "fieldType" ? undefined : handleStepBack}
      onClose={handleClose}
    >
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        <AddFieldFlow
          theme={theme}
          onStepChange={setCurrentStep}
          onProgress={handleProgress}
          onBack={handleClose}
          goBackRef={goBackRef}
        />
      </View>
    </FullScreenModal>
  );
};
