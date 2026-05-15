// Context → HomeScreen prop bridge
// Ciftlik yoksa EmptyFarmState, ciftlik varsa normal HomeScreen gosterir
import { useState } from "react";
import { Modal } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { useIsFocused } from "@react-navigation/native";
import { HomeScreen } from "../";
import { useTheme } from "../../context/ThemeContext";
import { useDashboard } from "../../context/DashboardContext";
import { EmptyFarmState, CreateFarmScreen } from "../CreateFarm";

export const HomeContainer = () => {
  const { theme, isDark } = useTheme();
  const {
    dashboardData,
    refreshing,
    refresh,
    initialLoadDone,
    hasFarms,
    notifyFarmCreated,
  } = useDashboard();
  const isFocused = useIsFocused();
  const [showCreateFarm, setShowCreateFarm] = useState(false);

  // Ciftlik yoksa bos state goster
  if (initialLoadDone && !hasFarms) {
    return (
      <>
        <EmptyFarmState
          theme={theme}
          onAddFarm={() => setShowCreateFarm(true)}
        />
        <Modal
          visible={showCreateFarm}
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={() => setShowCreateFarm(false)}
        >
          <SafeAreaProvider>
            <SafeAreaView
              edges={["top", "left", "right", "bottom"]}
              style={{ flex: 1, backgroundColor: theme.background }}
            >
              <CreateFarmScreen
                theme={theme}
                onFarmCreated={async () => {
                  setShowCreateFarm(false);
                  await notifyFarmCreated();
                }}
                onBack={() => setShowCreateFarm(false)}
              />
            </SafeAreaView>
          </SafeAreaProvider>
        </Modal>
      </>
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
