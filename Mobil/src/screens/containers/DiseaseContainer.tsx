// Context → DiseaseStack prop bridge.
// vision-camera staticly import EDILMEZ — Expo Go'da CameraModule yok, modul
// yuklenirken crash eder. Native dali require() ile lazy yuklenir (router pattern).
import { DiseaseStack } from "../Disease/DiseaseStack";
import { IS_EXPO_GO } from "../../utils/runtimeEnv";

const DiseaseContainerExpoGo = () => {
  return (
    <DiseaseStack
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
        const { hasPermission, requestPermission } = useCameraPermission();
        return (
          <DiseaseStack
            hasCameraPermission={hasPermission}
            onRequestPermission={requestPermission}
          />
        );
      };
    })();
