import { useState, useEffect, useRef } from 'react';
import { Keyboard, Platform, Animated } from 'react-native';

export const useKeyboard = () => {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const animatedPadding = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const show = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hide = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(show, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
      setIsKeyboardVisible(true);
      Animated.timing(animatedPadding, {
        toValue: 1,
        duration: Platform.OS === "ios" ? 250 : 200,
        useNativeDriver: false,
      }).start();
    });

    const hideSub = Keyboard.addListener(hide, () => {
      Animated.timing(animatedPadding, {
        toValue: 0,
        duration: Platform.OS === "ios" ? 300 : 250,
        useNativeDriver: false,
      }).start(() => {
        setKeyboardHeight(0);
        setIsKeyboardVisible(false);
      });
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [animatedPadding]);

  return { keyboardHeight, isKeyboardVisible, animatedPadding };
};
