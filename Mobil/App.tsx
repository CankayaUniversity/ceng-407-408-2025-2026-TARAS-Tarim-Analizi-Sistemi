// Uygulama giris noktasi — provider agaci + AppRouter
// Tum state slice'lari context'lerde, App.tsx sadece orchestration

import "react-native-gesture-handler";
import "./global.css";
import "react-native-url-polyfill/auto";

// react-native-screens v4 defaults freeze=ON (React Suspense). On Android +
// Fabric this causes a popping screen's content to blank out the moment its
// activityState transitions, before the native slide animation completes.
// Disabling it globally keeps inactive screens fully rendered until they
// actually unmount.
import { enableFreeze } from "react-native-screens";
enableFreeze(false);

// Bilinen kutuphane uyarilari — uygulama islevselligini etkilemez
import { LogBox } from "react-native";
const SUPPRESSED = [
  "EXGL",
  "SafeAreaView has been deprecated",
  "WebGLUniforms",
  "InteractionManager has been deprecated",
];
LogBox.ignoreLogs(SUPPRESSED);
if (__DEV__) {
  const _log = console.log.bind(console);
  console.log = (...args: unknown[]) => {
    const msg = String(args[0] ?? "");
    if (SUPPRESSED.some((s) => msg.includes(s))) return;
    _log(...args);
  };
  const _warn = console.warn.bind(console);
  console.warn = (...args: unknown[]) => {
    const msg = String(args[0] ?? "");
    if (SUPPRESSED.some((s) => msg.includes(s))) return;
    _warn(...args);
  };
  const _error = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const msg = String(args[0] ?? "");
    if (SUPPRESSED.some((s) => msg.includes(s))) return;
    _error(...args);
  };
}

import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { LanguageProvider } from "./src/context/LanguageContext";
import { PopupMessageProvider, GlobalToast } from "./src/context/PopupMessageContext";
import { AuthProvider } from "./src/context/AuthContext";
import { ThemeProvider } from "./src/context/ThemeContext";
import { ConfirmProvider } from "./src/context/ConfirmContext";
import { DashboardProvider } from "./src/context/DashboardContext";
import { ChatProvider } from "./src/context/ChatContext";
import { SectionFocusProvider } from "./src/context/SectionFocusContext";
import { TimetableFilterProvider } from "./src/context/TimetableFilterContext";
import { TabBarPopOutProvider } from "./src/context/TabBarPopOutContext";
import { TabResetProvider } from "./src/context/TabResetContext";
import { AppRouter } from "./src/navigation/AppRouter";

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <SafeAreaProvider>
          <LanguageProvider>
          <PopupMessageProvider>
            <AuthProvider>
              <ThemeProvider>
                <ConfirmProvider>
                  <DashboardProvider>
                    <SectionFocusProvider>
                      <TimetableFilterProvider>
                        <ChatProvider>
                          <TabBarPopOutProvider>
                            <TabResetProvider>
                              <AppRouter />
                              {/* Toast'u tema agacinin ICINDE ciz — PopupMessageProvider
                                  ThemeProvider'in ustunde, orada useTheme yok. Kokteki kopya
                                  (sekmelerin uzerinde); modallarin ustu icin FullScreenModal
                                  kendi kopyasini cizer. */}
                              <GlobalToast />
                            </TabResetProvider>
                          </TabBarPopOutProvider>
                        </ChatProvider>
                      </TimetableFilterProvider>
                    </SectionFocusProvider>
                  </DashboardProvider>
                </ConfirmProvider>
              </ThemeProvider>
            </AuthProvider>
          </PopupMessageProvider>
          </LanguageProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
