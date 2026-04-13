// Context → HomeScreen prop bridge
import { HomeScreen } from "../";
import { useTheme } from "../../context/ThemeContext";
import { useDashboard } from "../../context/DashboardContext";

export const HomeContainer = () => {
  const { theme, isDark } = useTheme();
  const { dashboardData, refreshing, refresh } = useDashboard();
  return (
    <HomeScreen
      theme={theme}
      isDark={isDark}
      dashboardData={dashboardData}
      refreshing={refreshing}
      onRefresh={refresh}
    />
  );
};
