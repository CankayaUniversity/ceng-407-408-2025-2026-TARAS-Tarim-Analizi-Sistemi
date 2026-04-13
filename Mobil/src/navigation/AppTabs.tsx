// Tab navigator — React Navigation v7 bottom-tabs
// Optimizasyonlar: lazy mount, animation none, freezeOnBlur, detachInactiveScreens
// Component prop kullaniliyor (function-as-child yerine) — stable referans

import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
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
  const { theme } = useTheme();
  return (
    <NavigationContainer ref={navigationRef}>
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
