// Popup mesaj context - global bildirim sistemi
// showPopup(message, duration) ile mesaj gosterilir.
// Gosterim/sure mantigi BURADA (tek kaynak) — boylece ayni anda birden fazla
// GlobalToast (kok + acik FullScreenModal) ayni durumu senkron yansitir.

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { PopupMessage } from "../components/PopupMessage";

interface PopupMessageContextType {
  showPopup: (message: string, duration?: number) => void;
  message: string;
  visible: boolean;
}

const PopupMessageContext = createContext<PopupMessageContextType | undefined>(
  undefined,
);

export const usePopupMessage = () => {
  const context = useContext(PopupMessageContext);
  if (!context) {
    throw new Error(
      "usePopupMessage must be used within a PopupMessageProvider",
    );
  }
  return context;
};

interface PopupMessageProviderProps {
  children: ReactNode;
}

export const PopupMessageProvider = ({
  children,
}: PopupMessageProviderProps) => {
  const [message, setMessage] = useState("");
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showPopup = useCallback((msg: string, dur: number = 2500) => {
    if (!msg || !msg.trim()) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    setMessage(msg);
    setVisible(true);
    timerRef.current = setTimeout(() => {
      setVisible(false);
      timerRef.current = null;
    }, dur);
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const value = useMemo<PopupMessageContextType>(
    () => ({ showPopup, message, visible }),
    [showPopup, message, visible],
  );

  return (
    <PopupMessageContext.Provider value={value}>
      {children}
    </PopupMessageContext.Provider>
  );
};

// Toast'u TEMA agacinin icinde cizer. PopupMessageProvider, ThemeProvider'in
// USTUNDE oldugu icin toast'i provider'in kendisinde cizemiyoruz (orada useTheme
// yok). Bu yuzden GlobalToast iki yerde mount edilir:
//   - App.tsx kokte bir kez (sekmelerin uzerinde),
//   - FullScreenModal kendi pencere katmaninda bir kez (RN Modal ayri pencere
//     actigi icin koktekı toast modalin ALTINDA kalir).
// Ikisi de ayni context durumunu okur; modal acikken modaldaki kopya koktekini
// orter, cift gosterim olmaz.
export const GlobalToast = () => {
  const { message, visible } = usePopupMessage();
  return <PopupMessage message={message} visible={visible} />;
};
