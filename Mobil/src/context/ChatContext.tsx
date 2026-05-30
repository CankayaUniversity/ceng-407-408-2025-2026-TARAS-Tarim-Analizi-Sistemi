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
import {
  useChat,
  type DemoChatOptions,
  type ChatActionHandlers,
  type CarbonLogAction,
} from "../hooks/useChat";
import { useAuth } from "./AuthContext";
import { useDashboard } from "./DashboardContext";
import { useSectionFocus } from "./SectionFocusContext";
import {
  useTimetableFilter,
  type TimetableFilterPayload,
} from "./TimetableFilterContext";
import { useTheme } from "./ThemeContext";
import { useLanguage } from "./LanguageContext";
import { usePopupMessage } from "./PopupMessageContext";
import { navigationRef, TabParamList } from "../navigation/navigationRef";
import { ScreenType } from "../constants";
import { diseaseAPI, carbonAPI } from "../utils/api";
import type { DiseaseDetection } from "../utils/api";

type UseChatReturn = ReturnType<typeof useChat>;

interface ChatContextValue extends UseChatReturn {
  showChat: boolean;
  setShowChat: (visible: boolean) => void;
  // AI butonu hedef spot: 0=sag (varsayilan), 1=sol (yalniz popup yaniti sirasinda).
  // Kullanici suruklemesi kaldirildi; konum yalnizca programatik.
  aiMoveTarget: number | null;
  setAiMoveTarget: (target: number | null) => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export const ChatProvider = ({ children }: { children: React.ReactNode }) => {
  const { handleLogout, dataSource } = useAuth();
  const { selectedFieldId, fields, selectField } = useDashboard();
  const { requestFocus } = useSectionFocus();
  const { requestFilters } = useTimetableFilter();
  const { setThemeMode } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const { showPopup } = usePopupMessage();
  const [showChat, setShowChat] = useState(false);
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

  // LLM'den gelen Cizelge filtre direktifi (set_timetable_filters) — TimetableFilterContext'e
  // nonce'lu istek olarak iletilir; sekme gecisi handleLLMNavigate("timetable") ile olur.
  const handleLLMSetFilters = useCallback(
    (payload: TimetableFilterPayload) => {
      requestFilters(payload);
    },
    [requestFilters],
  );

  // Buton ile onaylanan LLM eylemleri (select_field / set_theme / set_language /
  // add_carbon_log). Her biri ilgili context/API'yi cagirir + kisa popup ile bildirir.
  const handleLLMSelectField = useCallback(
    (fieldId: string) => {
      void selectField(fieldId);
      const name = fields.find((f) => f.id === fieldId)?.name;
      showPopup(name ? `${name} ${t.chat.actionFieldSelected}` : t.chat.actionFieldSelected);
    },
    [selectField, fields, showPopup, t],
  );

  const handleLLMSetTheme = useCallback(
    (mode: "light" | "dark" | "system") => {
      setThemeMode(mode);
      showPopup(t.chat.actionThemeApplied);
    },
    [setThemeMode, showPopup, t],
  );

  const handleLLMSetLanguage = useCallback(
    (lang: "tr" | "en") => {
      void setLanguage(lang);
      // Popup yeni dilde gozuksun diye t henuz eski dil — sade nötr mesaj
      showPopup(lang === "tr" ? "Dil Türkçe olarak ayarlandı" : "Language set to English");
    },
    [setLanguage, showPopup],
  );

  // add_carbon_log "Onayla" — mevcut createLog API'sini cagirir (backend tekrar dogrular).
  const handleLLMAddCarbonLog = useCallback(
    async (action: CarbonLogAction): Promise<boolean> => {
      const res = await carbonAPI.createLog(action.farmId, {
        activity_type_id: action.activityTypeId,
        activity_date: action.activityDate,
        activity_amount: action.activityAmount,
        ...(action.notes ? { notes: action.notes } : {}),
      });
      showPopup(res.success ? t.chat.actionLogSaved : t.chat.actionLogFailed);
      return res.success;
    },
    [showPopup, t],
  );

  const actionHandlers = useMemo<ChatActionHandlers>(
    () => ({
      onSelectField: handleLLMSelectField,
      onSetTheme: handleLLMSetTheme,
      onSetLanguage: handleLLMSetLanguage,
      onAddCarbonLog: handleLLMAddCarbonLog,
    }),
    [handleLLMSelectField, handleLLMSetTheme, handleLLMSetLanguage, handleLLMAddCarbonLog],
  );

  const chat = useChat(
    handleLLMNavigate,
    selectedFieldId,
    demoOptions,
    handleLLMSetFilters,
    actionHandlers,
  );

  // Popup yaniti varken AI butonu SOLA (spot 1) gecsin ki balonu kapatmasin; balon
  // kapanip pendingBubble temizlenince tekrar SAGA (spot 0, varsayilan) donsun.
  useEffect(() => {
    if (chat.pendingBubble) {
      setShowChat(false);
      setAiMoveTarget(1);
    } else {
      setAiMoveTarget(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.pendingBubble]);

  const value = useMemo<ChatContextValue>(
    () => ({
      ...chat,
      showChat,
      setShowChat,
      aiMoveTarget,
      setAiMoveTarget,
    }),
    [chat, showChat, aiMoveTarget],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};

export const useChatContext = (): ChatContextValue => {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChatContext must be used inside ChatProvider");
  return ctx;
};
