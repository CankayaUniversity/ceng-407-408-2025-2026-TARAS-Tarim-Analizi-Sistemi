// Context → HomeScreen prop bridge
import { useIsFocused } from "@react-navigation/native";
import { HomeScreen } from "../";
import { useTheme } from "../../context/ThemeContext";
import { useDashboard } from "../../context/DashboardContext";

export const HomeContainer = () => {
  const { theme, isDark } = useTheme();
  const { dashboardData, refreshing, refresh } = useDashboard();
  const isFocused = useIsFocused();
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
