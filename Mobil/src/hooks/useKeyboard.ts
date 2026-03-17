// Klavye hook - klavye acildiginda animasyonlu padding ayarlar
// Kullanim: keyboardHeight, isKeyboardVisible, animatedPadding dondurur

import { useState, useEffect, useRef } from "react";
import { Keyboard, Platform, Animated } from "react-native";

export const useKeyboard = () => {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const animatedPadding = useRef(new Animated.Value(0)).current;
  const currentAnimation = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    const show = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hide = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(show, (e) => {
      // Stop any running animation
      if (currentAnimation.current) {
        currentAnimation.current.stop();
      }

      setKeyboardHeight(e.endCoordinates.height);
      setIsKeyboardVisible(true);

      currentAnimation.current = Animated.timing(animatedPadding, {
        toValue: 1,
        duration: Platform.OS === "ios" ? 250 : 200,
        useNativeDriver: false,
      });
      currentAnimation.current.start(() => {
        currentAnimation.current = null;
      });
    });

    const hideSub = Keyboard.addListener(hide, () => {
      // Stop any running animation
      if (currentAnimation.current) {
        currentAnimation.current.stop();
      }

      currentAnimation.current = Animated.timing(animatedPadding, {
        toValue: 0,
        duration: Platform.OS === "ios" ? 300 : 250,
        useNativeDriver: false,
      });
      currentAnimation.current.start(() => {
        currentAnimation.current = null;
        setKeyboardHeight(0);
        setIsKeyboardVisible(false);
      });
    });

    return () => {
      showSub.remove();
      hideSub.remove();
      if (currentAnimation.current) {
        currentAnimation.current.stop();
      }
    };
  }, [animatedPadding]);

  return { keyboardHeight, isKeyboardVisible, animatedPadding };
};
