// Ana uygulama - ekran yonetimi, tema, navigasyon
// LanguageProvider ve PopupMessageProvider ile sarmalanmis

import "./global.css";
import "react-native-url-polyfill/auto";
import { useState, useEffect, useRef } from "react";
import { StatusBar } from "expo-status-bar";
import {
  Text,
  View,
  TouchableOpacity,
  useWindowDimensions,
  useColorScheme,
  Animated,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, SafeAreaProvider } from "react-native-safe-area-context";

import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useCameraPermissions } from "expo-camera";
import { SCREEN_TYPE, NAV_ITEMS, ScreenType } from "./src/constants";
import { appStyles } from "./src/styles";
import { useKeyboard } from "./src/hooks/useKeyboard";
import { useChat } from "./src/hooks/useChat";
import { getTheme } from "./src/utils/theme";
import { ChatWindow } from "./src/components/ChatWindow";

import {
  LoginScreen,
  HomeScreen,
  DiseaseScreen,
  TimetableScreen,
  SettingsScreen,
  CarbonFootprintScreen,
  ThemeMode,
} from "./src/screens";
import {
  authAPI,
  dashboardAPI,
  FieldSummary,
  DashboardData,
} from "./src/utils/api";
import { getDemoFields, generateDemoDashboardData } from "./src/utils/demoData";
import {
  PopupMessageProvider,
  usePopupMessage,
} from "./src/context/PopupMessageContext";
import { LanguageProvider, useLanguage } from "./src/context/LanguageContext";
import { ProfileButton } from "./src/components/ProfileButton";
import LogoLight from "./src/assets/Taras-logo-light.svg";
import LogoDark from "./src/assets/Taras-logo-dark.svg";
import {
  spacing,
  getHeaderDimensions,
  getProfileButtonSize,
  useResponsive,
} from "./src/utils/responsive";

