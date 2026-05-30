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
  ActivityIndicator,
} from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Markdown from "@ronradtke/react-native-markdown-display";
import { ChatMessage, ChatMessageAction, Theme } from "../types";
import { ChatSessionSummary } from "../hooks/useChat";
import { useKeyboard } from "../hooks/useKeyboard";
import { useLanguage } from "../context/LanguageContext";
import { useConfirm } from "../context/ConfirmContext";
import { usePopupMessage } from "../context/PopupMessageContext";
import { s, vs, ms } from "../utils/responsive";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface ChatWindowProps {
  messages: ChatMessage[];
  chatInput: string;
  theme: Theme;
  isLoading?: boolean;
  // Header + kapat/gecmis/yeni-sohbet kontrolleri FullScreenModal'a tasindi.
  // Bu bilesen yalnizca govdeyi (mesajlar/giris ya da gecmis paneli) cizer.
  showHistory: boolean;
  onSendMessage: () => void;
  onInputChange: (text: string) => void;
  // Gecmis
  historySessions: ChatSessionSummary[];
  isLoadingHistory: boolean;
  onSelectSession: (sessionId: string) => void;
  /** Bir gecmis oturumu sil — onay sonrasi cagrilir. Verilmezse silme butonu cizilmez. */
  onDeleteSession?: (sessionId: string) => Promise<boolean>;
  /** Mesaj-alti aksiyon butonu tap'i — LLM tool-call eylemini calistirir. */
  onRunAction?: (
    messageId: string,
    action: ChatMessageAction,
    choice?: "accept" | "cancel",
  ) => void;
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

// Tek bir aksiyon icin buton metni + ikon. add_carbon_log haric hepsi tek buton;
// add_carbon_log Onayla/İptal cifti olarak ayri ele alinir (asagida).
const actionLabel = (
  action: ChatMessageAction,
  t: ReturnType<typeof useLanguage>["t"],
): string => {
  switch (action.kind) {
    case "navigate":
    case "set_filters":
    case "select_field":
      return t.chat.actionGo;
    case "set_theme":
    case "set_language":
      return t.chat.actionApply;
    case "add_carbon_log":
      return t.chat.actionAccept;
  }
};

const actionIcon = (action: ChatMessageAction): string => {
  switch (action.kind) {
    case "navigate":
    case "set_filters":
      return "arrow-right-circle-outline";
    case "select_field":
      return "swap-horizontal";
    case "set_theme":
      return "theme-light-dark";
    case "set_language":
      return "translate";
    case "add_carbon_log":
      return "check";
  }
};

// Mesaj govdesinin altinda cizilen aksiyon butonlari. consumed=true ise butonlar
// yerine sadece "Tamamlandı" rozeti gosterilir (tekrar tetiklemeyi onler).
interface MessageActionsProps {
  theme: Theme;
  actions: ChatMessageAction[];
  consumed: boolean;
  onRun: (action: ChatMessageAction, choice?: "accept" | "cancel") => void;
}

const MessageActions = ({ theme, actions, consumed, onRun }: MessageActionsProps) => {
  const { t } = useLanguage();

  if (consumed) {
    return (
      <View className="flex-row" style={{ marginTop: vs(6), marginLeft: s(2) }}>
        <View
          className="flex-row items-center"
          style={{
            paddingHorizontal: s(10),
            paddingVertical: vs(5),
            borderRadius: s(10),
            backgroundColor: theme.primary + "12",
          }}
        >
          <MaterialCommunityIcons name="check-circle" size={ms(13, 0.3)} color={theme.primary} />
          <Text style={{ marginLeft: s(5), fontSize: ms(12, 0.3), color: theme.primary, fontWeight: "600" }}>
            {t.chat.actionDone}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View
      className="flex-row flex-wrap"
      style={{ marginTop: vs(6), marginLeft: s(2), gap: s(8) }}
    >
      {actions.map((action, idx) => {
        if (action.kind === "add_carbon_log") {
          // Onayla (dolu) + İptal (cizgili) cifti — tahmin metniyle
          return (
            <View key={idx} style={{ width: "100%", gap: vs(6) }}>
              <Text style={{ fontSize: ms(11.5, 0.3), color: theme.textSecondary, marginLeft: s(2) }}>
                {action.activityAmount} {action.unit} · ≈{action.estimatedEmission} kg CO₂
              </Text>
              <View className="flex-row" style={{ gap: s(8) }}>
                <TouchableOpacity
                  onPress={() => onRun(action, "accept")}
                  activeOpacity={0.85}
                  className="flex-row items-center"
                  style={{
                    paddingHorizontal: s(14),
                    paddingVertical: vs(7),
                    borderRadius: s(10),
                    backgroundColor: theme.primary,
                  }}
                >
                  <MaterialCommunityIcons name="check" size={ms(15, 0.3)} color={theme.textOnPrimary} />
                  <Text style={{ marginLeft: s(5), fontSize: ms(13, 0.3), color: theme.textOnPrimary, fontWeight: "700" }}>
                    {t.chat.actionAccept}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => onRun(action, "cancel")}
                  activeOpacity={0.85}
                  className="flex-row items-center"
                  style={{
                    paddingHorizontal: s(14),
                    paddingVertical: vs(7),
                    borderRadius: s(10),
                    borderWidth: 1,
                    borderColor: theme.primary + "40",
                  }}
                >
                  <Text style={{ fontSize: ms(13, 0.3), color: theme.textMain, fontWeight: "600" }}>
                    {t.chat.actionCancel}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }
        // Tek butonlu eylemler (Git / Uygula)
        return (
          <TouchableOpacity
            key={idx}
            onPress={() => onRun(action)}
            activeOpacity={0.85}
            className="flex-row items-center"
            style={{
              paddingHorizontal: s(14),
              paddingVertical: vs(7),
              borderRadius: s(10),
              backgroundColor: theme.primary,
            }}
          >
            <MaterialCommunityIcons name={actionIcon(action) as any} size={ms(15, 0.3)} color={theme.textOnPrimary} />
            <Text style={{ marginLeft: s(5), fontSize: ms(13, 0.3), color: theme.textOnPrimary, fontWeight: "700" }}>
              {actionLabel(action, t)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

export const ChatWindow = ({
  messages,
  chatInput,
  theme,
  isLoading,
  showHistory,
  onSendMessage,
  onInputChange,
  historySessions,
  isLoadingHistory,
  onSelectSession,
  onDeleteSession,
  onRunAction,
}: ChatWindowProps) => {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const confirm = useConfirm();
  const { showPopup } = usePopupMessage();
  const { keyboardHeight } = useKeyboard();
  const scrollViewRef = useRef<ScrollView>(null);
  const chatInputRef = useRef<TextInput>(null);
  const [isInputFocused, setIsInputFocused] = useState(false);

  const scrollToEnd = () =>
    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 60);

  const handleSendPress = () => {
    chatInputRef.current?.blur();
    setTimeout(() => onSendMessage(), 80);
  };

  const handleSelectSession = (sid: string) => {
    onSelectSession(sid);
  };

  // Gecmis listesindeki bir oturumu sil — once onay sorulur, sonra parent'a cagri.
  // Sonucu kisa bir popup ile bildiririz; basariliysa useChat zaten yerel listeyi gunceller.
  const handleDeleteSession = async (sid: string) => {
    if (!onDeleteSession) return;
    const ok = await confirm({
      title: t.chat.deleteConfirmTitle,
      message: t.chat.deleteConfirmMessage,
      confirmLabel: t.chat.deleteConfirmButton,
      cancelLabel: t.common.cancel,
      destructive: true,
    });
    if (!ok) return;
    const success = await onDeleteSession(sid);
    showPopup(success ? t.chat.deletedMsg : t.chat.deleteFailedMsg);
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
  // react-native-keyboard-controller'in native modulu APK'da degil (Metro JS-only refresh
  // native side'i eklemiyor); native rebuild gerekiyor. O zamana kadar manuel useKeyboard +
  // insets ile padding hesapliyoruz: Android'de keyboardHeight altinda gesture-nav handle
  // alani ayri kalir → +insets.bottom telafisi. vs(6) nefes payi klavye tepesinden ayirir.
  // iOS'da Keyboard.endCoordinates.height home-indicator alanini icerdigi icin telafi yok.
  // Native rebuild sonrasi library KAV'a tekrar gecilebilir (KeyboardProvider zaten App.tsx'te).
  const extraNavInset = Platform.OS === "android" ? insets.bottom : 0;
  const bottomPadding = keyboardHeight > 0
    ? keyboardHeight + extraNavInset + vs(6)
    : insets.bottom + vs(8);

  return (
    <View className="flex-1" style={{ backgroundColor: theme.background }}>
      {showHistory ? (
        /* Gecmis panel */
        <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: s(14) }}>
          {isLoadingHistory ? (
            <ActivityIndicator style={{ marginTop: vs(40) }} color={theme.primary} />
          ) : historySessions.length === 0 ? (
            <Text
              className="text-center"
              style={{ marginTop: vs(40), fontSize: ms(14, 0.3), color: theme.textSecondary }}
            >
              {t.chat.historyEmpty}
            </Text>
          ) : (
            historySessions.map((session) => (
              <View
                key={session.session_id}
                className="flex-row items-center border-b"
                style={{ borderBottomColor: theme.primary + "10" }}
              >
                <TouchableOpacity
                  className="flex-1"
                  style={{ paddingVertical: vs(12) }}
                  onPress={() => handleSelectSession(session.session_id)}
                  activeOpacity={0.7}
                >
                  <View className="flex-row justify-between items-center" style={{ marginBottom: vs(4) }}>
                    <Text
                      className="font-semibold flex-1"
                      style={{ fontSize: ms(14, 0.3), color: theme.textMain }}
                      numberOfLines={1}
                    >
                      {session.field_name}
                    </Text>
                    <Text style={{ fontSize: ms(11, 0.3), marginLeft: s(8), color: theme.textSecondary }}>
                      {formatSessionTime(session.last_message_at || session.started_at)}
                    </Text>
                  </View>
                  <Text
                    style={{ fontSize: ms(13, 0.3), lineHeight: ms(18, 0.3), color: theme.textSecondary }}
                    numberOfLines={2}
                  >
                    {session.last_message || "\u2014"}
                  </Text>
                </TouchableOpacity>
                {onDeleteSession && (
                  <TouchableOpacity
                    onPress={() => handleDeleteSession(session.session_id)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={{ paddingLeft: s(12), paddingVertical: vs(12) }}
                  >
                    <MaterialCommunityIcons name="trash-can-outline" size={20} color={theme.danger} />
                  </TouchableOpacity>
                )}
              </View>
            ))
          )}
        </ScrollView>
      ) : (
        <>
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
              const hasActions =
                !isUser && !!msg.actions && msg.actions.length > 0;
              return (
                <View key={msg.id} style={{ width: "100%" }}>
                  <View className={`flex-row ${isUser ? "justify-end" : "justify-start"}`}>
                    <View
                      className="rounded-[14px]"
                      style={[
                        {
                          maxWidth: "82%",
                          paddingHorizontal: s(12),
                          paddingVertical: vs(5),
                        },
                        isUser
                          ? { backgroundColor: theme.primary, borderBottomRightRadius: 4 }
                          : { backgroundColor: theme.surface, borderColor: theme.primary + "12", borderWidth: 1, borderBottomLeftRadius: 4 },
                      ]}
                    >
                      {isUser ? (
                        <Text style={{ fontSize: ms(14, 0.3), lineHeight: ms(19, 0.3), color: theme.textOnPrimary }}>{msg.text}</Text>
                      ) : (
                        <Markdown style={{
                          body: { color: theme.textMain, fontSize: ms(14, 0.3), lineHeight: ms(19, 0.3) },
                          strong: { fontWeight: "700", color: theme.textMain },
                          bullet_list: { marginVertical: vs(4) },
                          ordered_list: { marginVertical: vs(4) },
                          list_item: { marginVertical: vs(1) },
                          paragraph: { marginVertical: 0 },
                          heading1: { fontSize: ms(18, 0.3), fontWeight: "700", color: theme.textMain, marginVertical: vs(4) },
                          heading2: { fontSize: ms(16, 0.3), fontWeight: "700", color: theme.textMain, marginVertical: vs(3) },
                          heading3: { fontSize: ms(15, 0.3), fontWeight: "600", color: theme.textMain, marginVertical: vs(2) },
                          code_inline: { backgroundColor: theme.primary + "15", paddingHorizontal: s(4), borderRadius: 4, fontSize: ms(13, 0.3) },
                          fence: { backgroundColor: theme.primary + "10", padding: s(8), borderRadius: 8, fontSize: ms(12, 0.3) },
                        }}>
                          {msg.text}
                        </Markdown>
                      )}
                    </View>
                  </View>

                  {/* Mesaj-alti aksiyon butonlari — LLM tool-call'lari icin */}
                  {hasActions && (
                    <MessageActions
                      theme={theme}
                      actions={msg.actions!}
                      consumed={!!msg.actionsConsumed}
                      onRun={(action, choice) =>
                        onRunAction?.(msg.id, action, choice)
                      }
                    />
                  )}
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
              borderTopColor: theme.primary + "10",
            }}
          >
            <View
              className="flex-row items-end rounded-[22px] border"
              style={{
                paddingLeft: s(14),
                paddingRight: s(4),
                paddingVertical: vs(4),
                backgroundColor: theme.surface,
                borderColor: isInputFocused ? theme.primary + "60" : theme.primary + "20",
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
                  color: theme.textMain,
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
                  borderRadius: 10,
                  backgroundColor: hasInput ? theme.primary : "transparent",
                  marginBottom: 1,
                }}
                onPress={handleSendPress}
                disabled={!hasInput || isLoading}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name="arrow-up"
                  size={ms(16, 0.3)}
                  color={hasInput ? theme.textOnPrimary : theme.primary + "40"}
                />
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}
    </View>
  );
};
