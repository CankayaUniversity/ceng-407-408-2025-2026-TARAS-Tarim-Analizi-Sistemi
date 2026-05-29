// Home tab native stack — HomeMain (ana ekran) + IrrigationDetail (pageSheet)
// Disease stack ile birebir ayni mimari:
//   iOS  : IrrigationDetail pageSheet sunumuyla acilir — native sheet gorunumu
//   Android: card (sag taraftan kayarak)

import { Platform } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useIsFocused } from "@react-navigation/native";
import { View, Text } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useTheme } from "../../context/ThemeContext";
import { useDashboard } from "../../context/DashboardContext";
import { useLanguage } from "../../context/LanguageContext";
import { PressableDark } from "../../components/PressableDark";
import type { NodeInfo } from "../../components/ColorPlane";
import { HomeScreen } from "./HomeScreen";
import { IrrigationDetailScreen } from "../Irrigation/IrrigationDetailScreen";
import { ms, vs, s } from "../../utils/responsive";

export type HomeStackParamList = {
  HomeMain: undefined;
  IrrigationDetail: { node: NodeInfo; nodeIndex: number };
};

export type IrrigationDetailNavProps = NativeStackScreenProps<
  HomeStackParamList,
  "IrrigationDetail"
>;

const Stack = createNativeStackNavigator<HomeStackParamList>();

// HomeMain — context'ten verileri okur, HomeScreen'e iletir
// (HomeContainer'daki ayni kapsam; HomeStack icinde ayri screen olarak yasatilir)
const HomeMainScreen = () => {
  const { theme, isDark } = useTheme();
  const { dashboardData, refreshing, refresh, fields, setAddFieldModalOpen, canManageSelectedFarm } = useDashboard();
  const { t } = useLanguage();
  const isFocused = useIsFocused();

  if (fields.length === 0) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: theme.background, paddingHorizontal: s(32) }}>
        <MaterialCommunityIcons name="terrain" size={56} color={theme.textMuted} />
        <Text style={{ fontSize: ms(17, 0.3), fontWeight: "700", color: theme.textMain, marginTop: vs(16), textAlign: "center" }}>
          {t.home.noFieldsTitle}
        </Text>
        <Text style={{ fontSize: ms(13, 0.3), color: theme.textSecondary, marginTop: vs(6), textAlign: "center" }}>
          {t.home.noFieldsSubtitle}
        </Text>
        {/* Tarla ekleme yalnizca secili ciftligi sahiplenen kullaniciya — paydas/farmer-uye salt-okunur. */}
        {canManageSelectedFarm && (
          <PressableDark
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: theme.primary,
              borderRadius: 12,
              paddingVertical: vs(12),
              paddingHorizontal: s(24),
              marginTop: vs(20),
              gap: s(6),
            }}
            onPress={() => setAddFieldModalOpen(true)}
          >
            <MaterialCommunityIcons name="plus" size={18} color={theme.textOnPrimary} />
            <Text style={{ fontSize: ms(15, 0.3), fontWeight: "600", color: theme.textOnPrimary }}>
              {t.home.addField}
            </Text>
          </PressableDark>
        )}
      </View>
    );
  }

  return (
    <HomeScreen
      theme={theme}
      isDark={isDark}
      dashboardData={dashboardData}
      refreshing={refreshing}
      onRefresh={refresh}
      isActive={isFocused}
    />
  );
};

export const HomeStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="HomeMain" component={HomeMainScreen} />
    <Stack.Screen
      name="IrrigationDetail"
      component={IrrigationDetailScreen}
      options={{
        presentation: Platform.OS === "ios" ? "pageSheet" : "card",
        animation: Platform.OS === "ios" ? "default" : "simple_push",
        headerShown: false,
      }}
    />
  </Stack.Navigator>
);
