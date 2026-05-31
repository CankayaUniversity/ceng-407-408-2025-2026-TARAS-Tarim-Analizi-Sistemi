// ChatBubble'i ChatContext ile sarmaliyor — pending bubble gozukunce acilan chat toast.
// Balon, AI buton'dan (DraggableAIButtonLayer) cikiyormus gibi onun hemen ustune oturur,
// bu yuzden konum AI buton'un formuluyle BIREBIR ayni hesaplanir (kamera butonu ayri bir
// mekanizma — tab-bar pop-out — kullaniyor, dikey hizalama icin AI buton dogru referans):
//   navBottom = insets.bottom>20 ? 8 : max(insets.bottom+4, 8)
//   aiBottomOffset = navBottom + vs(60) - vs(10)   (DraggableAIButtonLayer ile ayni navBarClip)
//   buton ust kenari (ekran dibinden) = aiBottomOffset + AI_SIZE
//   balon alt kenari = buton ust kenari + kucuk bosluk
import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChatBubble } from "./ChatBubble";
import { useTheme } from "../context/ThemeContext";
import { useChatContext } from "../context/ChatContext";
import { useSectionFocus } from "../context/SectionFocusContext";
import { s, vs } from "../utils/responsive";

// DraggableAIButtonLayer ile AYNI sabitler (degisirse iki dosyada da degismeli)
const AI_SIZE = s(54);
const AI_NAV_CLIP = vs(10);
const AI_MARGIN = s(16); // sol popup spot x'i

export const ChatBubbleLayer = () => {
  const { theme } = useTheme();
  const { pendingBubble, clearPendingBubble, setShowChat } = useChatContext();
  const { clearFocus } = useSectionFocus();
  const insets = useSafeAreaInsets();
  useWindowDimensions(); // re-render on rotation/resize

  // DraggableAIButtonLayer ile birebir ayni hesap — AI buton'un alt kenari (ekran dibinden)
  const navBottom = insets.bottom > 20 ? 8 : Math.max(insets.bottom + 4, 8);
  const aiBottomOffset = navBottom + vs(60) - AI_NAV_CLIP;

  return (
    <ChatBubble
      message={pendingBubble?.text ?? ""}
      visible={!!pendingBubble}
      theme={theme}
      // Balon, AI buton'un hemen ustunde: buton alt kenari + buton capi + kucuk bosluk
      bottom={aiBottomOffset + AI_SIZE + s(6)}
      left={AI_MARGIN}
      onPress={() => {
        // Balona dokununca: vurguyu temizle ve tam sohbeti ac
        clearPendingBubble();
        clearFocus();
        setShowChat(true);
      }}
      onDismiss={() => {
        // Balon kapaninca (10 sn doldu ya da el ile): vurguyu da kapat
        clearPendingBubble();
        clearFocus();
      }}
    />
  );
};
