// ChatWindow'u ChatContext ile sarmaliyor
// iOS: pageSheet Modal, Android: absolute positioned overlay
import { View, Modal, Platform } from "react-native";
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
    showChat,
    setShowChat,
  } = useChatContext();

  const chatWindow = (
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
  );

  if (Platform.OS === "ios") {
    return (
      <Modal
        visible={showChat}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowChat(false)}
      >
        <View style={{ flex: 1, backgroundColor: theme.background }}>
          {chatWindow}
        </View>
      </Modal>
    );
  }

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
      {chatWindow}
    </View>
  );
};
