// Auth context — isLoggedIn, username, dataSource, login/skip/logout handlers
// AppRouter bu context'in isAuthReady + isLoggedIn alanlarini okur

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { authAPI } from "../utils/api";

type DataSource = "aws" | "demo";

interface AuthContextValue {
  isLoggedIn: boolean;
  isAuthReady: boolean;
  username: string;
  dataSource: DataSource;
  handleLogin: (name: string) => void;
  handleSkip: () => void;
  handleLogout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [username, setUsername] = useState("");
  const [dataSource, setDataSource] = useState<DataSource>("demo");

  // Uygulama acilirken auth durumunu kontrol et
  useEffect(() => {
    (async () => {
      try {
        const isAuth = await authAPI.isAuthenticated();
        if (isAuth) {
          setIsLoggedIn(true);
          const user = await authAPI.getStoredUser();
          setUsername(user?.username ?? "User");
          setDataSource("aws");
        } else {
          setIsLoggedIn(false);
          setDataSource("demo");
        }
      } catch (err) {
        console.log("[AUTH] init error:", err);
        setIsLoggedIn(false);
        setDataSource("demo");
      } finally {
        setIsAuthReady(true);
      }
    })();
  }, []);

  const handleLogin = useCallback((name: string) => {
    if (name) setUsername(name);
    setIsLoggedIn(true);
    setDataSource("aws");
  }, []);

  const handleSkip = useCallback(() => {
    setIsLoggedIn(true);
    setDataSource("demo");
  }, []);

  const handleLogout = useCallback(async () => {
    await authAPI.logout();
    setIsLoggedIn(false);
    setDataSource("demo");
    setUsername("");
  }, []);

  const value = useMemo(
    () => ({
      isLoggedIn,
      isAuthReady,
      username,
      dataSource,
      handleLogin,
      handleSkip,
      handleLogout,
    }),
    [isLoggedIn, isAuthReady, username, dataSource, handleLogin, handleSkip, handleLogout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
};
