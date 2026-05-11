// Context → SettingsScreen prop bridge
// HardwareSetupModal bu container'a local, artik App.tsx'te yok
import { useState } from "react";
import { SettingsScreen } from "../";
import { HardwareSetupModal } from "../Settings/HardwareSetupModal";
import { useTheme } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { usePopupMessage } from "../../context/PopupMessageContext";
import { useLanguage } from "../../context/LanguageContext";

export const SettingsContainer = () => {
  const { theme, isDark, themeMode, setThemeMode } = useTheme();
  const { handleLogout, dataSource } = useAuth();
  const { showPopup } = usePopupMessage();
  const { t } = useLanguage();
  const [showHardwareSetup, setShowHardwareSetup] = useState(false);

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
      />
      <HardwareSetupModal
        visible={showHardwareSetup}
        theme={theme}
        onClose={() => setShowHardwareSetup(false)}
      />
    </>
  );
};
