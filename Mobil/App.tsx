import { Suspense, useState } from 'react';
import { Canvas } from '@react-three/fiber/native';
import { StatusBar } from 'expo-status-bar';
import { Text, View, TouchableOpacity, Pressable, TextInput, useWindowDimensions } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ColorPlane } from './Plane';
import { SCREEN_TYPE, NAV_ITEMS, HEADER_TEXT, ScreenType } from './src/constants';
import { appStyles } from './src/styles';
import { useTheme } from './src/hooks/useTheme';
import { useKeyboard } from './src/hooks/useKeyboard';
import { useChat } from './src/hooks/useChat';
import { getTheme } from './src/utils/theme';
import { ChatWindow } from './src/components/ChatWindow';

export default function App() {
  const { effectiveIsDark, overrideDarkMode, setOverrideDarkMode } = useTheme();
  const { keyboardHeight } = useKeyboard();
  const [screen, setScreen] = useState<ScreenType>(SCREEN_TYPE.LOGIN);
  const [showPopup, setShowPopup] = useState(false);
  const { messages, chatInput, setChatInput, sendMessage } = useChat(setScreen);
  const { height: windowHeight } = useWindowDimensions();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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

  const renderLoginScreen = () => (
    <View style={[appStyles.loginContainer, { backgroundColor: theme.background }]}>
      <MaterialCommunityIcons name="hospital-box" size={64} color={theme.accent} style={{ marginBottom: 24 }} />
      <Text style={[appStyles.loginTitle, { color: theme.text }]}>TARAS</Text>
      <Text style={[appStyles.loginSubtitle, { color: theme.textSecondary }]}>
        Tarım Dijital İkiz Platformu
      </Text>
      <TextInput
        style={[appStyles.loginInput, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.accentDim }]}
        placeholder="E-posta"
        placeholderTextColor={theme.textSecondary}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
      />
      <TextInput
        style={[appStyles.loginInput, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.accentDim }]}
        placeholder="Şifre"
        placeholderTextColor={theme.textSecondary}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <TouchableOpacity
        style={[appStyles.loginButton, { backgroundColor: theme.accent }]}
        onPress={() => {
          setEmail('');
          setPassword('');
          setScreen(SCREEN_TYPE.HOME);
        }}
      >
        <Text style={[appStyles.loginButtonText, { color: '#fff' }]}>Giriş Yap</Text>
      </TouchableOpacity>
      <TouchableOpacity style={{ marginTop: 16 }} onPress={() => {
        setEmail('');
        setPassword('');
        setScreen(SCREEN_TYPE.HOME);
      }}>
        <Text style={[appStyles.skipButtonText, { color: theme.accentDim }]}>Şimdilik Atla</Text>
      </TouchableOpacity>
    </View>
  );

  const renderHomeScreen = () => (
    <>
      <View style={appStyles.header}>
        <Text style={[appStyles.headerTitle, { color: theme.accent }]}>{HEADER_TEXT.home}</Text>
        <Text style={[appStyles.headerSubtitle, { color: theme.textSecondary }]}>
          Döndürmek için sürükleyin • Rengi değiştirmek için dokunun
        </Text>
      </View>
      <View style={appStyles.spacer} />
      <View style={appStyles.canvasContainer}>
        <Canvas camera={{ position: [0, 8, 11.3], fov: 50 }} style={{ flex: 1 }}>
          <color attach="background" args={[theme.background]} />
          <Suspense fallback={null}>
            <ColorPlane isDark={effectiveIsDark} />
          </Suspense>
        </Canvas>
      </View>
    </>
  );

  const renderDiseaseScreen = () => {
    if (!permission) {
      return (
        <View style={[appStyles.placeholder, { backgroundColor: theme.background }]}>
          <Text style={[appStyles.placeholderText, { color: theme.text }]}>Kamera İzni</Text>
          <TouchableOpacity
            style={[appStyles.primaryButton, { backgroundColor: theme.accent, marginTop: 24 }]}
            onPress={requestPermission}
          >
            <Text style={[appStyles.primaryButtonText, { color: theme.background }]}>İzin Ver</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (!permission.granted) {
      return (
        <View style={[appStyles.placeholder, { backgroundColor: theme.background }]}>
          <Text style={[appStyles.placeholderText, { color: theme.text }]}>Kamera Erişimi Reddedildi</Text>
          <Text style={[appStyles.placeholderSub, { color: theme.textSecondary, marginBottom: 24 }]}>
            Bu özelliği kullanmak için cihaz ayarlarında kamera izinlerini etkinleştirin.
          </Text>
          <TouchableOpacity
            style={[appStyles.primaryButton, { backgroundColor: theme.accent }]}
            onPress={requestPermission}
          >
            <Text style={[appStyles.primaryButtonText, { color: theme.background }]}>Yeniden Dene</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={[appStyles.cameraContainer, { backgroundColor: theme.background }]}>
        <View style={[appStyles.cameraBorderContainer, { borderColor: theme.accent }]}>
          <CameraView style={appStyles.cameraView} facing="back" />
        </View>
      </View>
    );
  };

  const renderSettingsScreen = () => (
    <View style={[appStyles.settingsContainer, { backgroundColor: theme.background }]}>
      <Text style={[appStyles.placeholderText, { color: theme.text }]}>Ayarlar</Text>
      <Text style={[appStyles.placeholderSub, { color: theme.textSecondary, marginBottom: 32 }]}>
        Tercihlerinizi yönetin
      </Text>
      <View style={[appStyles.settingItem, { borderBottomColor: theme.surface }]}>
        <View style={appStyles.settingLeft}>
          <MaterialCommunityIcons
            name={effectiveIsDark ? 'moon-waning-crescent' : 'white-balance-sunny'}
            size={24}
            color={theme.accent}
            style={{ marginRight: 12 }}
          />
          <View>
            <Text style={[appStyles.settingLabel, { color: theme.text }]}>Koyu Mod</Text>
            <Text style={[appStyles.settingDesc, { color: theme.textSecondary }]}>
              {overrideDarkMode !== null
                ? (overrideDarkMode ? 'Açık' : 'Kapalı')
                : 'Sistem'}
            </Text>
          </View>
        </View>
        <View style={appStyles.themeButtons}>
          <TouchableOpacity
            style={[appStyles.themeButton, overrideDarkMode === false && { backgroundColor: theme.accent }]}
            onPress={() => setOverrideDarkMode(false)}
          >
            <Text style={[appStyles.themeButtonText, { color: overrideDarkMode === false ? '#fff' : theme.text }]}>
              Açık
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[appStyles.themeButton, overrideDarkMode === true && { backgroundColor: theme.accent }]}
            onPress={() => setOverrideDarkMode(true)}
          >
            <Text style={[appStyles.themeButtonText, { color: overrideDarkMode === true ? '#fff' : theme.text }]}>
              Koyu
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      <TouchableOpacity
        style={[appStyles.logoutButton, { backgroundColor: '#ef4444' }]}
        onPress={() => {
          setOverrideDarkMode(null);
          setScreen(SCREEN_TYPE.LOGIN);
        }}
      >
        <MaterialCommunityIcons name="logout" size={20} color="#fff" style={{ marginRight: 8 }} />
        <Text style={appStyles.logoutButtonText}>Çıkış Yap</Text>
      </TouchableOpacity>
    </View>
  );

  const renderContent = () => {
    if (screen === SCREEN_TYPE.LOGIN) return renderLoginScreen();
    if (screen === SCREEN_TYPE.HOME) return renderHomeScreen();
    
    const screenKey = screen as Exclude<ScreenType, 'login' | 'home'>;
    if (screenKey === 'disease') return renderDiseaseScreen();
    if (screenKey === 'settings') return renderSettingsScreen();

    return (
      <View style={[appStyles.placeholder, { backgroundColor: theme.background }]}>
        <Text style={[appStyles.placeholderText, { color: theme.text }]}>{HEADER_TEXT[screenKey]}</Text>
        <Text style={[appStyles.placeholderSub, { color: theme.textSecondary }]}>
          İçerik yakında gelecek.
        </Text>
      </View>
    );
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