function AppContent() {
  const systemColorScheme = useColorScheme();
  const { keyboardHeight } = useKeyboard();
  const { height: windowHeight } = useWindowDimensions();
  const [permission, requestPermission] = useCameraPermissions();
  const { showPopup } = usePopupMessage();
  const { t } = useLanguage();

  const [screen, setScreen] = useState<ScreenType>(SCREEN_TYPE.LOGIN);
  const [showChat, setShowChat] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [username, setUsername] = useState<string>("");
  const [dataSource, setDataSource] = useState<"aws" | "demo">("demo");
  const [fields, setFields] = useState<FieldSummary[]>([]);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(
    null,
  );
  const [fieldSelectorOpen, setFieldSelectorOpen] = useState(false);

  const { screenWidth } = useResponsive();
  const headerDims = getHeaderDimensions(screenWidth);
  const profileButtonSize = getProfileButtonSize(headerDims.logoSize);

  const { messages, chatInput, setChatInput, sendMessage } = useChat(setScreen);

  // Animated values for each screen
  const screenOpacities = useRef({
    [SCREEN_TYPE.CARBON]: new Animated.Value(0),
    [SCREEN_TYPE.TIMETABLE]: new Animated.Value(0),
    [SCREEN_TYPE.HOME]: new Animated.Value(0),
    [SCREEN_TYPE.DISEASE]: new Animated.Value(0),
    [SCREEN_TYPE.SETTINGS]: new Animated.Value(0),
  }).current;

  // Tarla secimi degistiginde dashboard verisi yukle
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

  useEffect(() => {
    const initialize = async () => {
      const isAuth = await authAPI.isAuthenticated();

      if (isAuth) {
        setScreen(SCREEN_TYPE.HOME);
        const user = await authAPI.getStoredUser();
        setUsername(user?.username ?? "User");
        setDataSource("aws");

        // Tarla listesini yukle
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
        // Demo mod
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

  const isDark =
    themeMode === "dark" ||
    (themeMode !== "light" && systemColorScheme === "dark");
  const theme = getTheme(isDark);

  const chatHeight =
    keyboardHeight > 0
      ? windowHeight - keyboardHeight - 80
      : Math.min(windowHeight * 0.6, 500);

  // Animate screen transitions - must be before early return to maintain hook order
  useEffect(() => {
    if (isLoading) return; // Skip animation while loading
    if (screen === SCREEN_TYPE.LOGIN) return; // Skip animation on login screen

    const validScreenTypes = [
      SCREEN_TYPE.CARBON,
      SCREEN_TYPE.TIMETABLE,
      SCREEN_TYPE.HOME,
      SCREEN_TYPE.DISEASE,
      SCREEN_TYPE.SETTINGS,
    ];
    validScreenTypes.forEach((screenType) => {
      Animated.timing(screenOpacities[screenType], {
        toValue: screen === screenType ? 1 : 0,
        duration: 120,
        useNativeDriver: true,
      }).start();
    });
  }, [screen, screenOpacities, isLoading]);

  if (isLoading) {
    return (
      <SafeAreaProvider>
        <SafeAreaView
          style={[appStyles.safeArea, { backgroundColor: theme.background }]}
        >
          <View
            style={[
              appStyles.container,
              {
                backgroundColor: theme.background,
                justifyContent: "center",
                alignItems: "center",
              },
            ]}
          >
            <Text style={{ color: theme.text }}>{t.common.loading}</Text>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  const handleLogout = async () => {
    await authAPI.logout();
    setScreen(SCREEN_TYPE.LOGIN);
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView
        style={[appStyles.safeArea, { backgroundColor: theme.background }]}
      >
        <View
          style={[appStyles.container, { backgroundColor: theme.background }]}
        >
          <StatusBar style={isDark ? "light" : "dark"} />
          {screen === SCREEN_TYPE.LOGIN ? (
            <LoginScreen
              theme={theme}
              onLoginSuccess={async (name) => {
                if (name) {
                  showPopup(`${t.login.welcomeMessage}, ${name}`);
                  setUsername(name);
                }
                setScreen(SCREEN_TYPE.HOME);
                setDataSource("aws");

                // Reload fields from API after login
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
              }}
              onSkip={() => {
                setScreen(SCREEN_TYPE.HOME);
                setDataSource("demo");
              }}
            />
          ) : (
            <>
              {/* Global Header */}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingHorizontal: headerDims.headerPadding,
                  paddingTop: headerDims.headerTopPadding,
                  paddingBottom: spacing.xs,
                  backgroundColor: theme.background,
                  zIndex: 1000,
                }}
              >
                <View style={{ marginLeft: headerDims.elementGap }}>
                  {isDark ? (
                    <LogoDark
                      width={headerDims.logoSize}
                      height={headerDims.logoSize}
                    />
                  ) : (
                    <LogoLight
                      width={headerDims.logoSize}
                      height={headerDims.logoSize}
                    />
                  )}
                </View>

                {/* Field Selector */}
                {fields.length > 0 && (
                  <View
                    style={{
                      flex: 1,
                      position: "relative",
                      marginHorizontal: spacing.sm,
                    }}
                  >
                    <TouchableOpacity
                      onPress={() => setFieldSelectorOpen(!fieldSelectorOpen)}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        paddingVertical: 6,
                        paddingHorizontal: 12,
                        backgroundColor: theme.surface,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: theme.accent + "30",
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          flex: 1,
                          gap: 6,
                        }}
                      >
                        <Ionicons name="leaf" size={14} color={theme.accent} />
                        <Text
                          style={{
                            color: theme.text,
                            fontSize: 13,
                            fontWeight: "600",
                            flex: 1,
                          }}
                          numberOfLines={1}
                        >
                          {fields.find((f) => f.id === selectedFieldId)?.name ??
                            t.home.selectField}
                        </Text>
                      </View>
                      <Ionicons
                        name={fieldSelectorOpen ? "chevron-up" : "chevron-down"}
                        size={14}
                        color={theme.textSecondary}
                        style={{ marginLeft: 6 }}
                      />
                    </TouchableOpacity>

                    {/* Dropdown menu */}
                    {fieldSelectorOpen && (
                      <View
                        style={{
                          position: "absolute",
                          top: 38,
                          left: 0,
                          right: 0,
                          backgroundColor: theme.surface,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: theme.accent + "30",
                          maxHeight: 200,
                          overflow: "hidden",
                          zIndex: 1001,
                          elevation: 10,
                          shadowColor: "#000",
                          shadowOffset: { width: 0, height: 4 },
                          shadowOpacity: 0.15,
                          shadowRadius: 8,
                        }}
                      >
                        <ScrollView
                          bounces={false}
                          showsVerticalScrollIndicator={false}
                        >
                          {fields
                            .filter((field) => field.id !== selectedFieldId)
                            .map((field, index, arr) => (
                              <TouchableOpacity
                                key={field.id}
                                onPress={() => handleFieldSelect(field.id)}
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  paddingHorizontal: 12,
                                  paddingVertical: 10,
                                  borderBottomWidth:
                                    index < arr.length - 1 ? 1 : 0,
                                  borderBottomColor: theme.accent + "15",
                                }}
                                activeOpacity={0.7}
                              >
                                <Ionicons
                                  name="leaf-outline"
                                  size={14}
                                  color={theme.textSecondary}
                                  style={{ marginRight: 8 }}
                                />
                                <Text
                                  style={{
                                    color: theme.text,
                                    fontSize: 13,
                                    fontWeight: "500",
                                  }}
                                >
                                  {field.name}
                                </Text>
                              </TouchableOpacity>
                            ))}
                        </ScrollView>
                      </View>
                    )}
                  </View>
                )}

                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginRight: headerDims.elementGap,
                    gap: 8,
                  }}
                >
                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 6,
                      backgroundColor:
                        dataSource === "aws" ? "#10b981" : "#f59e0b",
                    }}
                  >
                    <Text
                      style={{ color: "#fff", fontSize: 10, fontWeight: "600" }}
                    >
                      {dataSource === "aws"
                        ? t.home.dataSourceAWS
                        : t.home.dataSourceDemo}
                    </Text>
                  </View>
                  <ProfileButton
                    username={username}
                    theme={theme}
                    size={profileButtonSize}
                  />
                </View>
              </View>

              {/* All screens pre-mounted, visibility controlled by animated opacity */}
              <View style={{ flex: 1, position: "relative" }}>
                <Animated.View
                  key={SCREEN_TYPE.CARBON}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    opacity: screenOpacities[SCREEN_TYPE.CARBON],
                  }}
                  pointerEvents={
                    screen === SCREEN_TYPE.CARBON ? "auto" : "none"
                  }
                >
                  <CarbonFootprintScreen theme={theme} />
                </Animated.View>

                <Animated.View
                  key={SCREEN_TYPE.TIMETABLE}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    opacity: screenOpacities[SCREEN_TYPE.TIMETABLE],
                  }}
                  pointerEvents={
                    screen === SCREEN_TYPE.TIMETABLE ? "auto" : "none"
                  }
                >
                  <TimetableScreen
                    theme={theme}
                    isActive={screen === SCREEN_TYPE.TIMETABLE}
                    selectedFieldId={selectedFieldId}
                  />
                </Animated.View>

                <Animated.View
                  key={SCREEN_TYPE.HOME}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    opacity: screenOpacities[SCREEN_TYPE.HOME],
                  }}
                  pointerEvents={screen === SCREEN_TYPE.HOME ? "auto" : "none"}
                >
                  <HomeScreen
                    theme={theme}
                    isDark={isDark}
                    dashboardData={dashboardData}
                    isActive={screen === SCREEN_TYPE.HOME}
                  />
                </Animated.View>

                <Animated.View
                  key={SCREEN_TYPE.DISEASE}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    opacity: screenOpacities[SCREEN_TYPE.DISEASE],
                  }}
                  pointerEvents={
                    screen === SCREEN_TYPE.DISEASE ? "auto" : "none"
                  }
                >
                  <DiseaseScreen
                    theme={theme}
                    permission={permission}
                    onRequestPermission={requestPermission}
                    isActive={screen === SCREEN_TYPE.DISEASE}
                  />
                </Animated.View>

                <Animated.View
                  key={SCREEN_TYPE.SETTINGS}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    opacity: screenOpacities[SCREEN_TYPE.SETTINGS],
                  }}
                  pointerEvents={
                    screen === SCREEN_TYPE.SETTINGS ? "auto" : "none"
                  }
                >
                  <SettingsScreen
                    theme={theme}
                    isDark={isDark}
                    themeMode={themeMode}
                    onThemeModeChange={setThemeMode}
                    onLogout={handleLogout}
                  />
                </Animated.View>
              </View>
            </>
          )}

          {screen !== SCREEN_TYPE.LOGIN && (
            <View
              style={[
                appStyles.bottomNavWrapper,
                { backgroundColor: theme.surface },
              ]}
            >
              <View style={appStyles.bottomNav}>
                {NAV_ITEMS.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      appStyles.navItem,
                      screen === item.id && {
                        backgroundColor: theme.accentDim + "22",
                      },
                    ]}
                    onPress={() => setScreen(item.id as ScreenType)}
                    activeOpacity={0.7}
                  >
                    <MaterialCommunityIcons
                      name={item.icon as any}
                      size={24}
                      color={
                        screen === item.id ? theme.accent : theme.accentDim
                      }
                      style={appStyles.navIcon}
                    />
                    <Text
                      style={[appStyles.navLabel, { color: theme.accentDim }]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {screen !== SCREEN_TYPE.LOGIN && (
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
