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
import { authAPI, dashboardAPI, isDemoToken } from "../utils/api";

type DataSource = "aws" | "demo";

// Backend role'u obje ({ role_name }) VEYA string olarak donebilir; ikisini de cozer.
function extractRoleName(role: unknown): string | null {
  if (typeof role === "string") return role;
  if (role && typeof role === "object" && "role_name" in role) {
    const rn = (role as { role_name?: unknown }).role_name;
    return typeof rn === "string" ? rn : null;
  }
  return null;
}

interface AuthContextValue {
  isLoggedIn: boolean;
  isAuthReady: boolean;
  username: string;
  dataSource: DataSource;
  role: string | null;
  isStakeholder: boolean;
  isFarmer: boolean;
  handleLogin: (name: string) => void;
  handleSkip: () => Promise<void>;
  handleLogout: () => Promise<void>;
  // Saklanan user'dan role/username'i yeniden okur — ciftlik olusturunca (stakeholder ->
  // farmer yukseltme) yeni token+user yazildiktan sonra cagrilir.
  refreshFromStorage: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [username, setUsername] = useState("");
  const [dataSource, setDataSource] = useState<DataSource>("demo");
  const [role, setRole] = useState<string | null>(null);

  // Uygulama acilirken auth durumunu kontrol et
  useEffect(() => {
    (async () => {
      try {
        const token = await authAPI.getToken();
        if (token) {
          setIsLoggedIn(true);
          const user = await authAPI.getStoredUser();
          setUsername(user?.username ?? "User");
          setRole(extractRoleName(user?.role));
          setDataSource(isDemoToken(token) ? "demo" : "aws");
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

  const handleLogin = useCallback(async (name: string) => {
    if (name) setUsername(name);
    // login/register, kullanici objesini (role dahil) zaten secure storage'a yazdi
    const user = await authAPI.getStoredUser();
    setRole(extractRoleName(user?.role));
    setIsLoggedIn(true);
    setDataSource("aws");
  }, []);

  // Token yazilmadan flip yaparsak reopen'da AppRouter bizi tekrar Login'e atar
  const handleSkip = useCallback(async () => {
    const user = await authAPI.enterDemoMode();
    setUsername(user.username);
    setRole(extractRoleName(user.role)); // demo -> stakeholder degil, tam erisim
    setDataSource("demo");
    setIsLoggedIn(true);
  }, []);

  const refreshFromStorage = useCallback(async () => {
    const user = await authAPI.getStoredUser();
    if (user?.username) setUsername(user.username);
    setRole(extractRoleName(user?.role));
  }, []);

  const handleLogout = useCallback(async () => {
    await authAPI.logout();
    // Cache temizligi — sonraki user'in eski user'in dashboard verisini
    // onbellekten gormesini onler
    await dashboardAPI.clearCaches();
    setIsLoggedIn(false);
    setDataSource("demo");
    setUsername("");
    setRole(null);
  }, []);

  const value = useMemo(
    () => ({
      isLoggedIn,
      isAuthReady,
      username,
      dataSource,
      role,
      isStakeholder: role === "stakeholder",
      isFarmer: role === "farmer",
      handleLogin,
      handleSkip,
      handleLogout,
      refreshFromStorage,
    }),
    [isLoggedIn, isAuthReady, username, dataSource, role, handleLogin, handleSkip, handleLogout, refreshFromStorage],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
};
