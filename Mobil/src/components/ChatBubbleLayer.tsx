// ChatBubble'i ChatContext ile sarmaliyor — pending bubble gozukunce acilan chat toast
import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChatBubble } from "./ChatBubble";
import { useTheme } from "../context/ThemeContext";
import { useChatContext } from "../context/ChatContext";
import { s, vs } from "../utils/responsive";

export const ChatBubbleLayer = () => {
  const { theme } = useTheme();
  const { pendingBubble, clearPendingBubble, setShowChat } = useChatContext();
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const navBottom = insets.bottom > 20 ? 8 : Math.max(insets.bottom + 4, 8);
  const aiSize = s(54);
  const aiBottomOffset = navBottom + vs(60) + vs(12);
  const navBarY = windowHeight - insets.top - aiBottomOffset - aiSize;

  return (
    <ChatBubble
      message={pendingBubble?.text ?? ""}
      visible={!!pendingBubble}
      theme={theme}
      bottom={windowHeight - insets.top - navBarY + s(8)}
      onPress={() => {
        clearPendingBubble();
        setShowChat(true);
      }}
      onDismiss={clearPendingBubble}
    />
  );
};
