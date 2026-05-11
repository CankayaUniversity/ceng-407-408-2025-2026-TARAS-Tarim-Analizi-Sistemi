// Ortak stiller — yalnizca henuz NativeWind'e migrate edilmemis dosyalar icin
import { StyleSheet } from "react-native";
import { ms } from "../utils/responsive";

export const appStyles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1, flexDirection: "column" },
  canvasContainer: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: "transparent",
  },
  // SensorDataDumpScreen tarafindan kullaniliyor
  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: { fontSize: ms(24, 0.3), fontWeight: "700" },
  placeholderSub: { fontSize: ms(14, 0.3) },
});
