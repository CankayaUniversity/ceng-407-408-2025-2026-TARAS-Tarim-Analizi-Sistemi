// Uygulama stilleri - tum ekranlar icin ortak StyleSheet
// appStyles ile erisim

import { StyleSheet } from "react-native";
import { semanticColors } from "./colors";
import { s, vs, ms } from "../utils/responsive";

export const appStyles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1, flexDirection: "column" },

  header: { paddingHorizontal: s(24), paddingVertical: vs(16) },
  headerTitle: { fontSize: ms(28, 0.3), fontWeight: "700", letterSpacing: 0.5 },
  headerSubtitle: { fontSize: ms(13, 0.3), marginTop: vs(6), fontWeight: "400" },

  spacer: { flex: 1 },
  canvasContainer: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: "transparent",
  },

  bottomNavWrapper: {
    // backwards compat — replaced by nav styles in App.tsx
  },
  bottomNav: {
    flexDirection: "row",
  },
  navItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: vs(10),
    borderRadius: 12,
  },
  navIcon: { marginBottom: vs(4) },
  navLabel: { fontSize: ms(11, 0.3), fontWeight: "600" },

  fab: {
    position: "absolute",
    right: s(24),
    bottom: vs(100),
    width: s(56),
    height: s(56),
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
  },

  loginContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: s(24),
  },
  loginTitle: { fontSize: ms(32, 0.3), fontWeight: "700", marginBottom: vs(8) },
  loginSubtitle: { fontSize: ms(14, 0.3), textAlign: "center", marginBottom: vs(24) },
  loginInput: {
    width: "100%",
    paddingVertical: vs(12),
    paddingHorizontal: s(16),
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: vs(12),
    fontSize: ms(16, 0.3),
  },
  loginButton: {
    width: "100%",
    paddingVertical: vs(14),
    paddingHorizontal: s(24),
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: vs(24),
  },
  loginButtonText: { fontSize: ms(16, 0.3), fontWeight: "700", textAlign: "center" },
  skipButtonText: { fontSize: ms(14, 0.3), fontWeight: "600", textAlign: "center" },

  cameraContainer: { flex: 1, padding: s(16) },
  cameraBorderContainer: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 3,
    overflow: "hidden",
    elevation: 8,
    shadowColor: semanticColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  cameraView: { flex: 1 },

  settingsContainer: { flex: 1, paddingHorizontal: s(24), paddingTop: vs(24) },
  settingItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: vs(20),
    borderBottomWidth: 1,
    marginBottom: vs(20),
  },
  settingLeft: { flexDirection: "row", alignItems: "center" },
  settingLabel: { fontSize: ms(16, 0.3), fontWeight: "600", marginBottom: vs(4) },
  settingDesc: { fontSize: ms(12, 0.3) },
  themeButtons: { flexDirection: "row", gap: s(8) },
  themeButton: {
    paddingVertical: vs(8),
    paddingHorizontal: s(16),
    borderRadius: 8,
    borderWidth: 1,
    borderColor: semanticColors.border,
  },
  themeButtonText: { fontSize: ms(12, 0.3), fontWeight: "600" },
  logoutButton: {
    flexDirection: "row",
    paddingVertical: vs(12),
    paddingHorizontal: s(24),
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: vs(24),
  },
  logoutButtonText: { fontSize: ms(16, 0.3), fontWeight: "700", color: semanticColors.white },

  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: s(24),
  },
  placeholderText: { fontSize: ms(24, 0.3), fontWeight: "700", marginBottom: vs(6) },
  placeholderSub: { fontSize: ms(14, 0.3) },
  primaryButton: {
    paddingVertical: vs(14),
    paddingHorizontal: s(24),
    borderRadius: 12,
  },
  primaryButtonText: { fontSize: ms(16, 0.3), fontWeight: "700", textAlign: "center" },
});
