// Chat context — useChat hook'unu sarmaliyor, showChat + AI buton pozisyonu da burada
// navigateToScreen programatik navigasyon icin navigationRef + AuthContext.handleLogout kullaniyor

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { InteractionManager } from "react-native";
import { useChat } from "../hooks/useChat";
import { useAuth } from "./AuthContext";
import { useDashboard } from "./DashboardContext";
import { useSectionFocus } from "./SectionFocusContext";
import { navigationRef, TabParamList } from "../navigation/navigationRef";
import { ScreenType } from "../constants";

type UseChatReturn = ReturnType<typeof useChat>;

interface ChatContextValue extends UseChatReturn {
  showChat: boolean;
  setShowChat: (visible: boolean) => void;
  aiSpotIndex: number;
  setAiSpotIndex: (idx: number) => void;
  aiMoveTarget: number | null;
  setAiMoveTarget: (target: number | null) => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export const ChatProvider = ({ children }: { children: React.ReactNode }) => {
  const { handleLogout } = useAuth();
  const { selectedFieldId } = useDashboard();
  const { requestFocus } = useSectionFocus();
  const [showChat, setShowChat] = useState(false);
  const [aiSpotIndex, setAiSpotIndex] = useState(0);
  const [aiMoveTarget, setAiMoveTarget] = useState<number | null>(null);
  const focusTaskRef = useRef<{ cancel: () => void } | null>(null);

  // Unmount'ta bekleyen focus gorevini iptal et
  useEffect(() => {
    return () => {
      focusTaskRef.current?.cancel();
    };
  }, []);

  // LLM'den gelen tab navigasyonu — login → logout, diger → navigationRef
  // Section varsa ayrica SectionFocus odak istegi de tetiklenir
  const handleLLMNavigate = useCallback(
    (target: string, section: string | null) => {
      if (target === "login") {
        void handleLogout();
        return;
      }
      if (navigationRef.isReady()) {
        navigationRef.navigate(target as keyof TabParamList);
      }
      if (section) {
        // Tab gecisi tamamlandiktan sonra focus iste
        focusTaskRef.current?.cancel();
        focusTaskRef.current = InteractionManager.runAfterInteractions(() => {
          requestFocus(target as ScreenType, section);
        });
      }
    },
    [handleLogout, requestFocus],
  );

  const chat = useChat(handleLLMNavigate, selectedFieldId);

  // Pending bubble geldiginde chat'i kapat ve AI butonu diger noktaya tasi
  useEffect(() => {
    if (chat.pendingBubble) {
      setShowChat(false);
      setAiMoveTarget(aiSpotIndex === 0 ? 1 : 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.pendingBubble]);

  const value = useMemo<ChatContextValue>(
    () => ({
      ...chat,
      showChat,
      setShowChat,
      aiSpotIndex,
      setAiSpotIndex,
      aiMoveTarget,
      setAiMoveTarget,
    }),
    [chat, showChat, aiSpotIndex, aiMoveTarget],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};

export const useChatContext = (): ChatContextValue => {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChatContext must be used inside ChatProvider");
  return ctx;
};
