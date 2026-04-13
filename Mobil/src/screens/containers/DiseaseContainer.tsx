// Context → DiseaseScreen prop bridge
// Kamera permission burada local olarak isteniyor (daha once App.tsx'te cagriliyordu)
import { useCameraPermissions } from "expo-camera";
import { DiseaseScreen } from "../";
import { useTheme } from "../../context/ThemeContext";

export const DiseaseContainer = () => {
  const { theme } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  return (
    <DiseaseScreen
      theme={theme}
      permission={permission}
      onRequestPermission={requestPermission}
    />
  );
};
