// Context → SettingsScreen prop bridge
// HardwareSetupModal bu container'a local, artik App.tsx'te yok
import { useEffect, useState } from "react";
import { Modal, Platform } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { SettingsScreen } from "../";
import { HardwareSetupModal } from "../Settings/HardwareSetupModal";
import { CreateFarmScreen } from "../CreateFarm";
import { useTheme } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { useDashboard } from "../../context/DashboardContext";
import { usePopupMessage } from "../../context/PopupMessageContext";
import { useLanguage } from "../../context/LanguageContext";
import { authAPI } from "../../utils/api";

export const SettingsContainer = () => {
  const { theme, isDark, themeMode, setThemeMode } = useTheme();
  const { handleLogout, dataSource, username } = useAuth();
  const {
    farms,
    selectedFarmId,
    setSelectedFarmId,
    fields,
    hasFarms,
    notifyFarmCreated,
    deleteFarm,
    deleteField,
  } = useDashboard();
  const { showPopup } = usePopupMessage();
  const { t } = useLanguage();
  const [showHardwareSetup, setShowHardwareSetup] = useState(false);
  const [showCreateFarm, setShowCreateFarm] = useState(false);

  // Profil bilgileri
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const profileRes = await authAPI.getProfile();
        if (profileRes.success && profileRes.data) {
          setEmail(profileRes.data.email ?? null);
          const rawRole = profileRes.data.role;
          if (typeof rawRole === "string") {
            setRole(rawRole);
          } else if (rawRole && typeof rawRole === "object" && "role_name" in rawRole) {
            setRole((rawRole as any).role_name ?? null);
          }
        }
      } catch { /* offline */ }
    })();
  }, []);

  const onHardwareSetup = () => {
    if (dataSource === "demo") {
      showPopup(t.disease.demoHardwareUnavailable);
      return;
    }
    setShowHardwareSetup(true);
  };

  return (
    <>
      <SettingsScreen
        theme={theme}
        isDark={isDark}
        themeMode={themeMode}
        onThemeModeChange={setThemeMode}
        onLogout={handleLogout}
        onHardwareSetup={onHardwareSetup}
        username={username}
        email={email}
        role={role}
        farms={farms}
        selectedFarmId={selectedFarmId}
        onSelectFarm={setSelectedFarmId}
        fields={fields}
        hasFarms={hasFarms}
        onCreateFarm={() => setShowCreateFarm(true)}        onDeleteFarm={deleteFarm}
        onDeleteField={deleteField}        onProfileUpdated={(_username, newEmail) => {
          setEmail(newEmail);
        }}
      />
      <HardwareSetupModal
        visible={showHardwareSetup}
        theme={theme}
        onClose={() => setShowHardwareSetup(false)}
      />
      <Modal
        visible={showCreateFarm}
        animationType="slide"
        presentationStyle={Platform.OS === "ios" ? "pageSheet" : "fullScreen"}
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
};
