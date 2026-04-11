// Suruklenebilir AI butonu — safe spot'lara yayli snap
import { useRef, useEffect, useCallback } from "react";
import {
  Animated,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Theme } from "../types";
import { s } from "../utils/responsive";

export interface SafeSpot {
  x: number;
  y: number;
}

interface DraggableAIButtonProps {
  theme: Theme;
  onPress: () => void;
  safeSpots: SafeSpot[];
  onSpotChanged?: (spotIndex: number) => void;
}

const BUTTON_SIZE = s(54);
const DRAG_THRESHOLD = 5;

const SPRING_CONFIG = {
  bounciness: 12,
  speed: 8,
  useNativeDriver: true,
};

function nearestSpotIndex(x: number, y: number, spots: SafeSpot[]): number {
  let minDist = Infinity;
  let minIdx = 0;
  for (let i = 0; i < spots.length; i++) {
    const dx = x - spots[i]!.x;
    const dy = y - spots[i]!.y;
    const dist = dx * dx + dy * dy;
    if (dist < minDist) {
      minDist = dist;
      minIdx = i;
    }
  }
  return minIdx;
}

export const DraggableAIButton = ({
  theme,
  onPress,
  safeSpots,
  onSpotChanged,
}: DraggableAIButtonProps) => {
  const position = useRef(new Animated.ValueXY({
    x: safeSpots[0]?.x ?? 0,
    y: safeSpots[0]?.y ?? 0,
  })).current;

  const currentSpot = useRef(0);
  const isDragging = useRef(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  // Gercek pozisyonu izle (Animated degerler okunabilir degil)
  const lastPos = useRef({ x: safeSpots[0]?.x ?? 0, y: safeSpots[0]?.y ?? 0 });

  // Pozisyon degisikliklerini izle
  useEffect(() => {
    const xId = position.x.addListener(({ value }) => { lastPos.current.x = value; });
    const yId = position.y.addListener(({ value }) => { lastPos.current.y = value; });
    return () => {
      position.x.removeListener(xId);
      position.y.removeListener(yId);
    };
  }, [position]);

  const snapToSpot = useCallback((idx: number) => {
    const spot = safeSpots[idx];
    if (!spot) return;
    currentSpot.current = idx;
    Animated.spring(position, {
      toValue: { x: spot.x, y: spot.y },
      ...SPRING_CONFIG,
    }).start(() => {
      onSpotChanged?.(idx);
    });
  }, [safeSpots, position, onSpotChanged]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_: GestureResponderEvent, gesture: PanResponderGestureState) =>
        Math.abs(gesture.dx) > DRAG_THRESHOLD || Math.abs(gesture.dy) > DRAG_THRESHOLD,

      onPanResponderGrant: () => {
        isDragging.current = false;
        dragStartPos.current = { ...lastPos.current };
        position.setOffset({ x: lastPos.current.x, y: lastPos.current.y });
        position.setValue({ x: 0, y: 0 });
      },

      onPanResponderMove: (_: GestureResponderEvent, gesture: PanResponderGestureState) => {
        if (Math.abs(gesture.dx) > DRAG_THRESHOLD || Math.abs(gesture.dy) > DRAG_THRESHOLD) {
          isDragging.current = true;
        }
        if (isDragging.current) {
          position.setValue({ x: gesture.dx, y: gesture.dy });
        }
      },

      onPanResponderRelease: (_: GestureResponderEvent, gesture: PanResponderGestureState) => {
        position.flattenOffset();

        if (!isDragging.current) {
          // Tap — suruklemeden birakti
          // Orijinal pozisyona geri don
          snapToSpot(currentSpot.current);
          onPress();
          return;
        }

        // Surukle-birak — en yakin safe spot'a snap
        const finalX = dragStartPos.current.x + gesture.dx;
        const finalY = dragStartPos.current.y + gesture.dy;
        const nearest = nearestSpotIndex(finalX, finalY, safeSpots);
        snapToSpot(nearest);
      },
    }),
  ).current;

  // Animated.View — tum stiller style icinde kalmali (transform, position, boyut)
  return (
    <Animated.View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: BUTTON_SIZE,
        height: BUTTON_SIZE,
        borderRadius: BUTTON_SIZE / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: theme.accent,
        shadowColor: theme.isDark ? "#000" : "#334155",
        elevation: 10,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
        zIndex: 998,
        transform: position.getTranslateTransform(),
      }}
      {...panResponder.panHandlers}
    >
      <MaterialCommunityIcons name="robot" size={s(22)} color="#fff" />
    </Animated.View>
  );
};
