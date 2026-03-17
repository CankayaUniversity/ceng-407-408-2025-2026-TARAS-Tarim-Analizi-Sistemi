// Popup mesaj - ekranda kisa sureli bildirim gosterir
// Props: message (yazi), visible, onHide, duration (sure ms)
import { useEffect, useRef, useState } from "react";
import { Animated, Text, StyleSheet, View } from "react-native";

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
    <View style={styles.container} pointerEvents="none">
      <Animated.View style={[styles.popup, { opacity: fadeAnim }]}>
        <Text style={styles.text}>{message}</Text>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 120,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
  },
  popup: {
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  text: { color: "#fff", fontSize: 18, fontWeight: "600", textAlign: "center" },
});
