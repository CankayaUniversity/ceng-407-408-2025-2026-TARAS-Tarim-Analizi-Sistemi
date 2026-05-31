// Adim 3a: Sera dis siniri cizimi — PolygonCanvas ile en az 3 nokta
// Cizilen poligon FieldPolygon.exterior olarak kullanilacak.
// StepScaffold scroll=false: canvas onResponderMove kullanir, ScrollView responder'i calar.

import { useState } from "react";
import { useLanguage } from "../../context/LanguageContext";
import { ActionButton } from "../../components/ActionButton";
import { StepScaffold } from "./components/StepScaffold";
import { PolygonCanvas } from "./PolygonCanvas";
import type { StepProps } from "./types";

export const GreenhousePolygonStep = ({
  theme,
  state,
  onUpdate,
  onNext,
}: StepProps) => {
  const { t } = useLanguage();
  const [error, setError] = useState<string | null>(null);

  const handlePointsChange = (points: [number, number][]) => {
    onUpdate({ outerPolygon: points });
    if (error) setError(null);
  };

  const handleNext = () => {
    if (state.outerPolygon.length < 3) {
      setError(t.addField.minPoints);
      return;
    }
    setError(null);
    onNext();
  };

  return (
    <StepScaffold
      theme={theme}
      scroll={false}
      title={t.addField.drawBoundary}
      subtitle={t.addField.drawBoundaryHint}
      error={error}
      footer={
        <ActionButton
          theme={theme}
          label={t.addField.next}
          trailingIcon="chevron-right"
          onPress={handleNext}
          disabled={state.outerPolygon.length < 3}
        />
      }
    >
      <PolygonCanvas
        theme={theme}
        points={state.outerPolygon}
        onPointsChange={handlePointsChange}
      />
    </StepScaffold>
  );
};
