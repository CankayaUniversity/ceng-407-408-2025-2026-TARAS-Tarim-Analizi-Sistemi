// Popup mesaj context - global bildirim sistemi
// showPopup(message, duration) ile mesaj gosterilir

import {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { PopupMessage } from "../components/PopupMessage";

interface PopupMessageContextType {
  showPopup: (message: string, duration?: number) => void;
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
  const [duration, setDuration] = useState(2500);

  const showPopup = useCallback((msg: string, dur: number = 2500) => {
    setMessage(msg);
    setDuration(dur);
    setVisible(true);
  }, []);

  const handleHide = useCallback(() => {
    setVisible(false);
  }, []);

  return (
    <PopupMessageContext.Provider value={{ showPopup }}>
      {children}
      <PopupMessage
        message={message}
        visible={visible}
        onHide={handleHide}
        duration={duration}
      />
    </PopupMessageContext.Provider>
  );
};
