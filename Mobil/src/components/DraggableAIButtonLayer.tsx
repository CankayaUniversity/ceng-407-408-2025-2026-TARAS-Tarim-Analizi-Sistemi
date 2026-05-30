// DraggableAIButton'u ChatContext ile sarmaliyor — AI button ekran uzerinde yuzuyor
// Konteyner olculerini onLayout ile gercekten olcup nav bar'in hemen ustune
// hizaliyoruz. windowHeight + insets hesabi cihaz / edge-to-edge moduna gore
// sapiyordu (Expo Go'da buton nav bar'dan cok yukarida kaliyordu).
import { useMemo, useState } from "react";
import { View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DraggableAIButton } from "./DraggableAIButton";
import { useTheme } from "../context/ThemeContext";
import { useChatContext } from "../context/ChatContext";
import { useSectionFocus } from "../context/SectionFocusContext";
import { s, vs } from "../utils/responsive";

export const DraggableAIButtonLayer = () => {
  const { theme } = useTheme();
  const {
    clearPendingBubble,
    setShowChat,
    aiMoveTarget,
    setAiMoveTarget,
  } = useChatContext();
  const { clearFocus } = useSectionFocus();
  const insets = useSafeAreaInsets();
  // Konteynerin (absoluteFill) gercek olculeri — top:0 bu view'in tepesidir.
  const [box, setBox] = useState({ width: 0, height: 0 });

  // navBottom AppTabBar ile ayni — bar'in alttan margin'i
  const navBottom = insets.bottom > 20 ? 8 : Math.max(insets.bottom + 4, 8);
  const aiSize = s(54);
  // Alttan: bar margin + bar yuksekligi - kesisme. Konteyner dibinden olculur.
  // vs(10) cikararak buton nav bar'in ust kenarini hafifce kesiyor (clip).
  const navBarClip = vs(10);
  const aiBottomOffset = navBottom + vs(60) - navBarClip;
  const navBarY = box.height - aiBottomOffset - aiSize;

  const aiSafeSpots = useMemo(
    () => [
      { x: box.width - aiSize - s(16), y: navBarY },
      { x: s(16), y: navBarY },
    ],
    [box.width, navBarY, aiSize],
  );

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
      onLayout={(e) =>
        setBox({
          width: e.nativeEvent.layout.width,
          height: e.nativeEvent.layout.height,
        })
      }
    >
      {/* Olcu hazir olunca mount et — boylece buton dogru noktada baslar */}
      {box.height > 0 && (
        <DraggableAIButton
          theme={theme}
          onPress={() => {
            // Balon + bolum vurgusunu temizle, tam sohbeti ac
            clearPendingBubble();
            clearFocus();
            setShowChat(true);
          }}
          safeSpots={aiSafeSpots}
          moveToSpot={aiMoveTarget}
          onMoveComplete={() => setAiMoveTarget(null)}
        />
      )}
    </View>
  );
};
