import { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Text, View, TouchableOpacity, Pressable, useWindowDimensions, useColorScheme, LogBox } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCameraPermissions } from 'expo-camera';
import { SCREEN_TYPE, NAV_ITEMS, ScreenType } from './src/constants';
import { appStyles } from './src/styles';
import { useTheme } from './src/hooks/useTheme';
import { useKeyboard } from './src/hooks/useKeyboard';
import { useChat } from './src/hooks/useChat';
import { getTheme } from './src/utils/theme';
import { ChatWindow } from './src/components/ChatWindow';
import { LoginScreen, HomeScreen, DiseaseScreen, TimetableScreen, SettingsScreen, ThemeMode } from './src/screens';
import { authAPI } from './src/utils/api';

// Suppress SafeAreaView deprecation warnings coming from third-party libs
LogBox.ignoreLogs([
  'SafeAreaView has been deprecated',
  'EXGL',
  'THREE.WebGLRenderer',
]);

export default function App() {
  const systemColorScheme = useColorScheme();
  const { keyboardHeight } = useKeyboard();
  const [screen, setScreen] = useState<ScreenType>(SCREEN_TYPE.LOGIN);
  const [showPopup, setShowPopup] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>('system');
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const { messages, chatInput, setChatInput, sendMessage } = useChat(setScreen);
  const { height: windowHeight } = useWindowDimensions();
  const [permission, requestPermissionFn] = useCameraPermissions();
  
  // Check for existing authentication on app start
  useEffect(() => {
    const checkAuth = async () => {
      const isAuthenticated = await authAPI.isAuthenticated();
      if (isAuthenticated) {
        setScreen(SCREEN_TYPE.HOME);
      }
      setIsCheckingAuth(false);
    };
    checkAuth();
  }, []);
  
  // Determine effective dark mode based on themeMode
  const getEffectiveDarkMode = () => {
    if (themeMode === 'light') return false;
    if (themeMode === 'dark') return true;
    if (themeMode === 'system') {
      // Use systemColorScheme from useColorScheme hook
      return systemColorScheme === 'dark';
    }
    if (themeMode === 'weather') {
      // TODO: Implement weather-based logic
      return systemColorScheme === 'dark';
    }
    return systemColorScheme === 'dark';
  };

  const effectiveIsDarkMode = getEffectiveDarkMode();
  const theme = getTheme(effectiveIsDarkMode);
  const chatHeight = keyboardHeight > 0
    ? windowHeight - keyboardHeight - 80
    : Math.min(windowHeight * 0.6, 500);

  // Show loading screen while checking authentication
  if (isCheckingAuth) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={[appStyles.safeArea, { backgroundColor: theme.background }]}>
          <View style={[appStyles.container, { backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' }]}>
            <Text style={{ color: theme.text }}>Yükleniyor...</Text>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  const requestPermission = async () => {
    try {
      await requestPermissionFn();
    } catch (error) {
      console.error('Camera permission error:', error);
    }
  };

  const renderContent = () => {
    if (screen === SCREEN_TYPE.LOGIN) {
      return (
        <LoginScreen
          theme={theme}
          onLoginSuccess={() => setScreen(SCREEN_TYPE.HOME)}
          onSkip={() => setScreen(SCREEN_TYPE.HOME)}
        />
      );
    }

    if (screen === SCREEN_TYPE.HOME) {
      return <HomeScreen theme={theme} effectiveIsDark={effectiveIsDarkMode} />;
    }

    if (screen === SCREEN_TYPE.DISEASE) {
      return <DiseaseScreen theme={theme} permission={permission} onRequestPermission={requestPermission} />;
    }

    if (screen === SCREEN_TYPE.TIMETABLE) {
      return <TimetableScreen theme={theme} />;
    }

    if (screen === SCREEN_TYPE.SETTINGS) {
      return (
        <SettingsScreen
          theme={theme}
          effectiveIsDark={effectiveIsDarkMode}
          themeMode={themeMode}
          onThemeModeChange={setThemeMode}
          onLogout={async () => {
            await authAPI.logout();
            setThemeMode('system');
            setScreen(SCREEN_TYPE.LOGIN);
          }}
        />
      );
    }

    return null;
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={[appStyles.safeArea, { backgroundColor: theme.background }]}>
        <View style={[appStyles.container, { backgroundColor: theme.background }]}>
          <StatusBar style={effectiveIsDarkMode ? 'light' : 'dark'} />
          {renderContent()}

          {screen !== SCREEN_TYPE.LOGIN && (
            <View style={[appStyles.bottomNavWrapper, { backgroundColor: theme.surface }]}>
              <View style={appStyles.bottomNav}>
                      {NAV_ITEMS.map((item) => (
                  <Pressable
                    key={item.id}
                    style={[
                      appStyles.navItem,
                      screen === item.id && { backgroundColor: theme.accentDim + '22' },
                    ]}
                    onPress={() => setScreen(item.id as ScreenType)}
                  >
                    <MaterialCommunityIcons
                      name={item.icon as any}
                      size={24}
                      color={screen === item.id ? theme.accent : theme.accentDim}
                      style={appStyles.navIcon}
                    />
                    <Text style={[appStyles.navLabel, { color: theme.accentDim }]}>{item.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {screen !== SCREEN_TYPE.LOGIN && (
            <TouchableOpacity
              style={[appStyles.fab, { backgroundColor: theme.accent }]}
              onPress={() => setShowPopup(true)}
            >
              <MaterialCommunityIcons name="chat" size={28} color="#fff" />
            </TouchableOpacity>
          )}

          <ChatWindow
            visible={showPopup}
            messages={messages}
            chatInput={chatInput}
            chatHeight={chatHeight}
            theme={theme}
            onClose={() => setShowPopup(false)}
            onSendMessage={sendMessage}
            onInputChange={setChatInput}
          />
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
