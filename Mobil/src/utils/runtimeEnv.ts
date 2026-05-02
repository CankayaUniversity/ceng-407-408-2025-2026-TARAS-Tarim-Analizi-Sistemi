// Runtime ortam tespiti — Expo Go vs EAS/dev-client/standalone
// vision-camera, react-native-fast-tflite gibi native modulleri kullanan kod
// Expo Go'da crash eder; once bu sabiti kontrol et, gerekiyorsa fallback render et

import Constants from "expo-constants";

// appOwnership === "expo" yalnizca Expo Go icin true; dev-client/standalone "guest"
export const IS_EXPO_GO = Constants.appOwnership === "expo";
