// Router: Expo Go'da fallback, gercek build'de native implementasyon.
// require() kosullu yapilir, boylelikle Expo Go'da
// react-native-vision-camera + react-native-fast-tflite modulleri YUKLENMEZ
// (aksi halde TensorflowModule.install() / VisionCameraProxy native tarafi olmadigi icin crash).

import type React from "react";
import type { DiseaseScreenProps } from "./types";
import { IS_EXPO_GO } from "../../utils/runtimeEnv";
import { DiseaseCameraScreenExpoGo } from "./DiseaseCameraScreenExpoGo";

let Native: React.ComponentType<DiseaseScreenProps> | null = null;
if (!IS_EXPO_GO) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  Native = require("./DiseaseCameraScreenNative").DiseaseCameraScreenNative;
}

export const DiseaseCameraScreen: React.ComponentType<DiseaseScreenProps> =
  IS_EXPO_GO ? DiseaseCameraScreenExpoGo : (Native as React.ComponentType<DiseaseScreenProps>);
