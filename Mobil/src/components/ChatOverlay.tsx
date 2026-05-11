// ChatWindow'u ChatContext ile sarmaliyor — absolute positioned overlay
import { View } from "react-native";
import { ChatWindow } from "./ChatWindow";
import { useTheme } from "../context/ThemeContext";
import { useChatContext } from "../context/ChatContext";

export const ChatOverlay = () => {
  const { theme } = useTheme();
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
    setShowChat,
  } = useChatContext();

  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      }}
    >
      <ChatWindow
        messages={messages}
        chatInput={chatInput}
        theme={theme}
        isLoading={chatLoading}
        onClose={() => setShowChat(false)}
        onSendMessage={sendMessage}
        onInputChange={setChatInput}
        onNewChat={startNewChat}
        historySessions={historySessions}
        isLoadingHistory={isLoadingHistory}
        onLoadHistory={loadHistory}
        onSelectSession={loadSessionById}
      />
    </View>
  );
};
