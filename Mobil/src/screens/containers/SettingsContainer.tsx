// Context → SettingsScreen prop bridge
// HardwareSetupModal bu container'a local, artik App.tsx'te yok
import { useState } from "react";
import { SettingsScreen } from "../";
import { HardwareSetupModal } from "../Settings/HardwareSetupModal";
import { useTheme } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";

export const SettingsContainer = () => {
  const { theme, isDark, themeMode, setThemeMode } = useTheme();
  const { handleLogout } = useAuth();
  const [showHardwareSetup, setShowHardwareSetup] = useState(false);

  return (
    <>
      <SettingsScreen
        theme={theme}
        isDark={isDark}
        themeMode={themeMode}
        onThemeModeChange={setThemeMode}
        onLogout={handleLogout}
        onHardwareSetup={() => setShowHardwareSetup(true)}
      />
      <HardwareSetupModal
        visible={showHardwareSetup}
        theme={theme}
        onClose={() => setShowHardwareSetup(false)}
      />
    </>
  );
};
