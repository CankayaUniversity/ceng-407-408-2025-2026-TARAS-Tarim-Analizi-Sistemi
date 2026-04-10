// Ana uygulama - ekran yonetimi, tema, navigasyon
// LanguageProvider ve PopupMessageProvider ile sarmalanmis

import "./global.css";
import "react-native-url-polyfill/auto";

// Bilinen kutuphane uyarilari — uygulama islevselligini etkilemez
import { LogBox } from "react-native";
const SUPPRESSED = ["EXGL", "SafeAreaView has been deprecated", "WebGLUniforms"];
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

// React
import { useState, useEffect, useMemo } from "react";

// React Native
import {
  Text,
  View,
  TouchableOpacity,
  useWindowDimensions,
  useColorScheme,
  AppState,
  ScrollView,
  StyleSheet,
  Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as NavigationBar from "expo-navigation-bar";
import { SafeAreaView, SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";

// Third-party
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useCameraPermissions } from "expo-camera";

// Screens
import {
  LoginScreen,
  HomeScreen,
  DiseaseScreen,
  TimetableScreen,
  SettingsScreen,
  CarbonFootprintScreen,
  ThemeMode,
} from "./src/screens";
import { HardwareSetupModal } from "./src/screens/Settings/HardwareSetupModal";

// Components
import { ChatWindow } from "./src/components/ChatWindow";
import { ChatBubble } from "./src/components/ChatBubble";
import { DraggableAIButton } from "./src/components/DraggableAIButton";
import { ProfileButton } from "./src/components/ProfileButton";

// Context
import {
  PopupMessageProvider,
  usePopupMessage,
} from "./src/context/PopupMessageContext";
import { LanguageProvider, useLanguage } from "./src/context/LanguageContext";

// Hooks
import { useKeyboard } from "./src/hooks/useKeyboard";
import { useChat } from "./src/hooks/useChat";

// Utils & constants
import { SCREEN_TYPE, NAV_ITEMS, ScreenType } from "./src/constants";
import { appStyles } from "./src/styles";
import { getTheme } from "./src/utils/theme";
import {
  authAPI,
  dashboardAPI,
  socketAPI,
  FieldSummary,
  DashboardData,
} from "./src/utils/api";
import { getDemoFields, generateDemoDashboardData } from "./src/utils/demoData";
import {
  spacing,
  s,
  vs,
  ms,
  getHeaderDimensions,
  getProfileButtonSize,
  useResponsive,
} from "./src/utils/responsive";

// Assets
import LogoLight from "./src/assets/Taras-logo-light.svg";
import LogoDark from "./src/assets/Taras-logo-dark.svg";

function AppContent() {
  // ── Hooks ──────────────────────────────────────────────────────────────
  const insets = useSafeAreaInsets();
  const systemColorScheme = useColorScheme();
  useKeyboard();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [permission, requestPermission] = useCameraPermissions();
  const { showPopup } = usePopupMessage();
  const { t } = useLanguage();

  // ── State ──────────────────────────────────────────────────────────────
  const [screen, setScreen] = useState<ScreenType>(SCREEN_TYPE.LOGIN);
  const [showChat, setShowChat] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [username, setUsername] = useState<string>("");
  const [dataSource, setDataSource] = useState<"aws" | "demo">("demo");
  const [fields, setFields] = useState<FieldSummary[]>([]);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [showHardwareSetup, setShowHardwareSetup] = useState(false);
  const [fieldSelectorOpen, setFieldSelectorOpen] = useState(false);

  // ── Responsive / derived ───────────────────────────────────────────────
  const { screenWidth } = useResponsive();
  const headerDims = getHeaderDimensions(screenWidth);
  const profileButtonSize = getProfileButtonSize(headerDims.logoSize);
  const { messages, chatInput, setChatInput, sendMessage, isLoading: chatLoading, startNewChat, pendingBubble, clearPendingBubble, historySessions, isLoadingHistory, loadHistory, loadSessionById } = useChat(setScreen, selectedFieldId);

  // AI buton konumu ve LLM navigasyon
  const [aiSpotIndex, setAiSpotIndex] = useState(0);
  const [aiMoveTarget, setAiMoveTarget] = useState<number | null>(null);

  useEffect(() => {
    if (pendingBubble) {
      setShowChat(false);
      // LLM navigasyon olunca buton karsi tarafa zipla
      setAiMoveTarget(aiSpotIndex === 0 ? 1 : 0);
    }
  }, [pendingBubble]);

  // ── Data helpers ───────────────────────────────────────────────────────
  const loadDashboardData = async (fieldId: string, isDemo: boolean) => {
    try {
      if (isDemo) {
        setDashboardData(generateDemoDashboardData(fieldId));
      } else {
        const data = await dashboardAPI.getFieldDashboard(fieldId);
        setDashboardData(data);
      }
    } catch {
      setDashboardData(generateDemoDashboardData(fieldId));
    }
  };

  // Pull-to-refresh state
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async () => {
    if (!selectedFieldId) return;
    setRefreshing(true);
    await loadDashboardData(selectedFieldId, dataSource === "demo");
    setRefreshing(false);
  };

  // Uygulama on plana gelince veri guncelle
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && selectedFieldId && dataSource === "aws") {
        loadDashboardData(selectedFieldId, false);
      }
    });
    return () => sub.remove();
  }, [selectedFieldId, dataSource]);

  const handleFieldSelect = async (fieldId: string) => {
    setSelectedFieldId(fieldId);
    setFieldSelectorOpen(false);
    await loadDashboardData(fieldId, dataSource === "demo");
  };

  // ── Effects ────────────────────────────────────────────────────────────
  useEffect(() => {
    const initialize = async () => {
      const isAuth = await authAPI.isAuthenticated();

      if (isAuth) {
        setScreen(SCREEN_TYPE.HOME);
        const user = await authAPI.getStoredUser();
        setUsername(user?.username ?? "User");
        setDataSource("aws");

        try {
          const fieldsData = await dashboardAPI.getFields();
          if (fieldsData && fieldsData.length > 0) {
            setFields(fieldsData);
            setSelectedFieldId(fieldsData[0].id);
            await loadDashboardData(fieldsData[0].id, false);
          }
        } catch {
          // AWS baglantisi basarisiz, demo moduna gec
          const demoFields = getDemoFields();
          setFields(demoFields);
          setSelectedFieldId(demoFields[0].id);
          setDataSource("demo");
          await loadDashboardData(demoFields[0].id, true);
        }
      } else {
        setDataSource("demo");
        const demoFields = getDemoFields();
        setFields(demoFields);
        if (demoFields.length > 0) {
          setSelectedFieldId(demoFields[0].id);
          await loadDashboardData(demoFields[0].id, true);
        }
      }
      setIsLoading(false);
    };

    initialize();

    // Sensor ariza bildirimi dinle
    const sensorErrors: Record<number, string> = { 1: "SHT31", 2: "Toprak nemi", 3: "SHT31 + Toprak nemi" };
    const cleanupAlert = socketAPI.onSensorAlert((data) => {
      const name = sensorErrors[data.errorCode] || `Kod ${data.errorCode}`;
      showPopup(`Sensor ariza: ${data.macAddress} — ${name} sensoru basarisiz`);
    });

    return () => { cleanupAlert(); };
  }, []);

  // ── Computed values ────────────────────────────────────────────────────
  const isDark =
    themeMode === "dark" ||
    (themeMode !== "light" && systemColorScheme === "dark");
  const theme = useMemo(() => getTheme(isDark), [isDark]);

  // Android navigasyon cubugu buton rengini tema ile esle
  useEffect(() => {
    NavigationBar.setButtonStyleAsync(isDark ? "light" : "dark");
  }, [isDark]);


  const navBottom = insets.bottom > 20 ? 8 : Math.max(insets.bottom + 4, 8);
  const aiSize = s(54);
  // AI buton pozisyonu: nav bar ustunde, sabit gap
  const aiBottomOffset = navBottom + vs(60) + vs(12);
  const navBarY = windowHeight - insets.top - aiBottomOffset - aiSize;
  const aiSafeSpots = useMemo(() => [
    { x: windowWidth - aiSize - s(16), y: navBarY },
    { x: s(16), y: navBarY },
  ], [windowWidth, navBarY, aiSize]);

  // ── Loading screen ─────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <SafeAreaView style={[appStyles.safeArea, { backgroundColor: theme.background }]}>
        <View style={[appStyles.container, styles.centered, { backgroundColor: theme.background }]}>
          <Text style={{ color: theme.text }}>{t.common.loading}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Handlers ───────────────────────────────────────────────────────────
  const handleLogout = async () => {
    await authAPI.logout();
    setScreen(SCREEN_TYPE.LOGIN);
  };

  const handleLoginSuccess = async (name: string) => {
    if (name) {
      showPopup(`${t.login.welcomeMessage}, ${name}`);
      setUsername(name);
    }
    setScreen(SCREEN_TYPE.HOME);
    setDataSource("aws");
    try {
      const fieldsData = await dashboardAPI.getFields();
      if (fieldsData && fieldsData.length > 0) {
        setFields(fieldsData);
        setSelectedFieldId(fieldsData[0].id);
        await loadDashboardData(fieldsData[0].id, false);
      }
    } catch (err) {
      console.log("[APP] failed to load fields after login:", err);
    }
  };

  const handleSkip = () => {
    setScreen(SCREEN_TYPE.HOME);
    setDataSource("demo");
  };


  // ── Local components ───────────────────────────────────────────────────
  // AnimatedScreen JSX helper — inline component OLMAMALI, remount yapar
  const renderScreen = (): React.ReactNode => {
    switch (screen) {
      case SCREEN_TYPE.CARBON:
        return <CarbonFootprintScreen theme={theme} />;
      case SCREEN_TYPE.TIMETABLE:
        return <TimetableScreen theme={theme} isActive selectedFieldId={selectedFieldId} />;
      case SCREEN_TYPE.HOME:
        return <HomeScreen theme={theme} isDark={isDark} dashboardData={dashboardData} isActive refreshing={refreshing} onRefresh={handleRefresh} />;
      case SCREEN_TYPE.DISEASE:
        return <DiseaseScreen theme={theme} permission={permission} onRequestPermission={requestPermission} isActive />;
      case SCREEN_TYPE.SETTINGS:
        return <SettingsScreen theme={theme} isDark={isDark} themeMode={themeMode} onThemeModeChange={setThemeMode} onLogout={handleLogout} onHardwareSetup={() => setShowHardwareSetup(true)} />;
      default:
        return null;
    }
  };

  // Header ve FieldSelector JSX olarak inline — fonksiyon component olarak
  // tanimlanirsa React her renderda unmount/remount yapar ve 3D flicker olur
  const fieldSelectorJSX = fields.length > 0 ? (
    <View style={styles.fieldSelectorContainer}>
      <TouchableOpacity
        onPress={() => setFieldSelectorOpen(!fieldSelectorOpen)}
        style={[styles.fieldSelectorButton, { backgroundColor: theme.surface, borderColor: theme.accent + "30" }]}
      >
        <View style={styles.fieldSelectorButtonContent}>
          <Ionicons name="leaf" size={ms(14, 0.3)} color={theme.accent} />
          <Text style={[styles.fieldSelectorLabel, { color: theme.text }]} numberOfLines={1}>
            {fields.find((f) => f.id === selectedFieldId)?.name ?? t.home.selectField}
          </Text>
        </View>
        <Ionicons
          name={fieldSelectorOpen ? "chevron-up" : "chevron-down"}
          size={ms(14, 0.3)}
          color={theme.textSecondary}
          style={styles.fieldSelectorChevron}
        />
      </TouchableOpacity>

      {fieldSelectorOpen && (
        <View style={[styles.fieldSelectorDropdown, { backgroundColor: theme.surface, borderColor: theme.accent + "30" }]}>
          <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
            {fields
              .filter((f) => f.id !== selectedFieldId)
              .map((field, index, arr) => (
                <TouchableOpacity
                  key={field.id}
                  onPress={() => handleFieldSelect(field.id)}
                  style={[
                    styles.fieldSelectorItem,
                    index < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.accent + "15" },
                  ]}
                  activeOpacity={0.7}
                >
                  <Ionicons name="leaf-outline" size={ms(14, 0.3)} color={theme.textSecondary} style={styles.fieldSelectorItemIcon} />
                  <Text style={[styles.fieldSelectorItemLabel, { color: theme.text }]}>{field.name}</Text>
                </TouchableOpacity>
              ))}
          </ScrollView>
        </View>
      )}
    </View>
  ) : null;

  const appHeaderJSX = (
    <View
      style={[
        styles.headerRow,
        {
          paddingHorizontal: headerDims.headerPadding,
          paddingTop: headerDims.headerTopPadding,
          paddingBottom: spacing.xs,
          backgroundColor: theme.background,
        },
      ]}
    >
      <View style={{ marginLeft: headerDims.elementGap }}>
        {isDark
          ? <LogoDark width={headerDims.logoSize} height={headerDims.logoSize} />
          : <LogoLight width={headerDims.logoSize} height={headerDims.logoSize} />}
      </View>

      <View style={[styles.fieldSelectorWrapper, { marginHorizontal: spacing.sm }]}>
        {fieldSelectorJSX}
      </View>

      <View style={[styles.headerRight, { marginRight: headerDims.elementGap }]}>
        <View style={[styles.dataSourceBadge, { backgroundColor: dataSource === "aws" ? theme.accent : theme.accentDim }]}>
          <Text style={styles.dataSourceBadgeText}>
            {dataSource === "aws" ? t.home.dataSourceAWS : t.home.dataSourceDemo}
          </Text>
        </View>
        <ProfileButton username={username} theme={theme} size={profileButtonSize} />
      </View>
    </View>
  );

  const bottomNavJSX = (
    <View
      style={[
        styles.navBar,
        {
          backgroundColor: theme.surface,
          marginBottom: navBottom,
          shadowColor: isDark ? "#000" : "#334155",
        },
      ]}
    >
      {NAV_ITEMS.map((item) => {
        const isActive = screen === item.id;
        return (
          <TouchableOpacity
            key={item.id}
            style={[
              styles.navTab,
              isActive && { backgroundColor: theme.accent + "22" },
            ]}
            onPress={() => setScreen(item.id as ScreenType)}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons
              name={item.icon as any}
              size={ms(20, 0.3)}
              color={isActive ? theme.accent : theme.accentDim}
            />
            <Text
              style={[
                styles.navLabel,
                { color: isActive ? theme.accent : theme.accentDim },
              ]}
              numberOfLines={1}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  // ── Render ─────────────────────────────────────────────────────────────
  const isLoggedIn = screen !== SCREEN_TYPE.LOGIN;

  return (
    <SafeAreaView
      edges={Platform.OS === "ios" ? ["top", "left", "right"] : undefined}
      style={[appStyles.safeArea, { backgroundColor: theme.background }]}
    >
        <View style={[appStyles.container, { backgroundColor: theme.background }]}>
          <StatusBar style={isDark ? "light" : "dark"} />

          {!isLoggedIn ? (
            <LoginScreen theme={theme} onLoginSuccess={handleLoginSuccess} onSkip={handleSkip} />
          ) : showChat ? (
            /* Tam ekran sohbet — header, nav bar ve AI butonu gizli */
            <ChatWindow
              messages={messages}
              chatInput={chatInput}
              theme={theme}
              isLoading={chatLoading}
              onClose={() => setShowChat(false)}
              onSendMessage={sendMessage}
              onInputChange={setChatInput}
              onNewChat={startNewChat}
              historySessions={historySessions}
              isLoadingHistory={isLoadingHistory}
              onLoadHistory={loadHistory}
              onSelectSession={loadSessionById}
            />
          ) : (
            <>
              {appHeaderJSX}
              <View style={styles.screensContainer}>
                {renderScreen()}
              </View>

              {bottomNavJSX}

              <ChatBubble
                message={pendingBubble?.text ?? ""}
                visible={!!pendingBubble}
                theme={theme}
                bottom={windowHeight - insets.top - navBarY + s(8)}
                onPress={() => { clearPendingBubble(); setShowChat(true); }}
                onDismiss={clearPendingBubble}
              />
              <DraggableAIButton
                theme={theme}
                onPress={() => { clearPendingBubble(); setShowChat(true); }}
                safeSpots={aiSafeSpots}
                moveToSpot={aiMoveTarget}
                onMoveComplete={() => setAiMoveTarget(null)}
                onSpotChanged={setAiSpotIndex}
              />
            </>
          )}

          <HardwareSetupModal
            visible={showHardwareSetup}
            theme={theme}
            onClose={() => setShowHardwareSetup(false)}
          />
        </View>
      </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <PopupMessageProvider>
          <AppContent />
        </PopupMessageProvider>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },

  // Header
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    zIndex: 1000,
  },
  fieldSelectorWrapper: {
    flex: 1,
    position: "relative",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dataSourceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  dataSourceBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "600",
  },

  // Field selector
  fieldSelectorContainer: {
    flex: 1,
    position: "relative",
  },
  fieldSelectorButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: vs(6),
    paddingHorizontal: s(12),
    borderRadius: 8,
    borderWidth: 1,
  },
  fieldSelectorButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: s(6),
  },
  fieldSelectorLabel: {
    fontSize: ms(13, 0.3),
    fontWeight: "600",
    flex: 1,
  },
  fieldSelectorChevron: {
    marginLeft: s(6),
  },
  fieldSelectorDropdown: {
    position: "absolute",
    top: vs(38),
    left: 0,
    right: 0,
    borderRadius: 8,
    borderWidth: 1,
    maxHeight: vs(200),
    overflow: "hidden",
    zIndex: 1001,
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  fieldSelectorItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: s(12),
    paddingVertical: vs(10),
  },
  fieldSelectorItemIcon: {
    marginRight: s(8),
  },
  fieldSelectorItemLabel: {
    fontSize: ms(13, 0.3),
    fontWeight: "500",
  },

  // Screen container and layers
  screensContainer: {
    flex: 1,
    position: "relative",
  },
  screenLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },

  // Bottom navigation
  navBar: {
    flexDirection: "row",
    marginHorizontal: s(12),
    borderRadius: 24,
    padding: s(4),
    elevation: 10,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
  },
  navTab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: vs(12),
    borderRadius: 20,
    marginHorizontal: s(2),
  },
  navLabel: {
    fontSize: ms(10, 0.3),
    fontWeight: "600",
    marginTop: vs(3),
  },
});
