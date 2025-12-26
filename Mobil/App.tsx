import 'react-native-url-polyfill/auto';
import { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Text, View, TouchableOpacity, Pressable, useWindowDimensions, useColorScheme } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCameraPermissions } from 'expo-camera';
import { SCREEN_TYPE, NAV_ITEMS, ScreenType } from './src/constants';
import { appStyles } from './src/styles';
import { useKeyboard } from './src/hooks/useKeyboard';
import { useChat } from './src/hooks/useChat';
import { getTheme } from './src/utils/theme';
import { ChatWindow } from './src/components/ChatWindow';
import { LoginScreen, HomeScreen, DiseaseScreen, TimetableScreen, SettingsScreen, ThemeMode } from './src/screens';
import { authAPI } from './src/utils/api';

export default function App() {
  const systemColorScheme = useColorScheme();
  const { keyboardHeight } = useKeyboard();
  const { height: windowHeight } = useWindowDimensions();
  const [permission, requestPermission] = useCameraPermissions();
  
  const [screen, setScreen] = useState<ScreenType>(SCREEN_TYPE.LOGIN);
  const [showChat, setShowChat] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>('system');
  const [isLoading, setIsLoading] = useState(true);
  
  const { messages, chatInput, setChatInput, sendMessage } = useChat(setScreen);

  useEffect(() => {
    authAPI.isAuthenticated().then((auth) => {
      if (auth) setScreen(SCREEN_TYPE.HOME);
      setIsLoading(false);
    });
  }, []);

  const isDark = themeMode === 'dark' || (themeMode !== 'light' && systemColorScheme === 'dark');
  const theme = getTheme(isDark);
  const chatHeight = keyboardHeight > 0 ? windowHeight - keyboardHeight - 80 : Math.min(windowHeight * 0.6, 500);

  if (isLoading) {
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

  const handleLogout = async () => {
    await authAPI.logout();
    setThemeMode('system');
    setScreen(SCREEN_TYPE.LOGIN);
  };

  const renderContent = () => {
    switch (screen) {
      case SCREEN_TYPE.LOGIN:
        return <LoginScreen theme={theme} onLoginSuccess={() => setScreen(SCREEN_TYPE.HOME)} onSkip={() => setScreen(SCREEN_TYPE.HOME)} />;
      case SCREEN_TYPE.HOME:
        return <HomeScreen theme={theme} isDark={isDark} />;
      case SCREEN_TYPE.DISEASE:
        return <DiseaseScreen theme={theme} permission={permission} onRequestPermission={requestPermission} />;
      case SCREEN_TYPE.TIMETABLE:
        return <TimetableScreen theme={theme} />;
      case SCREEN_TYPE.SETTINGS:
        return <SettingsScreen theme={theme} isDark={isDark} themeMode={themeMode} onThemeModeChange={setThemeMode} onLogout={handleLogout} />;
      default:
        return null;
    }
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={[appStyles.safeArea, { backgroundColor: theme.background }]}>
        <View style={[appStyles.container, { backgroundColor: theme.background }]}>
          <StatusBar style={isDark ? 'light' : 'dark'} />
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
            <TouchableOpacity style={[appStyles.fab, { backgroundColor: theme.accent }]} onPress={() => setShowChat(true)}>
              <MaterialCommunityIcons name="chat" size={28} color="#fff" />
            </TouchableOpacity>
          )}

          <ChatWindow
            visible={showChat}
            messages={messages}
            chatInput={chatInput}
            chatHeight={chatHeight}
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
