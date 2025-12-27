import { useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Pressable,
  StyleSheet,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ChatMessage, Theme } from '../types';

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
  const scrollViewRef = useRef<ScrollView>(null);
  const chatInputRef = useRef<TextInput>(null);

  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  if (!visible) return null;

  const isUserMessage = (sender: string) => sender === 'user';

  return (
    <View style={styles.chatOverlay}>
      <Pressable style={styles.chatBackdrop} onPress={onClose} />
      <View
        style={[styles.chatContainer, { paddingBottom: keyboardHeight }]}
      >
        <View
          style={[
            styles.chatWindow,
            { backgroundColor: theme.surface, height: chatHeight },
          ]}
        >
          <View style={[styles.chatHeader, { backgroundColor: theme.accent }]}>
            <View style={styles.chatHeaderLeft}>
              <MaterialCommunityIcons name="robot" size={24} color="#fff" />
              <Text style={styles.chatHeaderTitle}>TarasMobil Asistanı</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialCommunityIcons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          <ScrollView
            ref={scrollViewRef}
            style={[styles.messagesScroll, { backgroundColor: theme.background }]}
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
                      { backgroundColor: theme.accent + '20' },
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
                          borderColor: theme.accent + '40',
                        },
                  ]}
                >
                  <Text
                    style={[
                      styles.messageText,
                      { color: isUserMessage(message.sender) ? '#fff' : theme.text },
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
                    <MaterialCommunityIcons name="account" size={16} color="#fff" />
                  </View>
                )}
              </View>
            ))}
          </ScrollView>

          <View
            style={[
              styles.chatInputArea,
              { backgroundColor: theme.surface, borderTopColor: theme.accent + '20' },
            ]}
          >
            <TouchableOpacity
              activeOpacity={1}
              onPress={() => chatInputRef.current?.focus()}
              style={[
                styles.inputWrapper,
                {
                  backgroundColor: theme.background,
                  borderColor: theme.accent + '30',
                },
              ]}
            >
              <TextInput
                ref={chatInputRef}
                style={[styles.chatInput, { color: theme.text }]}
                placeholder="Mesajınızı yazın..."
                placeholderTextColor={theme.textSecondary}
                value={chatInput}
                onChangeText={onInputChange}
                onSubmitEditing={onSendMessage}
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
                      : theme.textSecondary + '40',
                  },
                ]}
                onPress={onSendMessage}
                disabled={!chatInput.trim()}
              >
                <MaterialCommunityIcons name="send" size={20} color="#fff" />
              </TouchableOpacity>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  chatOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
  chatBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  chatContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 12,
  },
  chatWindow: {
    borderRadius: 20,
    overflow: 'hidden',
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  chatHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  chatHeaderTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
  messagesScroll: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    gap: 12,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  messageRowUser: {
    flexDirection: 'row-reverse',
  },
  avatarContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageBubble: {
    maxWidth: '75%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  chatInputArea: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: 24,
    borderWidth: 1,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    gap: 8,
  },
  chatInput: {
    flex: 1,
    fontSize: 15,
    maxHeight: 100,
    paddingVertical: 6,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
