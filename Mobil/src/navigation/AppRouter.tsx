// Auth gate + ana layout — loading/login/main arasinda gecis yapar
// Tablar logged in iken mount'lu, chat overlay showChat iken ustte gozukuyor

import { View, Text, Platform } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useLanguage } from "../context/LanguageContext";
import { useChatContext } from "../context/ChatContext";
import { LoginScreen } from "../screens";
import { AppHeader } from "../components/AppHeader";
import { AppTabs } from "./AppTabs";
import { ChatBubbleLayer } from "../components/ChatBubbleLayer";
import { DraggableAIButtonLayer } from "../components/DraggableAIButtonLayer";
import { ChatOverlay } from "../components/ChatOverlay";
import { appStyles } from "../styles";

export const AppRouter = () => {
  const { isLoggedIn, isAuthReady, handleLogin, handleSkip } = useAuth();
  const { theme, isDark } = useTheme();
  const { t } = useLanguage();
  const { showChat } = useChatContext();

  if (!isAuthReady) {
    return (
      <SafeAreaView
        style={[appStyles.safeArea, { backgroundColor: theme.background }]}
      >
        <View
          className="flex-1 center"
          style={{ backgroundColor: theme.background }}
        >
          <Text className="text-primary">{t.common.loading}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      edges={Platform.OS === "ios" ? ["top", "left", "right"] : undefined}
      style={[appStyles.safeArea, { backgroundColor: theme.background }]}
    >
      <View className="flex-1" style={{ backgroundColor: theme.background }}>
        <StatusBar style={isDark ? "light" : "dark"} />

        {!isLoggedIn ? (
          <LoginScreen
            theme={theme}
            onLoginSuccess={handleLogin}
            onSkip={handleSkip}
          />
        ) : (
          <>
            <View
              className="flex-1"
              style={{ display: showChat ? "none" : "flex" }}
            >
              <AppHeader />
              <AppTabs />
              <ChatBubbleLayer />
              <DraggableAIButtonLayer />
            </View>
            {showChat && <ChatOverlay />}
          </>
        )}
      </View>
    </SafeAreaView>
  );
};
