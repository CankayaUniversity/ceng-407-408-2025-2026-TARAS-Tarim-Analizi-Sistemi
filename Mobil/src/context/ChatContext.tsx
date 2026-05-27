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
import { useChat, type DemoChatOptions } from "../hooks/useChat";
import { useAuth } from "./AuthContext";
import { useDashboard } from "./DashboardContext";
import { useSectionFocus } from "./SectionFocusContext";
import { useTheme } from "./ThemeContext";
import { useLanguage } from "./LanguageContext";
import { navigationRef, TabParamList } from "../navigation/navigationRef";
import { ScreenType } from "../constants";
import { diseaseAPI } from "../utils/api";
import type { DiseaseDetection } from "../utils/api";

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
  const { handleLogout, dataSource } = useAuth();
  const { selectedFieldId, fields } = useDashboard();
  const { requestFocus } = useSectionFocus();
  const { setThemeMode } = useTheme();
  const { language, setLanguage } = useLanguage();
  const [showChat, setShowChat] = useState(false);
  const [aiSpotIndex, setAiSpotIndex] = useState(0);
  const [aiMoveTarget, setAiMoveTarget] = useState<number | null>(null);
  const focusTaskRef = useRef<{ cancel: () => void } | null>(null);

  // Demo chat asistanin frontend tools callback'leri (AWS modunda kullanilmaz)
  const selectedFieldName = useMemo(
    () => fields.find((f) => f.id === selectedFieldId)?.name,
    [fields, selectedFieldId],
  );

  const onCreateFolder = useCallback(
    async (zoneId: string, name: string) => {
      const res = await diseaseAPI.createFolder(zoneId, name);
      if (!res.success || !res.data) return null;
      return { folderId: res.data.folderId, folderName: res.data.name };
    },
    [],
  );

  const onSimulateScan = useCallback(
    async (label: string): Promise<DiseaseDetection | null> => {
      // Bos URI ile sahte capture; submitDetection demo dali hintedLabel'i alir
      const submit = await diseaseAPI.submitDetection("", null, label, null);
      if (!submit.success || !submit.data) return null;
      const poll = await diseaseAPI.getDetectionStatus(submit.data.detectionId);
      return poll.success && poll.data ? poll.data : null;
    },
    [],
  );

  const demoOptions: DemoChatOptions | undefined =
    dataSource === "demo"
      ? {
          fields,
          selectedFieldName,
          language,
          onSwitchTheme: setThemeMode,
          onSwitchLanguage: setLanguage,
          onCreateFolder,
          onSimulateScan,
        }
      : undefined;

  useEffect(() => {
    return () => {
      focusTaskRef.current?.cancel();
    };
  }, []);

  // LLM'den gelen tab navigasyonu — login → logout, diger → navigationRef
  // Section varsa ayrica SectionFocus odak istegi de tetiklenir
  const handleLLMNavigate = useCallback(
    (target: string, section: string | null, zoneId?: string) => {
      if (target === "login") {
        void handleLogout();
        return;
      }
      if (navigationRef.isReady()) {
        navigationRef.navigate(target as keyof TabParamList);
      }
      if (section) {
        // Tab gecisi tamamlandiktan sonra focus iste — zoneId varsa zone vurgusu da
        focusTaskRef.current?.cancel();
        focusTaskRef.current = InteractionManager.runAfterInteractions(() => {
          requestFocus(target as ScreenType, section, zoneId);
        });
      }
    },
    [handleLogout, requestFocus],
  );

  const chat = useChat(handleLLMNavigate, selectedFieldId, demoOptions);

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
