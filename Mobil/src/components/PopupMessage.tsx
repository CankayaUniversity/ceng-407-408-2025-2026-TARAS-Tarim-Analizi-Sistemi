// Popup mesaj - ekranda kisa sureli bildirim gosterir
// Props: message (yazi), visible, onHide, duration (sure ms)
import { useEffect, useRef, useState } from "react";
import { Animated, Text, View } from "react-native";
import { vs } from "../utils/responsive";

interface PopupMessageProps {
  message: string;
  visible: boolean;
  onHide?: () => void;
  duration?: number;
}

export const PopupMessage = ({
  message,
  visible,
  onHide,
  duration = 2500,
}: PopupMessageProps) => {
  const [isShowing, setIsShowing] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible && message && message.trim()) {
      setIsShowing(true);
      fadeAnim.setValue(0);

      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start(() => {
        setTimeout(() => {
          Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }).start(() => {
            setIsShowing(false);
            onHide?.();
          });
        }, duration);
      });
    }
  }, [visible, message, duration]);

  if (!isShowing || !message) return null;

  return (
    <View
      className="absolute left-0 right-0 center z-[9999]"
      style={{ bottom: vs(120) }}
      pointerEvents="none"
    >
      <Animated.View
        className="bg-black/85 px-6 py-3.5 rounded-xl"
        style={{
          opacity: fadeAnim,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
          elevation: 8,
        }}
      >
        <Text className="text-white text-base font-semibold text-center">{message}</Text>
      </Animated.View>
    </View>
  );
};
