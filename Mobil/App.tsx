// Ana uygulama - ekran yonetimi, tema, navigasyon
// LanguageProvider ve PopupMessageProvider ile sarmalanmis

import "./global.css";
import "react-native-url-polyfill/auto";

// React
import { useState, useEffect, useRef } from "react";

// React Native
import { LogBox } from "react-native";
LogBox.ignoreLogs([
  "EXGL",
  "Cannot read property 'name' of undefined",
  "SafeAreaView has been deprecated",
]);
import {
  Text,
  View,
  TouchableOpacity,
  useWindowDimensions,
  useColorScheme,
  Animated,
  ScrollView,
  StyleSheet,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView, SafeAreaProvider } from "react-native-safe-area-context";

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

// Components
import { ChatWindow } from "./src/components/ChatWindow";
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
  sensorAPI,
  FieldSummary,
  DashboardData,
} from "./src/utils/api";
import { getDemoFields, generateDemoDashboardData } from "./src/utils/demoData";
import {
  spacing,
  getHeaderDimensions,
  getProfileButtonSize,
  useResponsive,
} from "./src/utils/responsive";

// Assets
import LogoLight from "./src/assets/Taras-logo-light.svg";
import LogoDark from "./src/assets/Taras-logo-dark.svg";

function AppContent() {
  // ── Hooks ──────────────────────────────────────────────────────────────
  const systemColorScheme = useColorScheme();
  const { keyboardHeight } = useKeyboard();
  const { height: windowHeight } = useWindowDimensions();
  const [permission, requestPermission] = useCameraPermissions();
  const { showPopup } = usePopupMessage();
  const { t } = useLanguage();

  // ── State ──────────────────────────────────────────────────────────────
  const [screen, setScreen] = useState<ScreenType>(SCREEN_TYPE.LOGIN);
  const [showChat, setShowChat] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [username, setUsername] = useState<string>("");
  const [dataSource, setDataSource] = useState<"aws" | "demo">("demo");
  const [fields, setFields] = useState<FieldSummary[]>([]);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [fieldSelectorOpen, setFieldSelectorOpen] = useState(false);

  // ── Responsive / derived ───────────────────────────────────────────────
  const { screenWidth } = useResponsive();
  const headerDims = getHeaderDimensions(screenWidth);
  const profileButtonSize = getProfileButtonSize(headerDims.logoSize);
  const { messages, chatInput, setChatInput, sendMessage } = useChat(setScreen, selectedZoneId);

  // ── Animated values ────────────────────────────────────────────────────
  const screenOpacities = useRef({
    [SCREEN_TYPE.CARBON]: new Animated.Value(0),
    [SCREEN_TYPE.TIMETABLE]: new Animated.Value(0),
    [SCREEN_TYPE.HOME]: new Animated.Value(0),
    [SCREEN_TYPE.DISEASE]: new Animated.Value(0),
    [SCREEN_TYPE.SETTINGS]: new Animated.Value(0),
  }).current;

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
          // Chat icin ilk zone_id'yi al
          try {
            const zonesRes = await sensorAPI.getUserZones();
            if (zonesRes.success && zonesRes.data?.zones?.[0]) {
              setSelectedZoneId(zonesRes.data.zones[0].zone_id);
            }
          } catch {
            // Zone alinamadi, chat demo modunda calisir
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
  }, []);

  useEffect(() => {
    if (isLoading || screen === SCREEN_TYPE.LOGIN) return;

    const screenTypes = [
      SCREEN_TYPE.CARBON,
      SCREEN_TYPE.TIMETABLE,
      SCREEN_TYPE.HOME,
      SCREEN_TYPE.DISEASE,
      SCREEN_TYPE.SETTINGS,
    ];
    screenTypes.forEach((screenType) => {
      Animated.timing(screenOpacities[screenType], {
        toValue: screen === screenType ? 1 : 0,
        duration: 120,
        useNativeDriver: true,
      }).start();
    });
  }, [screen, screenOpacities, isLoading]);

  // ── Computed values ────────────────────────────────────────────────────
  const isDark =
    themeMode === "dark" ||
    (themeMode !== "light" && systemColorScheme === "dark");
  const theme = getTheme(isDark);

  const chatHeight =
    keyboardHeight > 0
      ? windowHeight - keyboardHeight - 80
      : Math.min(windowHeight * 0.6, 500);

  // ── Loading screen ─────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={[appStyles.safeArea, { backgroundColor: theme.background }]}>
          <View style={[appStyles.container, styles.centered, { backgroundColor: theme.background }]}>
            <Text style={{ color: theme.text }}>{t.common.loading}</Text>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
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
  const AnimatedScreen = ({
    screenType,
    children,
  }: {
    screenType: ScreenType;
    children: React.ReactNode;
  }) => (
    <Animated.View
      style={[styles.screenLayer, { opacity: screenOpacities[screenType] }]}
      pointerEvents={screen === screenType ? "auto" : "none"}
    >
      {children}
    </Animated.View>
  );

  const FieldSelector = () => {
    if (fields.length === 0) return null;
    return (
      <View style={styles.fieldSelectorContainer}>
        <TouchableOpacity
          onPress={() => setFieldSelectorOpen(!fieldSelectorOpen)}
          style={[styles.fieldSelectorButton, { backgroundColor: theme.surface, borderColor: theme.accent + "30" }]}
        >
          <View style={styles.fieldSelectorButtonContent}>
            <Ionicons name="leaf" size={14} color={theme.accent} />
            <Text style={[styles.fieldSelectorLabel, { color: theme.text }]} numberOfLines={1}>
              {fields.find((f) => f.id === selectedFieldId)?.name ?? t.home.selectField}
            </Text>
          </View>
          <Ionicons
            name={fieldSelectorOpen ? "chevron-up" : "chevron-down"}
            size={14}
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
                    <Ionicons name="leaf-outline" size={14} color={theme.textSecondary} style={styles.fieldSelectorItemIcon} />
                    <Text style={[styles.fieldSelectorItemLabel, { color: theme.text }]}>{field.name}</Text>
                  </TouchableOpacity>
                ))}
            </ScrollView>
          </View>
        )}
      </View>
    );
  };

  const AppHeader = () => (
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
        <FieldSelector />
      </View>

      <View style={[styles.headerRight, { marginRight: headerDims.elementGap }]}>
        <View style={[styles.dataSourceBadge, { backgroundColor: dataSource === "aws" ? "#10b981" : "#f59e0b" }]}>
          <Text style={styles.dataSourceBadgeText}>
            {dataSource === "aws" ? t.home.dataSourceAWS : t.home.dataSourceDemo}
          </Text>
        </View>
        <ProfileButton username={username} theme={theme} size={profileButtonSize} />
      </View>
    </View>
  );

  const BottomNav = () => (
    <View style={[appStyles.bottomNavWrapper, { backgroundColor: theme.surface }]}>
      <View style={appStyles.bottomNav}>
        {NAV_ITEMS.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={[appStyles.navItem, screen === item.id && { backgroundColor: theme.accentDim + "22" }]}
            onPress={() => setScreen(item.id as ScreenType)}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons
              name={item.icon as any}
              size={24}
              color={screen === item.id ? theme.accent : theme.accentDim}
              style={appStyles.navIcon}
            />
            <Text style={[appStyles.navLabel, { color: theme.accentDim }]}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  // ── Render ─────────────────────────────────────────────────────────────
  const isLoggedIn = screen !== SCREEN_TYPE.LOGIN;

  return (
    <SafeAreaProvider>
      <SafeAreaView style={[appStyles.safeArea, { backgroundColor: theme.background }]}>
        <View style={[appStyles.container, { backgroundColor: theme.background }]}>
          <StatusBar style={isDark ? "light" : "dark"} />

          {!isLoggedIn ? (
            <LoginScreen theme={theme} onLoginSuccess={handleLoginSuccess} onSkip={handleSkip} />
          ) : (
            <>
              <AppHeader />
              <View style={styles.screensContainer}>
                <AnimatedScreen screenType={SCREEN_TYPE.CARBON}>
                  <CarbonFootprintScreen theme={theme} />
                </AnimatedScreen>
                <AnimatedScreen screenType={SCREEN_TYPE.TIMETABLE}>
                  <TimetableScreen theme={theme} isActive={screen === SCREEN_TYPE.TIMETABLE} selectedFieldId={selectedFieldId} />
                </AnimatedScreen>
                <AnimatedScreen screenType={SCREEN_TYPE.HOME}>
                  <HomeScreen theme={theme} isDark={isDark} dashboardData={dashboardData} isActive={screen === SCREEN_TYPE.HOME} />
                </AnimatedScreen>
                <AnimatedScreen screenType={SCREEN_TYPE.DISEASE}>
                  <DiseaseScreen theme={theme} permission={permission} onRequestPermission={requestPermission} isActive={screen === SCREEN_TYPE.DISEASE} />
                </AnimatedScreen>
                <AnimatedScreen screenType={SCREEN_TYPE.SETTINGS}>
                  <SettingsScreen theme={theme} isDark={isDark} themeMode={themeMode} onThemeModeChange={setThemeMode} onLogout={handleLogout} />
                </AnimatedScreen>
              </View>
            </>
          )}

          {isLoggedIn && <BottomNav />}

          {isLoggedIn && (
            <TouchableOpacity
              style={[appStyles.fab, { backgroundColor: theme.accent }]}
              onPress={() => setShowChat(true)}
            >
              <MaterialCommunityIcons name="chat" size={28} color="#fff" />
            </TouchableOpacity>
          )}

          <ChatWindow
            visible={showChat}
            messages={messages}
            chatInput={chatInput}
            chatHeight={chatHeight}
            keyboardHeight={keyboardHeight}
            theme={theme}
            onClose={() => setShowChat(false)}
            onSendMessage={sendMessage}
            onInputChange={setChatInput}
          />
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <PopupMessageProvider>
        <AppContent />
      </PopupMessageProvider>
    </LanguageProvider>
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
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  fieldSelectorButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 6,
  },
  fieldSelectorLabel: {
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
  fieldSelectorChevron: {
    marginLeft: 6,
  },
  fieldSelectorDropdown: {
    position: "absolute",
    top: 38,
    left: 0,
    right: 0,
    borderRadius: 8,
    borderWidth: 1,
    maxHeight: 200,
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
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  fieldSelectorItemIcon: {
    marginRight: 8,
  },
  fieldSelectorItemLabel: {
    fontSize: 13,
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
});
