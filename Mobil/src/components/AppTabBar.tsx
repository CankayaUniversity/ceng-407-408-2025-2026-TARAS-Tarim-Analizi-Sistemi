// Ozel tabBar — React Navigation bottom-tabs icin renderer
// state.index ve navigation.navigate uzerinden calisiyor
// memo ile gereksiz render engellendi

import { memo } from "react";
import { View, Text } from "react-native";
import { PressableDark } from "./PressableDark";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useTheme } from "../context/ThemeContext";
import { useLanguage } from "../context/LanguageContext";
import { useTabBarPopOut } from "../context/TabBarPopOutContext";
import { useTabResetContext } from "../context/TabResetContext";
import { NAV_ITEMS } from "../constants";
import { s, vs, ms } from "../utils/responsive";
import type { TabParamList } from "../navigation/navigationRef";

export const AppTabBar = memo(function AppTabBar(props: BottomTabBarProps) {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const { popOuts } = useTabBarPopOut();
  const { requestReset } = useTabResetContext();
  const navBottom = insets.bottom > 20 ? 8 : Math.max(insets.bottom + 4, 8);
  const hasPopOut = Object.keys(popOuts).length > 0;

  return (
    // Outer wrapper so a pop-out can render above the bar without clipping.
    <View
      style={{ marginHorizontal: s(12), marginBottom: navBottom }}
      pointerEvents="box-none"
    >
      {/* Pop-out cards: each registered pop-out renders above its OWN tab
          column (not just the active one) so it stays mounted across tab
          switches and can play its exit animation. Painted before the tab bar
          + overflow:hidden clips it at the bar's top edge, so sliding translateY
          0↔100 reads as emerging from / sinking behind the bar. paddingTop
          leaves room for its upward shadow. */}
      {hasPopOut && (
        <View
          pointerEvents="box-none"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: "100%",
            flexDirection: "row",
            paddingHorizontal: s(4),
            paddingTop: 20,
            overflow: "hidden",
            zIndex: 0,
            elevation: 0,
          }}
        >
          {NAV_ITEMS.map((item) => {
            const popOut = popOuts[item.id];
            return (
              <View
                key={item.id}
                style={{ flex: 1, alignItems: "center", marginHorizontal: s(2) }}
                pointerEvents="box-none"
              >
                {popOut ? popOut() : null}
              </View>
            );
          })}
        </View>
      )}

      <View
        className="flex-row p-1"
        style={{
          borderRadius: s(14),
          backgroundColor: theme.surface,
          shadowColor: theme.shadowColor,
          elevation: 12,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.12,
          shadowRadius: 16,
          zIndex: 1,
        }}
      >
        {NAV_ITEMS.map((item, idx) => {
          const isActive = props.state.index === idx;
          return (
            <PressableDark
              key={item.id}
              className="flex-1 center"
              style={[
                {
                  paddingVertical: vs(12),
                  marginHorizontal: s(2),
                  borderRadius: s(10),
                  overflow: "hidden",
                },
                isActive && { backgroundColor: theme.primary + "22" },
              ]}
              onPress={() => {
                // Zaten aktif sekmeye tekrar basildiysa o sekmeyi ana duruma sifirla;
                // degilse normal sekme gecisi yap.
                if (isActive) {
                  requestReset(item.id as keyof TabParamList);
                } else {
                  props.navigation.navigate(item.id as keyof TabParamList);
                }
              }}
            >
              <MaterialCommunityIcons
                name={item.icon as any}
                size={ms(20, 0.3)}
                color={isActive ? theme.primary : theme.textSecondary}
              />
              <Text
                className="font-semibold"
                style={{
                  fontSize: ms(10, 0.3),
                  marginTop: vs(3),
                  color: isActive ? theme.primary : theme.textSecondary,
                }}
                numberOfLines={1}
              >
                {t.nav[item.id]}
              </Text>
            </PressableDark>
          );
        })}
      </View>
    </View>
  );
});
