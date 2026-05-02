// Context → DiseaseScreen prop bridge
// Expo Go'da vision-camera native modulu yok — useCameraPermission cagrilmaz, statik degerler kullanilir
import { useCameraPermission } from "react-native-vision-camera";
import { DiseaseScreen } from "../";
import { useTheme } from "../../context/ThemeContext";
import { IS_EXPO_GO } from "../../utils/runtimeEnv";

const DiseaseContainerExpoGo = () => {
  const { theme } = useTheme();
  return (
    <DiseaseScreen
      theme={theme}
      hasCameraPermission={false}
      onRequestPermission={async () => false}
    />
  );
};

const DiseaseContainerNative = () => {
  const { theme } = useTheme();
  const { hasPermission, requestPermission } = useCameraPermission();
  return (
    <DiseaseScreen
      theme={theme}
      hasCameraPermission={hasPermission}
      onRequestPermission={requestPermission}
    />
  );
};

export const DiseaseContainer = IS_EXPO_GO ? DiseaseContainerExpoGo : DiseaseContainerNative;
