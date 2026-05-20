// Persistent camera pop-out button for the disease tab. One mounted instance
// (single PressableDark + Animated values) that the tab bar renders above the
// disease slot. Reads the nested stack via useNavigationState to slide/fade
// itself: shown on the list and inside folders (with a folder badge), hidden on
// the detail screen.

import { useEffect, useRef, useCallback } from "react";
import { Animated, Easing } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  useIsFocused,
  useNavigation,
  useNavigationState,
} from "@react-navigation/native";
import type { NavigationProp } from "@react-navigation/native";
import { useTheme } from "../../context/ThemeContext";
import { useTabBarPopOut } from "../../context/TabBarPopOutContext";
import { PressableDark } from "../../components/PressableDark";
import { s, vs } from "../../utils/responsive";

export const DiseaseCameraButton = () => {
  const { theme } = useTheme();
  const { register } = useTabBarPopOut();
  // Tab navigator's navigation — used to dispatch to the nested disease stack.
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();

  // Read the topmost route inside the disease tab's nested stack.
  const topRouteInfo = useNavigationState((state) => {
    if (!state) return { name: "DiseaseList", params: null };
    const tabRoute = state.routes?.find((r) => r.name === "disease");
    const stackState = tabRoute?.state as
      | { routes: { name: string; params?: object }[]; index?: number }
      | undefined;
    if (!stackState) return { name: "DiseaseList", params: null };
    const top = stackState.routes[stackState.index ?? stackState.routes.length - 1];
    return { name: top?.name ?? "DiseaseList", params: top?.params ?? null };
  });

  const showButton = topRouteInfo.name !== "DiseaseDetail";
  const inFolder = topRouteInfo.name === "FolderDetail";

  // slideY starts at 100 (pushed below the tab bar, which paints on top) so the
  // show animation to 0 reads as the button emerging from behind the bar.
  const slideY = useRef(new Animated.Value(100)).current;
  const visibility = useRef(new Animated.Value(0)).current;
  const badgeOpacity = useRef(new Animated.Value(0)).current;

  const isFocused = useIsFocused();
  const shouldShow = isFocused && showButton;
  // pointerEvents reads shouldShow live (not via register deps) so the hidden
  // button stops catching taps on blur without a re-register flicker.
  const shouldShowRef = useRef(shouldShow);
  shouldShowRef.current = shouldShow;

  useEffect(() => {
    if (shouldShow) {
      // Re-arm slide start, then animate up + fade in in parallel.
      slideY.setValue(100);
      Animated.parallel([
        Animated.timing(slideY, {
          toValue: 0,
          duration: 380,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(visibility, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Hide: mirror the entrance (slide down behind the bar + fade), a bit faster.
      Animated.parallel([
        Animated.timing(slideY, {
          toValue: 100,
          duration: 260,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(visibility, {
          toValue: 0,
          duration: 220,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [shouldShow, slideY, visibility]);

  // Folder badge fade in/out as user moves between list and a folder.
  useEffect(() => {
    Animated.timing(badgeOpacity, {
      toValue: inFolder ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [inFolder, badgeOpacity]);

  // Tap handler — keeps a live read of the current route via refs so the
  // closure passed to register() stays valid even as route changes.
  const inFolderRef = useRef(inFolder);
  inFolderRef.current = inFolder;
  const topParamsRef = useRef(topRouteInfo.params);
  topParamsRef.current = topRouteInfo.params;

  const handlePress = useCallback(() => {
    const params = topParamsRef.current as
      | { folderId?: string; folderName?: string }
      | null;
    if (inFolderRef.current && params?.folderId) {
      // Tap from inside a folder → open camera with this folder bound.
      navigation.navigate("disease", {
        screen: "DiseaseList",
        params: {
          openCameraFor: {
            folderId: params.folderId,
            folderName: params.folderName ?? "",
          },
        },
      } as never);
      return;
    }
    // General photo — same nav target but no folder context.
    navigation.navigate("disease", {
      screen: "DiseaseList",
      params: { openCameraFor: undefined, openGeneralCamera: true },
    } as never);
  }, [navigation]);

  // Register the button into the tab bar's pop-out slot. Re-runs on showButton
  // change (detail push/pop) so the tab bar re-renders and the closure re-reads
  // the live pointerEvents.
  useEffect(() => {
    return register({
      tabId: "disease",
      render: () => (
        <Animated.View
          pointerEvents={shouldShowRef.current ? "auto" : "none"}
          style={{
            transform: [{ translateY: slideY }],
            opacity: visibility,
          }}
        >
          <PressableDark
            onPress={handlePress}
            style={{
              width: s(60),
              paddingVertical: vs(12),
              borderTopLeftRadius: s(10),
              borderTopRightRadius: s(10),
              backgroundColor: theme.success,
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              // No elevation: the tab bar must paint above this button for the
              // emerge-from-behind effect; iOS shadow alone gives depth.
              shadowColor: theme.shadowColor,
              shadowOffset: { width: 0, height: -4 },
              shadowOpacity: 0.18,
              shadowRadius: 10,
            }}
          >
            <Ionicons name="camera" size={30} color={theme.textOnPrimary} />
            {/* Folder badge — always rendered, opacity drives visibility */}
            <Animated.View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: 4,
                right: 6,
                width: 18,
                height: 18,
                borderRadius: 9,
                backgroundColor: theme.background,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: theme.success,
                opacity: badgeOpacity,
              }}
            >
              <Ionicons name="folder" size={10} color={theme.primary} />
            </Animated.View>
          </PressableDark>
        </Animated.View>
      ),
    });
  }, [register, theme, handlePress, showButton, slideY, visibility, badgeOpacity]);

  // Non-rendering component — its only job is to register the pop-out.
  return null;
};
