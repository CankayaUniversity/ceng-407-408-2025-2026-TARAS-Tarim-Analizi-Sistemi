// Tarla ekleme adim makinesi — AddGatewayFlow pattern'ini takip eder
// fieldType'a gore GREENHOUSE veya POT_AREA akisina yonlendirir

import { useState, useCallback } from "react";
import type { Theme } from "../../utils/theme";
import { FieldTypeStep } from "./FieldTypeStep";
import { FieldInfoStep } from "./FieldInfoStep";
import { GreenhousePolygonStep } from "./GreenhousePolygonStep";
import { GreenhouseZonesStep } from "./GreenhouseZonesStep";
import { PotCountStep } from "./PotCountStep";
import { PreviewStep } from "./PreviewStep";
import { INITIAL_WIZARD_STATE } from "./types";
import type { WizardState, WizardStep } from "./types";
import { generatePotZones } from "./addFieldUtils";

interface AddFieldFlowProps {
  theme: Theme;
  onStepChange: (step: WizardStep) => void;
  onBack: () => void;
}

export const AddFieldFlow = ({
  theme,
  onStepChange,
  onBack,
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
        goToStep("fieldInfo");
        break;
      case "fieldInfo":
        if (state.fieldType === "GREENHOUSE") {
          goToStep("greenhousePolygon");
        } else {
          goToStep("potCount");
        }
        break;
      case "greenhousePolygon":
        goToStep("greenhouseZones");
        break;
      case "greenhouseZones":
        goToStep("preview");
        break;
      case "potCount": {
        // prev.potCount kullan — onUpdate ile setState ayni tick'te calisir,
        // closure'daki state.potCount henuz guncellenmemis olabilir.
        setState((prev) => ({ ...prev, zones: generatePotZones(prev.potCount) }));
        goToStep("preview");
        break;
      }
      case "preview":
        // Preview'da olusturma PreviewStep icinde yapilir
        break;
    }
  }, [step, state.fieldType, goToStep]);

  // Geri: onceki adima don
  const handleBack = useCallback(() => {
    switch (step) {
      case "fieldType":
        onBack();
        break;
      case "fieldInfo":
        goToStep("fieldType");
        break;
      case "greenhousePolygon":
        goToStep("fieldInfo");
        break;
      case "greenhouseZones":
        goToStep("greenhousePolygon");
        break;
      case "potCount":
        goToStep("fieldInfo");
        break;
      case "preview":
        if (state.fieldType === "GREENHOUSE") {
          goToStep("greenhouseZones");
        } else {
          goToStep("potCount");
        }
        break;
    }
  }, [step, state.fieldType, goToStep, onBack]);

  const stepProps = {
    theme,
    state,
    onUpdate: updateState,
    onNext: handleNext,
    onBack: handleBack,
  };

  switch (step) {
    case "fieldType":
      return <FieldTypeStep {...stepProps} />;
    case "fieldInfo":
      return <FieldInfoStep {...stepProps} />;
    case "greenhousePolygon":
      return <GreenhousePolygonStep {...stepProps} />;
    case "greenhouseZones":
      return <GreenhouseZonesStep {...stepProps} />;
    case "potCount":
      return <PotCountStep {...stepProps} />;
    case "preview":
      return <PreviewStep {...stepProps} />;
  }
};
