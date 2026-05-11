// Ekran icindeki belirli bir bolumu odakla — LLM navigate_to_section icin
// FocusableSection componentleri bu context'i dinler, hedefleri eslestirince
// parent ScrollView'u hedefe kaydirir ve border animasyonu tetikler
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { ScreenType } from "../constants";

export interface FocusRequest {
  screen: ScreenType;
  section: string;
  nonce: number;
}

interface SectionFocusContextValue {
  focus: FocusRequest | null;
  requestFocus: (screen: ScreenType, section: string) => void;
  clearFocus: () => void;
}

const SectionFocusContext = createContext<SectionFocusContextValue | null>(
  null,
);

export const SectionFocusProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [focus, setFocus] = useState<FocusRequest | null>(null);
  const nonceRef = useRef(0);

  const requestFocus = useCallback(
    (screen: ScreenType, section: string) => {
      nonceRef.current += 1;
      console.log("[FOCUS] request:", screen, section, "#", nonceRef.current);
      setFocus({ screen, section, nonce: nonceRef.current });
    },
    [],
  );

  const clearFocus = useCallback(() => {
    setFocus(null);
  }, []);

  const value = useMemo<SectionFocusContextValue>(
    () => ({ focus, requestFocus, clearFocus }),
    [focus, requestFocus, clearFocus],
  );

  return (
    <SectionFocusContext.Provider value={value}>
      {children}
    </SectionFocusContext.Provider>
  );
};

export const useSectionFocus = (): SectionFocusContextValue => {
  const ctx = useContext(SectionFocusContext);
  if (!ctx) {
    throw new Error(
      "useSectionFocus must be used inside SectionFocusProvider",
    );
  }
  return ctx;
};

// Belli bir ekrana ait focus istegini dondurur — diger ekranlardaki
// FocusableSection'larin useEffect'ini gereksiz yere tetiklemez
export const useSectionFocusFor = (screen: ScreenType): FocusRequest | null => {
  const { focus } = useSectionFocus();
  return focus?.screen === screen ? focus : null;
};
