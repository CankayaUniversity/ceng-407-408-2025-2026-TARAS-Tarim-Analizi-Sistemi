import React, { useRef, useEffect } from 'react';
import { View, Animated, Easing, useWindowDimensions } from 'react-native';

interface Tab {
  id: string;
  content: React.ReactElement;
}

interface SlidingTabContainerProps {
  activeIndex: number;
  tabs: Tab[];
}

export const SlidingTabContainer = ({ activeIndex, tabs }: SlidingTabContainerProps) => {
  const { width: screenWidth } = useWindowDimensions();
  const slideAnim = useRef(new Animated.Value(-activeIndex * screenWidth)).current;

  // Animate on tab change (button tap)
  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: -activeIndex * screenWidth,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [activeIndex]);

  // Instantly adjust on screen width change (no animation)
  useEffect(() => {
    slideAnim.setValue(-activeIndex * screenWidth);
  }, [screenWidth]);

  return (
    <View style={{ flex: 1, overflow: 'hidden' }}>
      <Animated.View
        style={{
          flex: 1,
          flexDirection: 'row',
          width: screenWidth * tabs.length,
          transform: [{ translateX: slideAnim }],
        }}
      >
        {tabs.map((tab, index) => (
          <View
            key={tab.id}
            style={{
              width: screenWidth,
              flex: 1,
            }}
            pointerEvents={index === activeIndex ? 'auto' : 'none'}
          >
            {React.cloneElement(tab.content as React.ReactElement<{ isActive?: boolean }>, { isActive: index === activeIndex })}
          </View>
        ))}
      </Animated.View>
    </View>
  );
};
