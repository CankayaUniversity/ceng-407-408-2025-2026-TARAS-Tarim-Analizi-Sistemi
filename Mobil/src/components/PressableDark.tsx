// Pressable that tints its background on press via an overlay sitting BEHIND
// the children (icons/text stay crisp). Clips to borderRadius when the passed
// style sets overflow: "hidden".

import { useRef, type ReactNode } from "react";
import {
  Pressable,
  Animated,
  StyleSheet,
  type PressableProps,
  type ViewStyle,
  type StyleProp,
  type GestureResponderEvent,
} from "react-native";

interface PressableDarkProps extends Omit<PressableProps, "style" | "children"> {
  style?: StyleProp<ViewStyle>;
  /** Overlay color shown on press. Defaults to 10% black for a subtle tint. */
  darkenColor?: string;
  children?: ReactNode;
}

export const PressableDark = ({
  style,
  darkenColor = "rgba(0,0,0,0.10)",
  children,
  onPressIn,
  onPressOut,
  ...rest
}: PressableDarkProps) => {
  const overlay = useRef(new Animated.Value(0)).current;

  const handlePressIn = (e: GestureResponderEvent) => {
    Animated.timing(overlay, {
      toValue: 1,
      duration: 80,
      useNativeDriver: true,
    }).start();
    onPressIn?.(e);
  };

  const handlePressOut = (e: GestureResponderEvent) => {
    Animated.timing(overlay, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
    onPressOut?.(e);
  };

  return (
    <Pressable
      {...rest}
      style={style}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      {/* Overlay first → sits BEHIND children in the stacking order. */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          { backgroundColor: darkenColor, opacity: overlay },
        ]}
      />
      {children}
    </Pressable>
  );
};
