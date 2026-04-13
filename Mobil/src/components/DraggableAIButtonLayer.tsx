// DraggableAIButton'u ChatContext ile sarmaliyor — AI button ekran uzerinde yuzuyor
import { useMemo } from "react";
import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DraggableAIButton } from "./DraggableAIButton";
import { useTheme } from "../context/ThemeContext";
import { useChatContext } from "../context/ChatContext";
import { s, vs } from "../utils/responsive";

export const DraggableAIButtonLayer = () => {
  const { theme } = useTheme();
  const {
    clearPendingBubble,
    setShowChat,
    aiMoveTarget,
    setAiMoveTarget,
    setAiSpotIndex,
  } = useChatContext();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const navBottom = insets.bottom > 20 ? 8 : Math.max(insets.bottom + 4, 8);
  const aiSize = s(54);
  const aiBottomOffset = navBottom + vs(60) + vs(12);
  const navBarY = windowHeight - insets.top - aiBottomOffset - aiSize;

  const aiSafeSpots = useMemo(
    () => [
      { x: windowWidth - aiSize - s(16), y: navBarY },
      { x: s(16), y: navBarY },
    ],
    [windowWidth, navBarY, aiSize],
  );

  return (
    <DraggableAIButton
      theme={theme}
      onPress={() => {
        clearPendingBubble();
        setShowChat(true);
      }}
      safeSpots={aiSafeSpots}
      moveToSpot={aiMoveTarget}
      onMoveComplete={() => setAiMoveTarget(null)}
      onSpotChanged={setAiSpotIndex}
    />
  );
};
