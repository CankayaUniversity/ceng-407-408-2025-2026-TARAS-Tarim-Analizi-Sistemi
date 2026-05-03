// Context → DiseaseScreen prop bridge.
// vision-camera staticly import EDILMEZ — Expo Go'da CameraModule yok, modul
// yuklenirken crash eder. Native dali require() ile lazy yuklenir (router pattern).
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

export const DiseaseContainer = IS_EXPO_GO
  ? DiseaseContainerExpoGo
  : (() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      const { useCameraPermission } = require("react-native-vision-camera");
      return () => {
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
    })();
