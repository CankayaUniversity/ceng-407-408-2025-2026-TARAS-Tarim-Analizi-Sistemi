// Context → HomeStack bridge
// Ciftlik yoksa EmptyFarmState, ciftlik varsa HomeStack (NativeStack navigator) gosterir
import { useState } from "react";
import { Modal } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../context/ThemeContext";
import { useDashboard } from "../../context/DashboardContext";
import { EmptyFarmState, CreateFarmScreen } from "../CreateFarm";
import { HomeStack } from "../Home/HomeStack";

export const HomeContainer = () => {
  const { theme } = useTheme();
  const {
    initialLoadDone,
    hasFarms,
    notifyFarmCreated,
  } = useDashboard();
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
                onFarmCreated={async (farmId: string) => {
                  setShowCreateFarm(false);
                  await notifyFarmCreated(farmId);
                }}
                onBack={() => setShowCreateFarm(false)}
              />
            </SafeAreaView>
          </SafeAreaProvider>
        </Modal>
      </>
    );
  }

  return <HomeStack />;
};
