// ChatWindow'u FullScreenModal icinde sunar — diger tam ekran ekranlarla
// (Bildirimler, Ayarlar alt ekranlari) ayni kabuk: inline baslik (kapat X ile ayni
// satirda) + sagdan kayan giris + X ile kapat. Android donanim/jest geri tusu
// Modal'in onRequestClose'u ile chat'i kapatir (eski absolute-View sunumunda
// geri tusu sekmelere dusuyordu).
// Yeni-sohbet (reset) ve gecmis butonlari header'in sag tarafinda — reset
// gecmisten once gelir ki en sik kullanilani kapat X'e en yakin olsun.
import { useEffect, useState } from "react";
import { TouchableOpacity } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { FullScreenModal } from "./FullScreenModal";
import { ChatWindow } from "./ChatWindow";
import { useTheme } from "../context/ThemeContext";
import { useLanguage } from "../context/LanguageContext";
import { useChatContext } from "../context/ChatContext";

const HIT = { top: 12, bottom: 12, left: 12, right: 12 };

export const ChatOverlay = () => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const {
    messages,
    chatInput,
    setChatInput,
    sendMessage,
    isLoading: chatLoading,
    startNewChat,
    historySessions,
    isLoadingHistory,
    loadHistory,
    loadSessionById,
    deleteSession,
    runMessageAction,
    showChat,
    setShowChat,
  } = useChatContext();

  const [showHistory, setShowHistory] = useState(false);

  const close = () => setShowChat(false);

  // Chat kapaninca gecmis gorunumunu sifirla — tekrar acildiginda sohbette baslar
  useEffect(() => {
    if (!showChat) setShowHistory(false);
  }, [showChat]);

  const toggleHistory = () => {
    if (!showHistory) loadHistory();
    setShowHistory(!showHistory);
  };

  const headerRight = (
    <>
      {!showHistory && (
        <TouchableOpacity
          onPress={startNewChat}
          disabled={chatLoading}
          activeOpacity={0.6}
          hitSlop={HIT}
          style={{ opacity: chatLoading ? 0.3 : 1 }}
        >
          <MaterialCommunityIcons name="plus" size={24} color={theme.textMain} />
        </TouchableOpacity>
      )}
      <TouchableOpacity onPress={toggleHistory} activeOpacity={0.6} hitSlop={HIT}>
        <MaterialCommunityIcons
          name={showHistory ? "chat" : "history"}
          size={24}
          color={theme.textMain}
        />
      </TouchableOpacity>
    </>
  );

  return (
    <FullScreenModal
      visible={showChat}
      theme={theme}
      variant="inline"
      title={showHistory ? t.chat.history : t.chat.title}
      headerRight={headerRight}
      onRequestClose={close}
      onClose={close}
    >
      <ChatWindow
        messages={messages}
        chatInput={chatInput}
        theme={theme}
        isLoading={chatLoading}
        showHistory={showHistory}
        onSendMessage={sendMessage}
        onInputChange={setChatInput}
        historySessions={historySessions}
        isLoadingHistory={isLoadingHistory}
        onSelectSession={(id) => {
          setShowHistory(false);
          loadSessionById(id);
        }}
        onDeleteSession={deleteSession}
        onRunAction={runMessageAction}
      />
    </FullScreenModal>
  );
};
