import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Text, View, TouchableOpacity, Pressable, useWindowDimensions } from 'react-native';
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
import { LoginScreen, HomeScreen, DiseaseScreen, TimetableScreen, SettingsScreen } from './src/screens';

export default function App() {
  const { effectiveIsDark, overrideDarkMode, setOverrideDarkMode } = useTheme();
  const { keyboardHeight } = useKeyboard();
  const [screen, setScreen] = useState<ScreenType>(SCREEN_TYPE.LOGIN);
  const [showPopup, setShowPopup] = useState(false);
  const { messages, chatInput, setChatInput, sendMessage } = useChat(setScreen);
  const { height: windowHeight } = useWindowDimensions();
  const [permission, requestPermissionFn] = useCameraPermissions();
  const theme = getTheme(effectiveIsDark);
  const chatHeight = keyboardHeight > 0
    ? windowHeight - keyboardHeight - 80
    : Math.min(windowHeight * 0.6, 500);

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
      return <HomeScreen theme={theme} effectiveIsDark={effectiveIsDark} />;
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
          effectiveIsDark={effectiveIsDark}
          overrideDarkMode={overrideDarkMode}
          onDarkModeChange={setOverrideDarkMode}
          onLogout={() => {
            setOverrideDarkMode(null);
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
          <StatusBar style={effectiveIsDark ? 'light' : 'dark'} />
          {renderContent()}

          {screen !== SCREEN_TYPE.LOGIN && (
            <View style={[appStyles.bottomNavWrapper, { backgroundColor: theme.surface }]}>
              <View style={appStyles.bottomNav}>
                      {NAV_ITEMS
                        .filter((item) => item.id !== SCREEN_TYPE.SETTINGS)
                        .map((item) => (
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
