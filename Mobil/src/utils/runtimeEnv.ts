// Runtime ortam tespiti — Expo Go vs EAS/dev-client/standalone
// vision-camera, react-native-fast-tflite gibi native modulleri kullanan kod
// Expo Go'da crash eder; once bu sabiti kontrol et, gerekiyorsa fallback render et

import { NativeModules } from "react-native";

// Expo Go'da VisionCamera'nin native modulu yoktur; dogrudan NativeModules uzerinden kontrol et.
// Constants.executionEnvironment / appOwnership SDK versiyonuna gore tutarsiz davranabiliyor.
export const IS_EXPO_GO = !NativeModules.CameraView;
