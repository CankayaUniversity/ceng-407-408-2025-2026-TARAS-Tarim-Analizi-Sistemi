// Kayan tab container - ekranlar arasi gecis animasyonu
// Props: activeIndex (aktif tab), tabs (tab listesi)
import React, { useRef, useEffect } from "react";
import { View, Animated, Easing, useWindowDimensions } from "react-native";

interface Tab {
  id: string;
  content: React.ReactElement;
}

interface SlidingTabContainerProps {
  activeIndex: number;
  tabs: Tab[];
}

export const SlidingTabContainer = ({
  activeIndex,
  tabs,
}: SlidingTabContainerProps) => {
  const { width: screenWidth } = useWindowDimensions();

  const fadeAnims = useRef(tabs.map(() => new Animated.Value(0))).current;
  const translateAnims = useRef(tabs.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    tabs.forEach((_, index) => {
      const isActive = index === activeIndex;
      const direction = index < activeIndex ? -1 : index > activeIndex ? 1 : 0;

      Animated.parallel([
        Animated.timing(fadeAnims[index], {
          toValue: isActive ? 1 : 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(translateAnims[index], {
          toValue: direction * screenWidth * 0.3,
          duration: 200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    });
  }, [activeIndex]);

  return (
    <View style={{ flex: 1 }}>
      {tabs.map((tab, index) => {
        const isActive = index === activeIndex;
        return (
          <Animated.View
            key={tab.id}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              opacity: fadeAnims[index],
              transform: [{ translateX: translateAnims[index] }],
            }}
            pointerEvents={isActive ? "auto" : "none"}
          >
            {React.cloneElement(
              tab.content as React.ReactElement<{ isActive?: boolean }>,
              { isActive },
            )}
          </Animated.View>
        );
      })}
    </View>
  );
};
