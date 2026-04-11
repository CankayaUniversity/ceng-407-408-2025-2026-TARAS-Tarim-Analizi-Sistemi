// Tam ekran sohbet penceresi — LLM asistan arayuzu
import { useRef, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Keyboard,
  Platform,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Markdown from "@ronradtke/react-native-markdown-display";
import { ChatMessage, Theme } from "../types";
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
}

export const ChatWindow = ({
  messages,
  chatInput,
  theme,
  isLoading,
  onClose,
  onSendMessage,
  onInputChange,
  onNewChat,
}: ChatWindowProps) => {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<ScrollView>(null);
  const chatInputRef = useRef<TextInput>(null);
  const { keyboardHeight } = useKeyboard();
  const [isInputFocused, setIsInputFocused] = useState(false);

  const scrollToEnd = () =>
    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 60);

  const handleSendPress = () => {
    chatInputRef.current?.blur();
    setTimeout(() => onSendMessage(), 80);
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
    <View className="flex-1" style={{ backgroundColor: theme.background }}>
      {/* Header */}
      <View
        className="row-between border-b"
        style={{
          paddingHorizontal: s(14),
          paddingTop: insets.top + vs(8),
          paddingBottom: vs(10),
          borderBottomColor: theme.accent + "15",
        }}
      >
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialCommunityIcons name="chevron-down" size={ms(24, 0.3)} color={theme.textSecondary} />
        </TouchableOpacity>

        <View className="row" style={{ gap: s(6) }}>
          <View className="rounded-full bg-slateGrey-500" style={{ width: s(6), height: s(6) }} />
          <Text
            className="font-semibold uppercase tracking-wider"
            style={{ fontSize: ms(12, 0.3), color: theme.textSecondary }}
          >
            {t.chat.title}
          </Text>
        </View>

        {onNewChat && (
          <TouchableOpacity
            onPress={onNewChat}
            disabled={isLoading}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ opacity: isLoading ? 0.3 : 0.7 }}
          >
            <MaterialCommunityIcons name="refresh" size={ms(18, 0.3)} color={theme.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Mesajlar */}
      <ScrollView
        ref={scrollViewRef}
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: s(12),
          paddingVertical: vs(10),
          gap: vs(6),
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {messages.map((msg) => {
          const isUser = msg.sender === "user";
          return (
            <View key={msg.id} className={`flex-row ${isUser ? "justify-end" : "justify-start"}`}>
              <View
                className="rounded-[14px]"
                style={[
                  {
                    maxWidth: "82%",
                    paddingHorizontal: s(12),
                    paddingVertical: vs(8),
                  },
                  isUser
                    ? { backgroundColor: theme.accent, borderBottomRightRadius: 4 }
                    : { backgroundColor: theme.surface, borderColor: theme.accent + "12", borderWidth: 1, borderBottomLeftRadius: 4 },
                ]}
              >
                {isUser ? (
                  <Text className="text-white" style={{ fontSize: ms(14, 0.3), lineHeight: ms(19, 0.3) }}>{msg.text}</Text>
                ) : (
                  <Markdown style={{
                    body: { color: theme.text, fontSize: ms(14, 0.3), lineHeight: ms(19, 0.3) },
                    strong: { fontWeight: "700", color: theme.text },
                    bullet_list: { marginVertical: vs(4) },
                    ordered_list: { marginVertical: vs(4) },
                    list_item: { marginVertical: vs(1) },
                    paragraph: { marginVertical: vs(2) },
                    heading1: { fontSize: ms(18, 0.3), fontWeight: "700", color: theme.text, marginVertical: vs(4) },
                    heading2: { fontSize: ms(16, 0.3), fontWeight: "700", color: theme.text, marginVertical: vs(3) },
                    heading3: { fontSize: ms(15, 0.3), fontWeight: "600", color: theme.text, marginVertical: vs(2) },
                    code_inline: { backgroundColor: theme.accent + "15", paddingHorizontal: s(4), borderRadius: 4, fontSize: ms(13, 0.3) },
                    fence: { backgroundColor: theme.accent + "10", padding: s(8), borderRadius: 8, fontSize: ms(12, 0.3) },
                  }}>
                    {msg.text}
                  </Markdown>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Input */}
      <View
        className="border-t"
        style={{
          paddingHorizontal: s(10),
          paddingTop: vs(8),
          paddingBottom: bottomPadding,
          borderTopColor: theme.accent + "10",
        }}
      >
        <View
          className="flex-row items-end rounded-[22px] border"
          style={{
            paddingLeft: s(14),
            paddingRight: s(4),
            paddingVertical: vs(4),
            backgroundColor: theme.surface,
            borderColor: isInputFocused ? theme.accent + "60" : theme.accent + "20",
          }}
        >
          <TextInput
            ref={chatInputRef}
            className="flex-1"
            style={{
              fontSize: ms(14, 0.3),
              lineHeight: ms(19, 0.3),
              maxHeight: vs(100),
              paddingVertical: vs(6),
              color: theme.text,
            }}
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
            className="center"
            style={{
              width: s(28),
              height: s(28),
              borderRadius: 14,
              backgroundColor: hasInput ? theme.accent : "transparent",
              marginBottom: 1,
            }}
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
    </View>
  );
};
