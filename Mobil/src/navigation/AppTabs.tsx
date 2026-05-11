// Tab navigator — React Navigation v7 bottom-tabs
// Optimizasyonlar: lazy mount, animation none, freezeOnBlur, detachInactiveScreens
// tabBar useCallback ile stable referans — her render yeni fonksiyon olusmasini engeller

import { useCallback, useMemo } from "react";
import { NavigationContainer, DefaultTheme, DarkTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { navigationRef, TabParamList } from "./navigationRef";
import { useTheme } from "../context/ThemeContext";
import { AppTabBar } from "../components/AppTabBar";
import {
  CarbonFootprintContainer,
  TimetableContainer,
  HomeContainer,
  DiseaseContainer,
  SettingsContainer,
} from "../screens/containers";

const Tab = createBottomTabNavigator<TabParamList>();

export const AppTabs = () => {
  const { theme, isDark } = useTheme();

  // NavigationContainer theme — RN'nin kendi arka plan katmanini tema ile esler
  const navTheme = useMemo(
    () => ({
      ...(isDark ? DarkTheme : DefaultTheme),
      colors: {
        ...(isDark ? DarkTheme.colors : DefaultTheme.colors),
        background:   theme.background,
        card:         theme.surface,
        border:       theme.border,
        text:         theme.textMain,
        notification: theme.accent,
      },
    }),
    [isDark, theme],
  );

  // Stable referanslar — her render yeni fonksiyon olusturmasini engeller
  const renderTabBar = useCallback(
    (props: BottomTabBarProps) => <AppTabBar {...props} />,
    [],
  );
  const sceneStyle = useMemo(
    () => ({ backgroundColor: theme.background }),
    [theme.background],
  );

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      <Tab.Navigator
        initialRouteName="home"
        tabBar={renderTabBar}
        detachInactiveScreens={false}
        screenOptions={{
          headerShown: false,
          lazy: true,
          animation: "none",
          freezeOnBlur: true,
          sceneStyle,
        }}
      >
        <Tab.Screen name="carbon" component={CarbonFootprintContainer} />
        <Tab.Screen name="timetable" component={TimetableContainer} />
        {/* Home: 3D canvas + expo-gl state — freeze/detach kirar, kapali tut */}
        <Tab.Screen
          name="home"
          component={HomeContainer}
          options={{ freezeOnBlur: false }}
        />
        <Tab.Screen name="disease" component={DiseaseContainer} />
        <Tab.Screen name="settings" component={SettingsContainer} />
      </Tab.Navigator>
    </NavigationContainer>
  );
};
