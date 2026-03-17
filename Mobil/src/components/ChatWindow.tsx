// Sohbet penceresi - AI asistan ile mesajlasma
// Props: visible, messages, chatInput, chatHeight, keyboardHeight, theme, onClose, onSendMessage, onInputChange
import { useRef, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Pressable,
  StyleSheet,
  Animated,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ChatMessage, Theme } from "../types";
import { useKeyboard } from "../hooks/useKeyboard";
import { appStyles } from "../styles";
import { useLanguage } from "../context/LanguageContext";

interface ChatWindowProps {
  visible: boolean;
  messages: ChatMessage[];
  chatInput: string;
  chatHeight: number;
  keyboardHeight: number;
  theme: Theme;
  onClose: () => void;
  onSendMessage: () => void;
  onInputChange: (text: string) => void;
}

export const ChatWindow = ({
  visible,
  messages,
  chatInput,
  chatHeight,
  keyboardHeight,
  theme,
  onClose,
  onSendMessage,
  onInputChange,
}: ChatWindowProps) => {
  const { t } = useLanguage();
  const scrollViewRef = useRef<ScrollView>(null);
  const chatInputRef = useRef<TextInput>(null);
  const { animatedPadding } = useKeyboard();
  const [isInputFocused, setIsInputFocused] = useState(false);

  const handleFocus = () => {
    setIsInputFocused(true);
    setTimeout(
      () => scrollViewRef.current?.scrollToEnd({ animated: true }),
      80,
    );
  };

  const handleBlur = () => {
    setIsInputFocused(false);
    setTimeout(
      () => scrollViewRef.current?.scrollToEnd({ animated: true }),
      80,
    );
  };

  const handleSendPress = () => {
    chatInputRef.current?.blur();
    setTimeout(() => onSendMessage(), 120);
  };

  const handleClose = () => {
    chatInputRef.current?.blur();
    setTimeout(() => onClose(), 120);
  };

  const animatedPaddingBottom = animatedPadding.interpolate({
    inputRange: [0, 1],
    outputRange: [24, keyboardHeight || 24],
  });

  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  if (!visible) return null;

  const isUserMessage = (sender: string) => sender === "user";

  return (
    <View style={styles.chatOverlay}>
      <Pressable style={styles.chatBackdrop} onPress={handleClose} />
      <Animated.View
        style={[styles.chatContainer, { paddingBottom: animatedPaddingBottom }]}
      >
        <View
          style={[
            styles.chatWindow,
            { backgroundColor: theme.surface, height: chatHeight },
          ]}
        >
          {/* Header */}
          <View style={[styles.chatHeader, { backgroundColor: theme.accent }]}>
            <View style={styles.chatHeaderLeft}>
              <MaterialCommunityIcons name="robot" size={24} color="#fff" />
              <Text style={styles.chatHeaderTitle}>{t.chat.title}</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialCommunityIcons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Mesajlar */}
          <ScrollView
            ref={scrollViewRef}
            style={[
              styles.messagesScroll,
              { backgroundColor: theme.background },
            ]}
            contentContainerStyle={styles.messagesContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {messages.map((message) => (
              <View
                key={message.id}
                style={[
                  styles.messageRow,
                  isUserMessage(message.sender) && styles.messageRowUser,
                ]}
              >
                {!isUserMessage(message.sender) && (
                  <View
                    style={[
                      styles.avatarContainer,
                      { backgroundColor: theme.accent + "20" },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="robot"
                      size={16}
                      color={theme.accent}
                    />
                  </View>
                )}
                <View
                  style={[
                    styles.messageBubble,
                    isUserMessage(message.sender)
                      ? { backgroundColor: theme.accent }
                      : {
                          backgroundColor: theme.surface,
                          borderWidth: 1,
                          borderColor: theme.accent + "40",
                        },
                  ]}
                >
                  <Text
                    style={[
                      styles.messageText,
                      {
                        color: isUserMessage(message.sender)
                          ? "#fff"
                          : theme.text,
                      },
                    ]}
                  >
                    {message.text}
                  </Text>
                </View>
                {isUserMessage(message.sender) && (
                  <View
                    style={[
                      styles.avatarContainer,
                      { backgroundColor: theme.accent },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="account"
                      size={16}
                      color="#fff"
                    />
                  </View>
                )}
              </View>
            ))}
          </ScrollView>

          {/* Input alani */}
          <View
            style={[
              styles.chatInputArea,
              {
                backgroundColor: theme.surface,
                borderTopColor: theme.accent + "20",
              },
            ]}
          >
            <View style={styles.inputRow}>
              <TextInput
                ref={chatInputRef}
                style={[
                  appStyles.loginInput,
                  {
                    backgroundColor: theme.surface,
                    color: theme.text,
                    borderColor: isInputFocused
                      ? theme.accent
                      : theme.accentDim,
                    flex: 1,
                    marginBottom: 0,
                    marginRight: 8,
                  },
                ]}
                placeholder={t.chat.placeholder}
                placeholderTextColor={theme.textSecondary}
                value={chatInput}
                onChangeText={onInputChange}
                onSubmitEditing={handleSendPress}
                onFocus={handleFocus}
                onBlur={handleBlur}
                returnKeyType="send"
                blurOnSubmit={false}
                multiline
                maxLength={500}
              />
              <TouchableOpacity
                style={[
                  styles.sendButton,
                  {
                    backgroundColor: chatInput.trim()
                      ? theme.accent
                      : theme.surface,
                    borderColor: chatInput.trim()
                      ? "transparent"
                      : theme.accent + "30",
                    borderWidth: chatInput.trim() ? 0 : 1,
                  },
                ]}
                onPress={handleSendPress}
                disabled={!chatInput.trim()}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name="send"
                  size={18}
                  color={chatInput.trim() ? "#fff" : theme.accent}
                />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  chatOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
  chatBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  chatContainer: { flex: 1, justifyContent: "flex-end", padding: 12 },
  chatWindow: {
    borderRadius: 20,
    overflow: "hidden",
    elevation: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  chatHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  chatHeaderTitle: { fontSize: 17, fontWeight: "700", color: "#fff" },
  messagesScroll: { flex: 1 },
  messagesContent: { padding: 16, gap: 12 },
  messageRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  messageRowUser: { flexDirection: "row-reverse" },
  avatarContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  messageBubble: {
    maxWidth: "75%",
    flexShrink: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  messageText: { fontSize: 15, lineHeight: 20, flexWrap: "wrap" },
  chatInputArea: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  inputRow: { flexDirection: "row", alignItems: "center", width: "100%" },
  sendButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
});
