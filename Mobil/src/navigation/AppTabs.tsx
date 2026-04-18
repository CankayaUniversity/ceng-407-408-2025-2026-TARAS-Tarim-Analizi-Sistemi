// Tab navigator — React Navigation v7 bottom-tabs
// Optimizasyonlar: lazy mount, animation none, freezeOnBlur, detachInactiveScreens
// Component prop kullaniliyor (function-as-child yerine) — stable referans

import { NavigationContainer, DefaultTheme, DarkTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useMemo } from "react";
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

  // NavigationContainer theme — prevents React Navigation from using the OS
  // system color scheme for its own background layer (which sits underneath
  // every screen and is visible before a lazy screen mounts or during transitions)
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

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      <Tab.Navigator
        initialRouteName="home"
        tabBar={(props) => <AppTabBar {...props} />}
        detachInactiveScreens={false}
        screenOptions={{
          headerShown: false,
          lazy: true,
          animation: "none",
          freezeOnBlur: true,
          sceneStyle: { backgroundColor: theme.background },
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
