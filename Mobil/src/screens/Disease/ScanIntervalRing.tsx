// Tarama hizini gosteren dairesel progress halkasi
// Her tarama dongusunde 0 -> 360 derece dolar, sonra sifirlanir
// intervalMs degistiginde animasyon yeni sureye gore yeniden baslar

import { useEffect, useRef } from "react";
import { Animated, Easing, View, StyleSheet } from "react-native";
import Svg, { Circle } from "react-native-svg";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface ScanIntervalRingProps {
  intervalMs: number;
  size: number;
  strokeWidth: number;
  trackColor: string;
  progressColor: string;
  active: boolean;
  children?: React.ReactNode;
}

export const ScanIntervalRing = ({
  intervalMs,
  size,
  strokeWidth,
  trackColor,
  progressColor,
  active,
  children,
}: ScanIntervalRingProps) => {
  const progress = useRef(new Animated.Value(0)).current;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    progress.setValue(0);
    if (!active) return;
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: Math.max(50, intervalMs),
        easing: Easing.linear,
        useNativeDriver: false, // SVG strokeDashoffset native driver desteklemez
      }),
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [intervalMs, active, progress]);

  const strokeDashoffset = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });

  return (
    <View style={[styles.wrapper, { width: size, height: size }]}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={progressColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          // 12 saatten basla (saat ibresi gibi tepeden donsun)
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.content}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    alignItems: "center",
    justifyContent: "center",
  },
});
