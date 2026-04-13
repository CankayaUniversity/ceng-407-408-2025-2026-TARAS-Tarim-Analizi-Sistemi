// Ozel tabBar — React Navigation bottom-tabs icin renderer
// state.index ve navigation.navigate uzerinden calisiyor

import { View, Text, TouchableOpacity } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useTheme } from "../context/ThemeContext";
import { useLanguage } from "../context/LanguageContext";
import { NAV_ITEMS } from "../constants";
import { s, vs, ms } from "../utils/responsive";
import type { TabParamList } from "../navigation/navigationRef";

export const AppTabBar = (props: BottomTabBarProps) => {
  const { theme, isDark } = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const navBottom = insets.bottom > 20 ? 8 : Math.max(insets.bottom + 4, 8);

  return (
    <View
      className="flex-row rounded-3xl p-1"
      style={{
        marginHorizontal: s(12),
        marginBottom: navBottom,
        backgroundColor: theme.surface,
        shadowColor: isDark ? "#000" : "#334155",
        elevation: 10,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
      }}
    >
      {NAV_ITEMS.map((item, idx) => {
        const isActive = props.state.index === idx;
        return (
          <TouchableOpacity
            key={item.id}
            className="flex-1 center rounded-[20px]"
            style={[
              { paddingVertical: vs(12), marginHorizontal: s(2) },
              isActive && { backgroundColor: theme.accent + "22" },
            ]}
            onPress={() => props.navigation.navigate(item.id as keyof TabParamList)}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons
              name={item.icon as any}
              size={ms(20, 0.3)}
              color={isActive ? theme.accent : theme.accentDim}
            />
            <Text
              className="font-semibold"
              style={{
                fontSize: ms(10, 0.3),
                marginTop: vs(3),
                color: isActive ? theme.accent : theme.accentDim,
              }}
              numberOfLines={1}
            >
              {t.nav[item.id]}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};
