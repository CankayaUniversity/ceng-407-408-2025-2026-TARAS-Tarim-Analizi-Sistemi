// Tarla ekleme adim makinesi — AddGatewayFlow pattern'ini takip eder
// fieldType'a gore greenhouse veya pot akisina yonlendirir.
//
// Adim gecisi: anlik "pat" diye degil, yandan kayarak (ileri sola, geri saga) + fade.
// switch zaten her adimda step bilesenini unmount/mount eder; bu yuzden TEK-MOUNT sirali
// gecis (mevcut OUT -> displayedStep degis -> yeni IN) bugunku mount semantigini birebir korur,
// state kaybi YOK (wizard state bu flow'da yasar). Iki adimi AYNI ANDA mount eden crossfade
// YAPILMAZ (cift SVG + cift PanResponder canvas step'lerinde sorun cikarir).

import { useState, useCallback, useEffect, useRef } from "react";
import { Animated, Easing, Dimensions } from "react-native";
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
  /** Adim ilerlemesi (1-tabanli sira + toplam) — fieldType'a gore dallanir. Header cubugu icin. */
  onProgress?: (current: number, total: number) => void;
  onBack: () => void;
  goBackRef?: React.MutableRefObject<(() => void) | null>;
}

// Adim siralari — fieldType'a gore dallanir (sera 5 adim, saksi/acik 3 adim).
const GREENHOUSE_ORDER: WizardStep[] = [
  "fieldType",
  "greenhousePolygon",
  "greenhouseZones",
  "planting",
  "preview",
];
const OPEN_ORDER: WizardStep[] = ["fieldType", "planting", "preview"];

// Gecis hizi — FullScreenModal ile ayni snappy his (disease native-stack ~100ms).
const ANIM_IN = 180;
const ANIM_OUT = 150;

export const AddFieldFlow = ({
  theme,
  onStepChange,
  onProgress,
  onBack,
  goBackRef,
}: AddFieldFlowProps) => {
  const [step, setStep] = useState<WizardStep>("fieldType");
  const [state, setState] = useState<WizardState>({ ...INITIAL_WIZARD_STATE });

  // Gecis: tx (translateX px) + op (opacity). displayedStep gercekten cizilen adim —
  // OUT animasyonu boyunca ESKI adim gorunur kalsin diye step'ten ayri tutulur.
  const W = Dimensions.get("window").width;
  const tx = useRef(new Animated.Value(0)).current;
  const op = useRef(new Animated.Value(1)).current;
  const [displayedStep, setDisplayedStep] = useState<WizardStep>("fieldType");
  const transitioningRef = useRef(false);

  // Header ilerleme cubugu icin: mevcut adimin dal-icindeki sirasini bildir.
  useEffect(() => {
    const order =
      state.fieldType === "greenhouse" ? GREENHOUSE_ORDER : OPEN_ORDER;
    const idx = order.indexOf(step);
    onProgress?.(idx < 0 ? 1 : idx + 1, order.length);
  }, [step, state.fieldType, onProgress]);

  // Adim degisince yandan kaydir: OUT (eski sola/saga + fade) -> displayedStep degis ->
  // IN (yeni karsi taraftan merkeze + fade). Yon = sira indeksinden.
  useEffect(() => {
    if (step === displayedStep) return;
    const order =
      state.fieldType === "greenhouse" ? GREENHOUSE_ORDER : OPEN_ORDER;
    const dir = order.indexOf(step) >= order.indexOf(displayedStep) ? 1 : -1;
    transitioningRef.current = true;
    Animated.parallel([
      Animated.timing(tx, {
        toValue: -dir * W,
        duration: ANIM_OUT,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(op, {
        toValue: 0,
        duration: ANIM_OUT,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Yeni adimi karsi taraftan basla (opacity 0'ken konumla, atlama gorunmez).
      setDisplayedStep(step);
      tx.setValue(dir * W);
      Animated.parallel([
        Animated.timing(tx, {
          toValue: 0,
          duration: ANIM_IN,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(op, {
          toValue: 1,
          duration: ANIM_IN,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => {
        transitioningRef.current = false;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

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

  // Ileri: mevcut adima + fieldType'a gore sonraki adimi belirle.
  // Gecis suruyorsa hizli cift-dokunmayi yut (re-entrancy guard).
  const handleNext = useCallback(() => {
    if (transitioningRef.current) return;
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

  // Geri: onceki adima don (gecis suruyorsa yut).
  const handleBack = useCallback(() => {
    if (transitioningRef.current) return;
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

  // displayedStep cizilir (step DEGIL) — OUT animasyonunda eski adim ekranda kalir.
  const renderStep = (which: WizardStep) => {
    switch (which) {
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

  return (
    <Animated.View style={{ flex: 1, transform: [{ translateX: tx }], opacity: op }}>
      {renderStep(displayedStep)}
    </Animated.View>
  );
};
