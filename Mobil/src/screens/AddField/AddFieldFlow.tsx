// Tarla ekleme adim makinesi — AddGatewayFlow pattern'ini takip eder
// fieldType'a gore greenhouse veya pot akisina yonlendirir

import { useState, useCallback } from "react";
import type { Theme } from "../../utils/theme";
import { FieldSetupStep } from "./FieldSetupStep";
import { GreenhousePolygonStep } from "./GreenhousePolygonStep";
import { GreenhouseZonesStep } from "./GreenhouseZonesStep";
import { PlantingStep } from "./PlantingStep";
import { PreviewStep } from "./PreviewStep";
import { INITIAL_WIZARD_STATE } from "./types";
import type { WizardState, WizardStep } from "./types";
import { generatePotZones } from "./addFieldUtils";

interface AddFieldFlowProps {
  theme: Theme;
  onStepChange: (step: WizardStep) => void;
  onBack: () => void;
  goBackRef?: React.MutableRefObject<(() => void) | null>;
}

export const AddFieldFlow = ({
  theme,
  onStepChange,
  onBack,
  goBackRef,
}: AddFieldFlowProps) => {
  const [step, setStep] = useState<WizardStep>("fieldType");
  const [state, setState] = useState<WizardState>({ ...INITIAL_WIZARD_STATE });

  const updateState = useCallback((partial: Partial<WizardState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  const goToStep = useCallback(
    (next: WizardStep) => {
      setStep(next);
      onStepChange(next);
    },
    [onStepChange],
  );

  // Ileri: mevcut adima + fieldType'a gore sonraki adimi belirle
  const handleNext = useCallback(() => {
    switch (step) {
      case "fieldType":
        if (state.fieldType === "greenhouse") {
          goToStep("greenhousePolygon");
        } else {
          setState((prev) => ({ ...prev, zones: generatePotZones(prev.potCount) }));
          goToStep("planting");
        }
        break;
      case "greenhousePolygon":
        goToStep("greenhouseZones");
        break;
      case "greenhouseZones":
        goToStep("planting");
        break;
      case "planting":
        goToStep("preview");
        break;
      case "preview":
        break;
    }
  }, [step, state.fieldType, goToStep]);

  // Geri: onceki adima don
  const handleBack = useCallback(() => {
    switch (step) {
      case "fieldType":
        onBack();
        break;
      case "greenhousePolygon":
        goToStep("fieldType");
        break;
      case "greenhouseZones":
        goToStep("greenhousePolygon");
        break;
      case "planting":
        if (state.fieldType === "greenhouse") {
          goToStep("greenhouseZones");
        } else {
          goToStep("fieldType");
        }
        break;
      case "preview":
        goToStep("planting");
        break;
    }
  }, [step, state.fieldType, goToStep, onBack]);

  // Header'daki geri butonunun bu fonksiyonu cagirabilmesi icin ref'e bagla
  if (goBackRef) goBackRef.current = handleBack;

  const stepProps = {
    theme,
    state,
    onUpdate: updateState,
    onNext: handleNext,
    onBack: handleBack,
  };

  switch (step) {
    case "fieldType":
      return <FieldSetupStep {...stepProps} />;
    case "greenhousePolygon":
      return <GreenhousePolygonStep {...stepProps} />;
    case "greenhouseZones":
      return <GreenhouseZonesStep {...stepProps} />;
    case "planting":
      return <PlantingStep {...stepProps} />;
    case "preview":
      return <PreviewStep {...stepProps} />;
    default:
      return <FieldSetupStep {...stepProps} />;
  }
};
