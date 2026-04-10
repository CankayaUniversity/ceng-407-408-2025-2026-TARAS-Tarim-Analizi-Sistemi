// Tam ekran sohbet penceresi — LLM asistan arayuzu + gecmis panel
import { useRef, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Keyboard,
  Platform,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ChatMessage, Theme } from "../types";
import { ChatSessionSummary } from "../hooks/useChat";
import { useKeyboard } from "../hooks/useKeyboard";
import { useLanguage } from "../context/LanguageContext";
import { s, vs, ms } from "../utils/responsive";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface ChatWindowProps {
  messages: ChatMessage[];
  chatInput: string;
  theme: Theme;
  isLoading?: boolean;
  onClose: () => void;
  onSendMessage: () => void;
  onInputChange: (text: string) => void;
  onNewChat?: () => void;
  // Gecmis
  historySessions: ChatSessionSummary[];
  isLoadingHistory: boolean;
  onLoadHistory: () => void;
  onSelectSession: (sessionId: string) => void;
}

// Zaman formatlama — "2 dk once", "Dun", "3 Nis"
const formatSessionTime = (iso: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  const now = Date.now();
  const diffMin = Math.floor((now - d.getTime()) / 60000);
  if (diffMin < 1) return "Az önce";
  if (diffMin < 60) return `${diffMin} dk`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)} sa`;
  if (diffMin < 2880) return "Dün";
  return `${d.getDate()} ${["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"][d.getMonth()]}`;
};

export const ChatWindow = ({
  messages,
  chatInput,
  theme,
  isLoading,
  onClose,
  onSendMessage,
  onInputChange,
  onNewChat,
  historySessions,
  isLoadingHistory,
  onLoadHistory,
  onSelectSession,
}: ChatWindowProps) => {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<ScrollView>(null);
  const chatInputRef = useRef<TextInput>(null);
  const { keyboardHeight } = useKeyboard();
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const scrollToEnd = () =>
    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 60);

  const handleSendPress = () => {
    chatInputRef.current?.blur();
    setTimeout(() => onSendMessage(), 80);
  };

  const handleHistoryToggle = () => {
    if (!showHistory) onLoadHistory();
    setShowHistory(!showHistory);
  };

  const handleSelectSession = (sid: string) => {
    setShowHistory(false);
    onSelectSession(sid);
  };

  // Android: OS klavye kapatma butonu TextInput'u blur etmez
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = Keyboard.addListener("keyboardDidHide", () => {
      chatInputRef.current?.blur();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    scrollToEnd();
  }, [messages]);

  const hasInput = chatInput.trim().length > 0;
  const bottomPadding = keyboardHeight > 0 ? keyboardHeight : insets.bottom + vs(8);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + vs(8), borderBottomColor: theme.accent + "15" }]}>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialCommunityIcons name="chevron-down" size={ms(24, 0.3)} color={theme.textSecondary} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <View style={[styles.headerDot, { backgroundColor: theme.accent }]} />
          <Text style={[styles.headerTitle, { color: theme.textSecondary }]}>
            {showHistory ? t.chat.history : t.chat.title}
          </Text>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={handleHistoryToggle}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ opacity: 0.7 }}
          >
            <MaterialCommunityIcons
              name={showHistory ? "chat" : "history"}
              size={ms(18, 0.3)}
              color={theme.textSecondary}
            />
          </TouchableOpacity>
          {!showHistory && onNewChat && (
            <TouchableOpacity
              onPress={onNewChat}
              disabled={isLoading}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ opacity: isLoading ? 0.3 : 0.7, marginLeft: s(12) }}
            >
              <MaterialCommunityIcons name="refresh" size={ms(18, 0.3)} color={theme.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {showHistory ? (
        /* Gecmis panel */
        <ScrollView style={styles.historyList} contentContainerStyle={styles.historyContent}>
          {isLoadingHistory ? (
            <ActivityIndicator style={{ marginTop: vs(40) }} color={theme.accent} />
          ) : historySessions.length === 0 ? (
            <Text style={[styles.historyEmpty, { color: theme.textSecondary }]}>
              {t.chat.historyEmpty}
            </Text>
          ) : (
            historySessions.map((session) => (
              <TouchableOpacity
                key={session.session_id}
                style={[styles.historyItem, { borderBottomColor: theme.accent + "10" }]}
                onPress={() => handleSelectSession(session.session_id)}
                activeOpacity={0.7}
              >
                <View style={styles.historyItemTop}>
                  <Text
                    style={[styles.historyField, { color: theme.text }]}
                    numberOfLines={1}
                  >
                    {session.field_name}
                  </Text>
                  <Text style={[styles.historyTime, { color: theme.textSecondary }]}>
                    {formatSessionTime(session.last_message_at || session.started_at)}
                  </Text>
                </View>
                <Text
                  style={[styles.historyPreview, { color: theme.textSecondary }]}
                  numberOfLines={2}
                >
                  {session.last_message || "—"}
                </Text>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      ) : (
        <>
          {/* Mesajlar */}
          <ScrollView
            ref={scrollViewRef}
            style={styles.messages}
            contentContainerStyle={styles.messagesContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {messages.map((msg) => {
              const isUser = msg.sender === "user";
              return (
                <View key={msg.id} style={[styles.msgRow, isUser && styles.msgRowUser]}>
                  <View
                    style={[
                      styles.bubble,
                      isUser ? styles.bubbleUser : styles.bubbleAssistant,
                      isUser
                        ? { backgroundColor: theme.accent }
                        : { backgroundColor: theme.surface, borderColor: theme.accent + "12", borderWidth: 1 },
                    ]}
                  >
                    <Text style={[styles.msgText, { color: isUser ? "#fff" : theme.text }]}>
                      {msg.text}
                    </Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>

          {/* Input */}
          <View style={[styles.inputWrap, { paddingBottom: bottomPadding, borderTopColor: theme.accent + "10" }]}>
            <View
              style={[
                styles.inputPill,
                {
                  backgroundColor: theme.surface,
                  borderColor: isInputFocused ? theme.accent + "60" : theme.accent + "20",
                },
              ]}
            >
              <TextInput
                ref={chatInputRef}
                style={[styles.input, { color: theme.text }]}
                placeholder={t.chat.placeholder}
                placeholderTextColor={theme.textSecondary + "80"}
                value={chatInput}
                onChangeText={onInputChange}
                onSubmitEditing={handleSendPress}
                onFocus={() => { setIsInputFocused(true); scrollToEnd(); }}
                onBlur={() => setIsInputFocused(false)}
                returnKeyType="send"
                blurOnSubmit={false}
                multiline
                maxLength={500}
              />
              <TouchableOpacity
                style={[styles.sendBtn, { backgroundColor: hasInput ? theme.accent : "transparent" }]}
                onPress={handleSendPress}
                disabled={!hasInput || isLoading}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name="arrow-up"
                  size={ms(16, 0.3)}
                  color={hasInput ? "#fff" : theme.accent + "40"}
                />
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: s(14),
    paddingBottom: vs(10),
    borderBottomWidth: 1,
  },
  headerCenter: {
    flexDirection: "row",
    alignItems: "center",
    gap: s(6),
  },
  headerDot: { width: s(6), height: s(6), borderRadius: 3 },
  headerTitle: {
    fontSize: ms(12, 0.3),
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  // Mesajlar
  messages: { flex: 1 },
  messagesContent: {
    paddingHorizontal: s(12),
    paddingVertical: vs(10),
    gap: vs(6),
  },
  msgRow: { flexDirection: "row", justifyContent: "flex-start" },
  msgRowUser: { justifyContent: "flex-end" },
  bubble: {
    maxWidth: "82%",
    paddingHorizontal: s(12),
    paddingVertical: vs(8),
    borderRadius: 14,
  },
  bubbleAssistant: { borderBottomLeftRadius: 4 },
  bubbleUser: { borderBottomRightRadius: 4 },
  msgText: { fontSize: ms(14, 0.3), lineHeight: ms(19, 0.3) },
  // Input
  inputWrap: {
    paddingHorizontal: s(10),
    paddingTop: vs(8),
    borderTopWidth: 1,
  },
  inputPill: {
    flexDirection: "row",
    alignItems: "flex-end",
    borderRadius: 22,
    borderWidth: 1,
    paddingLeft: s(14),
    paddingRight: s(4),
    paddingVertical: vs(4),
  },
  input: {
    flex: 1,
    fontSize: ms(14, 0.3),
    lineHeight: ms(19, 0.3),
    maxHeight: vs(100),
    paddingVertical: vs(6),
  },
  sendBtn: {
    width: s(28),
    height: s(28),
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 1,
  },
  // Gecmis
  historyList: { flex: 1 },
  historyContent: { paddingHorizontal: s(14) },
  historyEmpty: {
    textAlign: "center",
    marginTop: vs(40),
    fontSize: ms(14, 0.3),
  },
  historyItem: {
    paddingVertical: vs(12),
    borderBottomWidth: 1,
  },
  historyItemTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: vs(4),
  },
  historyField: {
    fontSize: ms(14, 0.3),
    fontWeight: "600",
    flex: 1,
  },
  historyTime: {
    fontSize: ms(11, 0.3),
    marginLeft: s(8),
  },
  historyPreview: {
    fontSize: ms(13, 0.3),
    lineHeight: ms(18, 0.3),
  },
});
