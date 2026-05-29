// API katmani - tum backend baglantilari
// Moduller: authAPI, sensorAPI, socketAPI, imagesAPI, healthAPI, dashboardAPI, diseaseAPI
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { io, Socket } from "socket.io-client";
import type { FieldData } from "./fieldPlaceholder";

import { fetchWithTimeout } from "./fetchWithTimeout";
import { secureSet, secureGet, secureRemove } from "./secureStorage";
import type { CarbonLog } from "../screens/CarbonFootprint/types";

// Environment variables from app.config.js
export const API_HOST = Constants.expoConfig?.extra?.apiHost || "";
const DEMO_USERNAME = Constants.expoConfig?.extra?.demoUsername || "";
const DEMO_PASSWORD = Constants.expoConfig?.extra?.demoPassword || "";

const API_BASE_URL = `${API_HOST}/api`;
const TOKEN_KEY = "auth_token";
const USER_DATA_KEY = "user_data";

// Demo modu sentinel — gorulurse API modulleri backend yerine demo dallarina gider.
export const DEMO_TOKEN = "DEMO_MODE_TOKEN";
export const isDemoToken = (t: string | null | undefined): boolean =>
  t === DEMO_TOKEN;

let socket: Socket | null = null;

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  // HTTP durum kodu — bazi cagrilar (profil duzenleme) hatayi koda gore yerellestirir.
  status?: number;
}

interface User {
  user_id: number;
  username: string;
  email: string;
  role: string;
}

interface LoginData {
  token: string;
  user: User;
}

interface ProfileData extends User {
  farms: any[];
  unread_alerts: number;
  dataset_consent?: boolean;
}

interface SensorReading {
  id: string;
  node_id: string;
  created_at: string;
  temperature: number | null;
  humidity: number | null;
  sm_percent: number | null;
  raw_sm_value: number | null;
  et0_instant: number | null;
}

export interface Zone {
  zone_id: string;
  zone_name: string;
  field_id: string;
  field_name: string;
  farm_id?: string;
  farm_name: string;
}

export interface ZoneDetailsData {
  zone_id: string;
  name: string;
  adaptive_config: {
    current_kc: number;
    target_sm_percent: number;
    critical_sm_percent?: number;
  } | null;
  active_plantings: Array<{
    crop_name: string;
    growth_stage: string;
  }>;
  recent_kc_calibrations: unknown[];
}

// Token ile header olustur
async function getAuthHeaders() {
  const token = await secureGet(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : null;
}

// Yetkili API istegi yap
async function authFetch<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  const headers = await getAuthHeaders();
  if (!headers) return { success: false, error: "Oturum bulunamadı" };

  const url = `${API_BASE_URL}${endpoint}`;
  console.log("[API]", options.method || "GET", endpoint);

  try {
    const res = await fetchWithTimeout(
      url,
      { ...options, headers: { ...headers, ...options.headers } },
      15000,
    );

    if (!res.ok) {
      const errorText = await res.text();
      console.log("[API] err:", res.status, errorText.slice(0, 100));
      return { success: false, error: `HTTP ${res.status}: ${errorText}` };
    }

    const data = await res.json();
    if (!data.success) {
      console.log("[API] fail:", data.error);
    }
    return data;
  } catch (error) {
    console.log(
      "[API] err:",
      error instanceof Error ? error.message : "unknown",
    );
    return {
      success: false,
      error:
        "Bağlantı hatası: " +
        (error instanceof Error ? error.message : "Bilinmeyen hata"),
    };
  }
}

async function persistDemoSession(username: string): Promise<User> {
  const demoUser: User = {
    user_id: 0,
    username: username || "Demo",
    email: "test@local.demo",
    role: "demo",
  };
  await secureSet(TOKEN_KEY, DEMO_TOKEN);
  await secureSet(USER_DATA_KEY, JSON.stringify(demoUser));
  return demoUser;
}

// Giris/kayit islemleri
export const authAPI = {
  async login(
    username: string,
    password: string,
  ): Promise<ApiResponse<LoginData>> {
    // Demo kullanici - offline mod
    if (
      username.toLowerCase() === DEMO_USERNAME.toLowerCase() &&
      password === DEMO_PASSWORD
    ) {
      const demoUser = await persistDemoSession(DEMO_USERNAME);
      return { success: true, data: { token: DEMO_TOKEN, user: demoUser } };
    }

    try {
      console.log("[AUTH] login:", username);
      const res = await fetchWithTimeout(
        `${API_BASE_URL}/auth/login`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        },
        15000,
      );

      const data = await res.json();
      if (data.success && data.data?.token) {
        await secureSet(TOKEN_KEY, data.data.token);
        if (data.data?.user) {
          await secureSet(USER_DATA_KEY, JSON.stringify(data.data.user));
        }
      }
      return data;
    } catch (error) {
      console.log("[AUTH] err:", error);
      return { success: false, error: "Sunucuya bağlanılamadı" };
    }
  },

  async register(
    username: string,
    email: string,
    password: string,
  ): Promise<ApiResponse<LoginData>> {
    try {
      console.log("[AUTH] register:", username);
      // Rol kayitta secilmez — herkes stakeholder (salt-okunur) baslar; ilk ciftligini
      // olusturunca farmer'a yukselir, davet koduyla katilirsa stakeholder kalir.
      const res = await fetchWithTimeout(
        `${API_BASE_URL}/auth/register`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username,
            email,
            password,
          }),
        },
        15000,
      );
      const data = await res.json();

      if (data.success && data.data?.token) {
        await secureSet(TOKEN_KEY, data.data.token);
        if (data.data?.user) {
          await secureSet(USER_DATA_KEY, JSON.stringify(data.data.user));
        }
      }
      return data;
    } catch (error) {
      console.log("[AUTH] err:", error);
      return { success: false, error: "Sunucuya bağlanılamadı" };
    }
  },

  async getProfile(): Promise<ApiResponse<ProfileData>> {
    return authFetch("/auth/me");
  },

  // Profil guncelle (kullanici adi ve/veya e-posta). currentPassword ZORUNLU — backend dogrular.
  // Username degisirse backend yeni token doner (token icindeki username bayatlamasin); her
  // durumda saklanan user'in ad/e-postasini tazeleriz (UI buradan okur). login/register gibi
  // her statuste json'i parse ederiz ki backend'in temiz hata mesaji UI'a ulassin (status da
  // doner — UI 401/409'u yerellestirir).
  async updateProfile(data: {
    username?: string;
    email?: string;
    currentPassword: string;
  }): Promise<ApiResponse<{ username: string; email: string }>> {
    try {
      const headers = await getAuthHeaders();
      if (!headers) return { success: false, error: "Oturum bulunamadı" };

      console.log("[AUTH] updateProfile");
      const res = await fetchWithTimeout(
        `${API_BASE_URL}/auth/me`,
        {
          method: "PATCH",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
        15000,
      );

      const body = await res.json();
      if (body.success && body.data) {
        if (body.data.token) {
          await secureSet(TOKEN_KEY, body.data.token);
        }
        // Saklanan user'i guncel ad/e-posta ile tazele (token degismese bile)
        try {
          const storedJson = await secureGet(USER_DATA_KEY);
          if (storedJson) {
            const stored = JSON.parse(storedJson);
            stored.username = body.data.username;
            stored.email = body.data.email;
            await secureSet(USER_DATA_KEY, JSON.stringify(stored));
          }
        } catch {
          // sessizce yut
        }
      }
      return { ...body, status: res.status };
    } catch (error) {
      console.log("[AUTH] err:", error);
      return { success: false, error: "Sunucuya bağlanılamadı" };
    }
  },

  // Sifre degistir — mevcut + yeni sifre. Backend mevcut sifreyi dogrular, yeni >= 8 olmali.
  // status doner ki UI "mevcut sifre yanlis" (401) durumunu yerellestirebilsin.
  async changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<ApiResponse<null>> {
    try {
      const headers = await getAuthHeaders();
      if (!headers) return { success: false, error: "Oturum bulunamadı" };

      console.log("[AUTH] changePassword");
      const res = await fetchWithTimeout(
        `${API_BASE_URL}/auth/change-password`,
        {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ currentPassword, newPassword }),
        },
        15000,
      );
      const body = await res.json();
      return { ...body, status: res.status };
    } catch (error) {
      console.log("[AUTH] err:", error);
      return { success: false, error: "Sunucuya bağlanılamadı" };
    }
  },

  async updateDatasetConsent(
    consent: boolean,
  ): Promise<ApiResponse<{ dataset_consent: boolean }>> {
    return authFetch("/auth/me/dataset-consent", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consent }),
    });
  },

  async getStoredUser(): Promise<User | null> {
    try {
      const userJson = await secureGet(USER_DATA_KEY);
      return userJson ? JSON.parse(userJson) : null;
    } catch {
      return null;
    }
  },

  async logout() {
    const token = await secureGet(TOKEN_KEY);
    await secureRemove(TOKEN_KEY);
    await secureRemove(USER_DATA_KEY);
    // Demo oturumu kapatiyorsak yerel demo state'ini de sil
    if (isDemoToken(token)) {
      try {
        const { clearAll } = await import("./demo/demoStorage");
        await clearAll();
      } catch {
        // sessizce yut
      }
    }
  },

  async enterDemoMode(): Promise<User> {
    return persistDemoSession(DEMO_USERNAME || "Demo");
  },

  async getToken() {
    return secureGet(TOKEN_KEY);
  },

  async isAuthenticated() {
    const token = await secureGet(TOKEN_KEY);
    return !!token;
  },
};

// Paydas (stakeholder) davet + uyelik islemleri
export interface StakeholderFarm {
  farm_id: string;
  name: string;
  owner_username: string | null;
}

export interface FarmStakeholderRow {
  user_id: string;
  username: string | null;
  // "owner" (farms.user_id'den) veya FarmRole ("stakeholder")
  role: string;
  is_owner: boolean;
  created_at: string | null;
}

export type FarmMemberRole = "stakeholder" | "farmer";
// listFarms'in dondurdugu erisim turu: sahip (Farm.user_id) + uyelik rolleri.
export type FarmAccessRole = "owner" | FarmMemberRole;

export interface FarmInviteRow {
  invite_id: string;
  code: string;
  role: FarmMemberRole;
  status: "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";
  expires_at: string;
  created_at: string | null;
}

export const stakeholderAPI = {
  // Ciftci: ciftlik icin tek kullanimlik davet kodu uret (invite_id de doner — iptal icin).
  // role: kodun verecegi rol (stakeholder=salt-okunur, farmer=operasyonel). Vars. stakeholder.
  async createInvite(
    farmId: string,
    role: FarmMemberRole = "stakeholder",
    ttlDays?: number,
  ): Promise<ApiResponse<{ invite_id: string; code: string; expires_at: string }>> {
    return authFetch(`/stakeholder/farms/${farmId}/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, ...(ttlDays ? { ttlDays } : {}) }),
    });
  },

  // Ciftci: henuz kullanilmamis (PENDING) davet kodunu iptal et
  async revokeInvite(
    inviteId: string,
  ): Promise<ApiResponse<{ message?: string }>> {
    return authFetch(`/stakeholder/invites/${inviteId}/revoke`, {
      method: "POST",
    });
  },

  // Davet kodunu kullan, ciftlige erisim kazan. Farmer-davet ise backend yeni token+user doner —
  // sakla ki hesap rolu (foto gonderme/onboarding kapilari) bu oturumda guncellensin (createFarm
  // ile ayni desen). Caller sonrasinda AuthContext.refreshFromStorage() cagirmali.
  async acceptInvite(
    code: string,
  ): Promise<ApiResponse<{ farm_id: string; farm_name: string; role?: FarmMemberRole }>> {
    const res = await authFetch<{
      farm_id: string;
      farm_name: string;
      role?: FarmMemberRole;
      token?: string;
      user?: unknown;
    }>(`/stakeholder/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });

    if (res.success && res.data?.token) {
      await secureSet(TOKEN_KEY, res.data.token);
      if (res.data.user) {
        await secureSet(USER_DATA_KEY, JSON.stringify(res.data.user));
      }
    }
    if (res.success && res.data) {
      return {
        success: true,
        data: { farm_id: res.data.farm_id, farm_name: res.data.farm_name, role: res.data.role },
      };
    }
    return res as ApiResponse<{ farm_id: string; farm_name: string; role?: FarmMemberRole }>;
  },

  // Paydas: gorebildigi ciftlikler (uyelik kayitlari)
  async getMyFarms(): Promise<ApiResponse<StakeholderFarm[]>> {
    return authFetch(`/stakeholder/farms`);
  },

  // Uyeler: ciftligin tum uyeleri (sahip + paydaslar) + rolleri — erisimi olan herkes okur
  async listStakeholders(
    farmId: string,
  ): Promise<ApiResponse<FarmStakeholderRow[]>> {
    return authFetch(`/stakeholder/farms/${farmId}/stakeholders`);
  },

  // Ciftci: ciftligin tum davet kodlari (kod + durum + son kullanim)
  async listInvites(
    farmId: string,
  ): Promise<ApiResponse<FarmInviteRow[]>> {
    return authFetch(`/stakeholder/farms/${farmId}/invites`);
  },

  // Ciftci: bir uyenin erisimini iptal et (kaldir)
  async revokeStakeholder(
    farmId: string,
    userId: string,
  ): Promise<ApiResponse<{ message?: string }>> {
    return authFetch(`/stakeholder/farms/${farmId}/stakeholders/${userId}`, {
      method: "DELETE",
    });
  },

  // Ciftci: bir uyenin rolunu degistir (stakeholder <-> farmer)
  async changeMemberRole(
    farmId: string,
    userId: string,
    role: FarmMemberRole,
  ): Promise<ApiResponse<{ message?: string }>> {
    return authFetch(`/stakeholder/farms/${farmId}/members/${userId}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
  },
};

// Sensor veri islemleri
export const sensorAPI = {
  async getUserZones(): Promise<ApiResponse<{ zones: Zone[] }>> {
    const token = await secureGet(TOKEN_KEY);
    if (isDemoToken(token)) {
      const { getDemoZones } = await import("./demo/demoData");
      return { success: true, data: { zones: getDemoZones() } };
    }
    return authFetch("/sensors/zones");
  },

  async getZoneSensors(zoneId: string) {
    const token = await secureGet(TOKEN_KEY);
    if (isDemoToken(token)) {
      const { generateDemoZoneLatest } = await import("./demo/demoData");
      return { success: true, data: generateDemoZoneLatest(zoneId) };
    }
    return authFetch<{
      zone_id: string;
      zone_name: string;
      sensors: Array<{
        sensor_node_id: string;
        sensor_type: string;
        latest_reading?: SensorReading;
      }>;
    }>(`/sensors/zone/${zoneId}/latest`);
  },

  async getZoneHistory(zoneId: string, hours = 24) {
    const token = await secureGet(TOKEN_KEY);
    if (isDemoToken(token)) {
      const { generateDemoSensorHistory } = await import("./demo/demoData");
      const fieldId = zoneId.replace("demo-zone-", "");
      const hist = generateDemoSensorHistory(fieldId, hours);
      return {
        success: true,
        data: {
          zone_id: zoneId,
          zone_name: hist.field_name,
          readings: hist.readings,
        },
      };
    }
    const endTime = new Date().toISOString();
    const startTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    return authFetch<{
      zone_id: string;
      zone_name: string;
      readings: SensorReading[];
    }>(`/sensors/zone/${zoneId}/history?startTime=${encodeURIComponent(startTime)}&endTime=${encodeURIComponent(endTime)}`);
  },

  async getZoneDetails(zoneId: string): Promise<ApiResponse<ZoneDetailsData>> {
    const token = await secureGet(TOKEN_KEY);
    if (isDemoToken(token)) {
      return {
        success: true,
        data: {
          zone_id: zoneId,
          name: "Bölge 1",
          adaptive_config: { current_kc: 1.05, target_sm_percent: 60, critical_sm_percent: 30 },
          active_plantings: [{ crop_name: "Domates", growth_stage: "vegetative" }],
          recent_kc_calibrations: [],
        },
      };
    }
    return authFetch<ZoneDetailsData>(`/sensors/zone/${zoneId}/details`);
  },

  async getFieldHistory(fieldId: string, hours = 72) {
    const token = await secureGet(TOKEN_KEY);
    if (isDemoToken(token)) {
      const { generateDemoSensorHistory } = await import("./demo/demoData");
      return { success: true, data: generateDemoSensorHistory(fieldId, hours) };
    }
    return authFetch<{
      field_id: string;
      field_name: string;
      hours: number;
      reading_count: number;
      readings: SensorReading[];
    }>(`/sensors/field/${fieldId}/history?hours=${hours}`);
  },
};

export interface SensorDataEvent {
  sensor_node_id: string;
  sensor_type: string;
  value: number;
  unit: string;
  timestamp: string;
}

// WebSocket baglantisi
export const socketAPI = {
  async connect(): Promise<Socket | null> {
    const token = await secureGet(TOKEN_KEY);
    if (!token) return null;
    if (isDemoToken(token)) return null;
    if (socket?.connected) return socket;

    console.log("[SOCKET] connect:", API_HOST);

    socket = io(API_HOST, {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 20000,
      forceNew: true,
    });

    socket.on("connect", () => console.log("[SOCKET] connected"));
    socket.on("connect_error", (error) =>
      console.log("[SOCKET] err:", error.message),
    );

    return socket;
  },

  onSensorData(callback: (data: SensorDataEvent) => void) {
    socket?.on("sensor-data", callback);
  },

  offSensorData(callback?: (data: SensorDataEvent) => void) {
    callback
      ? socket?.off("sensor-data", callback)
      : socket?.off("sensor-data");
  },

  disconnect() {
    socket?.disconnect();
    socket = null;
  },

  isConnected: () => socket?.connected ?? false,
  getSocket: () => socket,

  // Donanim eslestirme olaylarini dinle
  onPairingEvents: (callbacks: {
    onNodeDiscovered?: (data: any) => void;
    onPairComplete?: (data: any) => void;
  }) => {
    if (!socket) return () => {};
    if (callbacks.onNodeDiscovered) {
      socket.on("node_discovered", callbacks.onNodeDiscovered);
    }
    if (callbacks.onPairComplete) {
      socket.on("pair_complete", callbacks.onPairComplete);
    }
    return () => {
      if (callbacks.onNodeDiscovered) {
        socket?.off("node_discovered", callbacks.onNodeDiscovered);
      }
      if (callbacks.onPairComplete) {
        socket?.off("pair_complete", callbacks.onPairComplete);
      }
    };
  },

  onSensorAlert: (callback: (data: { sensorNodeId: string; macAddress: string; errorCode: number }) => void) => {
    if (!socket) return () => {};
    const handler = (data: Record<string, unknown>) => {
      if (data.type === "sensor-alert") callback(data as any);
    };
    socket.on("sensor-update", handler);
    return () => { socket?.off("sensor-update", handler); };
  },
};

// Gorsel yukleme
export const imagesAPI = {
  async upload(imageUri: string, fileName = "image.jpg") {
    const token = await secureGet(TOKEN_KEY);
    if (!token) return { success: false, error: "Oturum bulunamadı" };

    const formData = new FormData();
    formData.append("image", {
      uri: imageUri,
      type: "image/jpeg",
      name: fileName,
    } as any);

    try {
      const res = await fetchWithTimeout(
        `${API_BASE_URL}/images/upload`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "multipart/form-data",
          },
          body: formData,
        },
        30000,
      );
      return res.json();
    } catch (error) {
      console.log("[IMAGE] upload err:", error);
      return { success: false, error: "Görsel yüklenemedi" };
    }
  },

  async list() {
    return authFetch<
      Array<{ image_id: string; url: string; created_at: string }>
    >("/images");
  },
};

// Sunucu saglik kontrolu
export const healthAPI = {
  async check() {
    try {
      const res = await fetchWithTimeout(`${API_HOST}/health`, {}, 10000);
      const data = await res.json();
      return { success: true, status: data.status || "ok" };
    } catch (error) {
      console.log("[HEALTH] err:", error);
      return { success: false, error: "Sunucuya erişilemiyor" };
    }
  },
};

// Dashboard tipleri
export interface WeatherData {
  airTemperature: number;
  airHumidity: number;
}

export interface IrrigationData {
  nextIrrigationTime: string;
  isScheduled: boolean;
}

export interface SensorSummary {
  soilMoisture: number;
  nodeCount: number;
  lastReadingTime: string | null;
}

export interface FieldSummary {
  id: string;
  name: string;
  area: number;
  farm_id?: string;
}

export interface DashboardData {
  weather: WeatherData;
  irrigation: IrrigationData;
  sensors: SensorSummary;
  field: FieldData;
}

// Auth/dashboard hatalarini caller'a sinyallemek icin sentinel error mesajlari.
// DashboardContext bunlara bakip handleLogout tetikliyor (AUTH_EXPIRED) veya
// stale data koruyor (network hatasi).
export const ERR_AUTH_EXPIRED = "AUTH_EXPIRED";
export const ERR_UNAUTHENTICATED = "UNAUTHENTICATED";

// Dashboard verileri
export const dashboardAPI = {
  getFields: async (farmId?: string): Promise<FieldSummary[]> => {
    const token = await secureGet(TOKEN_KEY);

    // Demo modu: explicit demo token (login ekranindan "skip" veya demo user ile)
    if (isDemoToken(token)) {
      const { getDemoFields } = await import("./demo/demoData");
      return getDemoFields();
    }

    // Token yok: caller logout'a yonlendirsin (gercek user olmali ama token gitti)
    if (!token) {
      throw new Error(ERR_UNAUTHENTICATED);
    }

    const url = farmId
      ? `/dashboard/fields?farm_id=${encodeURIComponent(farmId)}`
      : "/dashboard/fields";
    const res = await authFetch<FieldSummary[]>(url);
    if (res.success && res.data) {
      console.log("[DASHBOARD] fields:", res.data.length);
      return res.data;
    }
    if (res.error?.includes("HTTP 401") || res.error?.includes("HTTP 403")) {
      throw new Error(ERR_AUTH_EXPIRED);
    }
    throw new Error(res.error || "Failed to fetch fields");
  },

  getFieldDashboard: async (fieldId: string): Promise<DashboardData> => {
    const token = await secureGet(TOKEN_KEY);

    if (isDemoToken(token)) {
      const { generateDemoDashboardData } = await import("./demo/demoData");
      return generateDemoDashboardData(fieldId);
    }

    if (!token) {
      throw new Error(ERR_UNAUTHENTICATED);
    }

    const res = await authFetch<DashboardData>(
      `/dashboard/fields/${fieldId}`,
    );
    if (res.success && res.data) {
      // Basarili veriyi onbellekle (gercek live data, stale fallback olarak kullanilabilir)
      AsyncStorage.setItem(
        `dashboard_cache_${fieldId}`,
        JSON.stringify({ data: res.data, cachedAt: new Date().toISOString() }),
      ).catch(() => {});
      return res.data;
    }
    if (res.error?.includes("HTTP 401") || res.error?.includes("HTTP 403")) {
      throw new Error(ERR_AUTH_EXPIRED);
    }
    // Network hatasi: cache fallback (gercek live data, sadece eski). Demo'ya
    // dusmuyoruz cunku user gercek hesapla giris yapmis.
    const cached = await dashboardAPI.getCachedDashboard(fieldId);
    if (cached) {
      console.log("[DASHBOARD] onbellekten yuklendi:", fieldId.slice(0, 8));
      return cached.data;
    }
    throw new Error(res.error || "Failed to fetch dashboard data");
  },

  getCachedDashboard: async (fieldId: string): Promise<{ data: DashboardData; cachedAt: string } | null> => {
    try {
      const raw = await AsyncStorage.getItem(`dashboard_cache_${fieldId}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  createField: async (payload: {
    fieldName: string;
    fieldType: "greenhouse" | "pot";
    polygon: { exterior: [number, number][]; holes?: [number, number][][] };
    area: number;
    zones: {
      name: string;
      polygon: { exterior: [number, number][]; holes?: [number, number][][] };
      cropId?: number;
      plantingDate?: string;
    }[];
    farmId?: string;
  }): Promise<ApiResponse<FieldSummary>> => {
    const token = await secureGet(TOKEN_KEY);

    if (isDemoToken(token)) {
      // Demo modda sahte ID ile basarili dondur
      return {
        success: true,
        data: {
          id: `demo-${Date.now()}`,
          name: payload.fieldName,
          area: payload.area,
        },
      };
    }

    if (!token) {
      throw new Error(ERR_UNAUTHENTICATED);
    }

    const res = await authFetch<FieldSummary>("/dashboard/fields", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.success && res.data) {
      return res;
    }
    if (res.error?.includes("HTTP 401") || res.error?.includes("HTTP 403")) {
      throw new Error(ERR_AUTH_EXPIRED);
    }
    throw new Error(res.error || "Failed to create field");
  },

  createFarm: async (payload: {
    name: string;
    latitude: number;
    longitude: number;
    altitude_m: number;
  }): Promise<ApiResponse<{
    farm_id: string;
    name: string;
    latitude: number | null;
    longitude: number | null;
    altitude_m: number | null;
  }>> => {
    const token = await secureGet(TOKEN_KEY);

    if (isDemoToken(token)) {
      return {
        success: true,
        data: {
          farm_id: `demo-farm-${Date.now()}`,
          name: payload.name,
          latitude: payload.latitude,
          longitude: payload.longitude,
          altitude_m: payload.altitude_m,
        },
      };
    }

    if (!token) {
      throw new Error(ERR_UNAUTHENTICATED);
    }

    // Backend { farm, token, user } doner: ciftlik olusturmak kullaniciyi farmer'a yukseltir.
    type FarmData = {
      farm_id: string;
      name: string;
      latitude: number | null;
      longitude: number | null;
      altitude_m: number | null;
    };
    const res = await authFetch<{
      farm: FarmData;
      token?: string;
      user?: unknown;
    }>("/dashboard/farms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.success && res.data?.farm) {
      // Yeni token + user'i sakla ki global rol (salt-okunur kapilari) guncellensin.
      // AuthContext.refreshFromStorage() bunu okuyup state'i tazeler.
      if (res.data.token) {
        await secureSet(TOKEN_KEY, res.data.token);
        if (res.data.user) {
          await secureSet(USER_DATA_KEY, JSON.stringify(res.data.user));
        }
      }
      return { success: true, data: res.data.farm };
    }
    if (res.error?.includes("HTTP 401") || res.error?.includes("HTTP 403")) {
      throw new Error(ERR_AUTH_EXPIRED);
    }
    throw new Error(res.error || "Failed to create farm");
  },

  getCrops: async (): Promise<ApiResponse<{
    crop_id: number;
    name: string;
    default_kc: number | null;
    growth_days: number | null;
    optimal_sm_min: number | null;
    optimal_sm_max: number | null;
  }[]>> => {
    const token = await secureGet(TOKEN_KEY);
    if (isDemoToken(token)) {
      return { success: true, data: [] };
    }
    if (!token) throw new Error(ERR_UNAUTHENTICATED);
    return authFetch("/dashboard/crops");
  },

  getElevation: async (
    latitude: number,
    longitude: number,
  ): Promise<ApiResponse<{ altitude_m: number }>> => {
    const token = await secureGet(TOKEN_KEY);

    if (isDemoToken(token)) {
      // Demo: approximate elevation for Antalya region
      return { success: true, data: { altitude_m: 30 } };
    }

    if (!token) {
      throw new Error(ERR_UNAUTHENTICATED);
    }

    return authFetch<{ altitude_m: number }>(
      `/dashboard/elevation?latitude=${latitude}&longitude=${longitude}`,
    );
  },

  deleteFarm: async (farmId: string): Promise<ApiResponse<{ message: string }>> => {
    const token = await secureGet(TOKEN_KEY);
    if (isDemoToken(token)) {
      return { success: true, data: { message: "Demo: farm silindi" } };
    }
    if (!token) throw new Error(ERR_UNAUTHENTICATED);
    const res = await authFetch<{ message: string }>(
      `/dashboard/farms/${encodeURIComponent(farmId)}`,
      { method: "DELETE" },
    );
    if (res.success) return res;
    if (res.error?.includes("HTTP 401") || res.error?.includes("HTTP 403")) {
      throw new Error(ERR_AUTH_EXPIRED);
    }
    throw new Error(res.error || "Failed to delete farm");
  },

  deleteField: async (fieldId: string): Promise<ApiResponse<{ message: string }>> => {
    const token = await secureGet(TOKEN_KEY);
    if (isDemoToken(token)) {
      return { success: true, data: { message: "Demo: tarla silindi" } };
    }
    if (!token) throw new Error(ERR_UNAUTHENTICATED);
    const res = await authFetch<{ message: string }>(
      `/dashboard/fields/${encodeURIComponent(fieldId)}`,
      { method: "DELETE" },
    );
    if (res.success) return res;
    if (res.error?.includes("HTTP 401") || res.error?.includes("HTTP 403")) {
      throw new Error(ERR_AUTH_EXPIRED);
    }
    throw new Error(res.error || "Failed to delete field");
  },

  // Logout sirasinda cagrilir — userlar arasi cache leak'ini onler
  clearCaches: async (): Promise<void> => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter((k: string) => k.startsWith("dashboard_cache_"));
      if (cacheKeys.length > 0) {
        await AsyncStorage.multiRemove(cacheKeys);
      }
    } catch {
      // best-effort — sessiz gec
    }
  },
};

// Gateway islemleri
export const gatewayAPI = {
  async register(
    mac: string,
    farmId: string,
    name?: string,
  ): Promise<ApiResponse<{ api_key: string; gateway_id: string }>> {
    return authFetch("/gateway/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mac, farm_id: farmId, name }),
    });
  },

  async getFarms(): Promise<
    ApiResponse<Array<{ farm_id: string; name: string; is_owner?: boolean; access?: FarmAccessRole }>>
  > {
    const token = await secureGet(TOKEN_KEY);
    if (isDemoToken(token)) {
      // Demo: kullanici tam yetkili sahip gibi davranir, trash vs. gosterilsin.
      return {
        success: true,
        data: [{ farm_id: "demo-farm", name: "Demo Çiftliği", is_owner: true, access: "owner" }],
      };
    }
    return authFetch("/gateway/farms");
  },

  async getGateways(): Promise<
    ApiResponse<
      Array<{
        gateway_id: string;
        name: string;
        mac: string;
        is_online: boolean;
        sensor_count: number;
        firmware_version: string | null;
        farm_id: string;
      }>
    >
  > {
    return authFetch("/gateway/list");
  },

  async stopPairing(gatewayId: string): Promise<ApiResponse<{ message: string }>> {
    return authFetch(`/gateway/${gatewayId}/pair/stop`, {
      method: "POST",
    });
  },

  async rejectNode(
    gatewayId: string,
    mac: string,
    reason = "declined",
  ): Promise<ApiResponse<{ message: string }>> {
    return authFetch(`/gateway/${gatewayId}/pair/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mac, reason }),
    });
  },

  async startPairing(
    gatewayId: string,
    timeoutSec = 30,
  ): Promise<ApiResponse<{ message: string }>> {
    return authFetch(`/gateway/${gatewayId}/pair/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timeout_sec: timeoutSec }),
    });
  },

  async approveNode(
    gatewayId: string,
    mac: string,
    zoneId: string,
  ): Promise<ApiResponse<{ message: string }>> {
    return authFetch(`/gateway/${gatewayId}/pair/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mac, zone_id: zoneId }),
    });
  },

  async getLatestFirmware(): Promise<
    ApiResponse<{ version: string; file_size: number; changelog: string | null; created_at: string }>
  > {
    return authFetch("/gateway/firmware/latest");
  },

  async triggerOta(
    gatewayId: string,
    version?: string,
  ): Promise<ApiResponse<{ version: string }>> {
    return authFetch(`/gateway/${gatewayId}/ota`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version }),
    });
  },
};

// Karbon ayak izi islemleri
export const carbonAPI = {
  async getActivityTypes(): Promise<
    ApiResponse<Record<string, Array<{ activity_type_id: number; name: string; unit: string }>>>
  > {
    const token = await secureGet(TOKEN_KEY);
    if (isDemoToken(token)) {
      const { getDemoActivityTypes } = await import("./demo/demoData");
      return { success: true, data: getDemoActivityTypes() };
    }
    return authFetch("/carbon/activity-types");
  },

  async getLogs(
    farmId: string,
    params?: { startDate?: string; endDate?: string; category?: string },
  ): Promise<ApiResponse<unknown[]>> {
    const token = await secureGet(TOKEN_KEY);
    if (isDemoToken(token)) {
      const { listCarbonLogs } = await import("./demo/demoStorage");
      const { getDemoCarbonLogsSeed } = await import("./demo/demoData");
      let list = await listCarbonLogs();
      if (list.length === 0) {
        const seeds = getDemoCarbonLogsSeed();
        const { addCarbonLog } = await import("./demo/demoStorage");
        for (let i = seeds.length - 1; i >= 0; i--) {
          await addCarbonLog(seeds[i]);
        }
        list = seeds;
      }
      return { success: true, data: list };
    }
    const query = new URLSearchParams();
    if (params?.startDate) query.set("startDate", params.startDate);
    if (params?.endDate) query.set("endDate", params.endDate);
    if (params?.category) query.set("category", params.category);
    const qs = query.toString();
    return authFetch(`/carbon/farm/${farmId}/logs${qs ? `?${qs}` : ""}`);
  },

  async createLog(
    farmId: string,
    body: {
      activity_type_id: number;
      activity_date: string;
      activity_amount: number;
      notes?: string;
    },
  ): Promise<ApiResponse<{ carbon_log_id: string; emission_amount: number }>> {
    const token = await secureGet(TOKEN_KEY);
    if (isDemoToken(token)) {
      const { addCarbonLog } = await import("./demo/demoStorage");
      const { getDemoActivityTypes } = await import("./demo/demoData");
      const types = getDemoActivityTypes();
      let activityType: { name: string; category: string; unit: string } | null = null;
      let factor = 1.0;
      for (const [category, list] of Object.entries(types)) {
        const found = list.find((t) => t.activity_type_id === body.activity_type_id);
        if (found) {
          activityType = { name: found.name, category, unit: found.unit };
          // Yaklasik kgCO2/birim — demo icin kaba sabitler
          factor = category === "YAKIT" ? 2.62 : category === "GUBRE" ? 0.9 : 0.43;
          break;
        }
      }
      if (!activityType) {
        return { success: false, error: "Bilinmeyen aktivite tipi" };
      }
      const emission = Math.round(body.activity_amount * factor * 100) / 100;
      const log: CarbonLog = {
        carbon_log_id: `demo-clog-${Date.now().toString(36)}-${Math.random()
          .toString(36)
          .slice(2, 6)}`,
        farm_id: farmId,
        activity_type_id: body.activity_type_id,
        activity_date: body.activity_date,
        activity_amount: body.activity_amount,
        emission_amount: emission,
        notes: body.notes ?? null,
        created_at: new Date().toISOString(),
        activity_type: activityType,
      };
      await addCarbonLog(log);
      return {
        success: true,
        data: { carbon_log_id: log.carbon_log_id, emission_amount: emission },
      };
    }
    return authFetch(`/carbon/farm/${farmId}/logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  async deleteLog(
    farmId: string,
    logId: string,
  ): Promise<ApiResponse<{ message: string }>> {
    const token = await secureGet(TOKEN_KEY);
    if (isDemoToken(token)) {
      const { deleteCarbonLog } = await import("./demo/demoStorage");
      await deleteCarbonLog(logId);
      return { success: true, data: { message: "deleted" } };
    }
    return authFetch(`/carbon/farm/${farmId}/logs/${logId}`, {
      method: "DELETE",
    });
  },

  async getSummary(
    farmId: string,
    params?: { startDate?: string; endDate?: string },
  ): Promise<
    ApiResponse<{
      total_emission: number;
      by_category: Array<{ category: string; total: number; count: number }>;
    }>
  > {
    const token = await secureGet(TOKEN_KEY);
    if (isDemoToken(token)) {
      // Kullanici eklediklerini de yansit; liste bos ise getDemoCarbonSummary'ye dus
      const { listCarbonLogs } = await import("./demo/demoStorage");
      const { getDemoCarbonSummary } = await import("./demo/demoData");
      const logs = await listCarbonLogs();
      if (logs.length === 0) return { success: true, data: getDemoCarbonSummary() };
      const byCat = new Map<string, { total: number; count: number }>();
      let total = 0;
      for (const l of logs) {
        const cat = l.activity_type.category;
        const cur = byCat.get(cat) ?? { total: 0, count: 0 };
        cur.total += l.emission_amount;
        cur.count += 1;
        byCat.set(cat, cur);
        total += l.emission_amount;
      }
      return {
        success: true,
        data: {
          total_emission: Math.round(total * 100) / 100,
          by_category: Array.from(byCat.entries()).map(([category, v]) => ({
            category,
            total: Math.round(v.total * 100) / 100,
            count: v.count,
          })),
        },
      };
    }
    const query = new URLSearchParams();
    if (params?.startDate) query.set("startDate", params.startDate);
    if (params?.endDate) query.set("endDate", params.endDate);
    const qs = query.toString();
    return authFetch(`/carbon/farm/${farmId}/summary${qs ? `?${qs}` : ""}`);
  },
};

// Hastalik tespit tipleri
// QUEUED: S3'te durably saklaniyor, Lambda cagrisi henuz baslamadi (worker bekliyor)
// PROCESSING: Lambda call su an in-flight
export type DetectionStatus =
  | "NOT_STARTED"
  | "QUEUED"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED";

export type UserFeedback =
  | "DEFINITELY_WRONG"
  | "LIKELY_WRONG"
  | "UNSURE"
  | "LIKELY_CORRECT"
  | "DEFINITELY_CORRECT";

export type DiseaseCorrection =
  | "UNCERTAIN"
  | "BACTERIAL_SPOT"
  | "CORN_COMMON_RUST"
  | "CORN_GRAY_LEAF_SPOT"
  | "CORN_NORTHERN_LEAF_BLIGHT"
  | "EARLY_BLIGHT"
  | "HEALTHY"
  | "LATE_BLIGHT"
  | "LEAF_MOLD"
  | "MOSAIC_VIRUS"
  | "POWDERY_MILDEW"
  | "SEPTORIA_LEAF_SPOT"
  | "SPIDER_MITES"
  | "TARGET_SPOT"
  | "YELLOW_LEAF_CURL_VIRUS"
  | "OTHER";

export interface BilingualRecommendations {
  tr: string[];
  en: string[];
}

export interface DiseaseDetection {
  detection_id: string;
  user_id: string;
  image_uuid: string;
  image_s3_key: string;
  status: DetectionStatus;
  uploaded_at: string;
  processing_started_at: string | null;
  completed_at: string | null;
  detected_disease: DiseaseTarget | null;
  confidence: number | null;
  confidence_score: number | null;
  all_predictions: Record<string, number> | null;
  recommendations: BilingualRecommendations | null;
  error_message: string | null;
  imageUrl?: string | null;
  user_feedback?: UserFeedback | null;
  feedback_at?: string | null;
  user_correction?: DiseaseCorrection | null;
  confidence_status?: "confident" | "uncertain" | null;
  top_guess?: string | null;
  message_tr?: string | null;
  message_en?: string | null;
}

export interface SubmitDetectionResponse {
  detectionId: string;
  imageUuid: string;
  status: DetectionStatus;
  message: string;
}

export interface ImageUrlResponse {
  imageUrl: string;
  expiresIn: number;
  expiresAt: string;
}

// ───────────────────────────────────────────────────────────────────────────
// Hastalik takip klasorleri
// ───────────────────────────────────────────────────────────────────────────

/** DiseaseTarget enum (schema: ML/configs/label_map.py + UNCERTAIN + OTHER). */
export type DiseaseTarget = DiseaseCorrection;

/** Klasor icindeki bir tespit (full/list shape — backend service response). */
export interface FolderDetectionSummary {
  detection_id: string;
  image_uuid: string;
  status: DetectionStatus;
  uploaded_at: string;
  completed_at: string | null;
  detected_disease: DiseaseTarget | null;
  confidence: number | null;
  confidence_score: number | null;
  error_message: string | null;
  imageUrl: string | null;
}

/** Detail varyantta ek alanlar (allPredictions + recommendations). */
export interface FolderDetectionDetail extends FolderDetectionSummary {
  all_predictions?: Record<string, number> | null;
  recommendations?: BilingualRecommendations | null;
}

/** Klasore bagli planting bilgisi (response icinde nested). */
export interface FolderPlantingInfo {
  plantingId: string;
  isActive: boolean;
  plantingDate: string;
  growthStage: string | null;
  cropName: string | null;
  zoneId: string | null;
  zoneName: string | null;
}

/** Klasor list/detail response shape — backend service'den gelir. */
export interface DiseaseTrackingFolder {
  folderId: string;
  name: string;
  isActive: boolean;
  targetDisease: DiseaseTarget;
  lastDetectionAt: string | null;
  createdAt: string;
  updatedAt: string;
  planting: FolderPlantingInfo;
  detections: FolderDetectionSummary[];
}

/** Detail endpoint detail-shape detections donsun diye ayri tip. */
export interface DiseaseTrackingFolderDetail
  extends Omit<DiseaseTrackingFolder, "detections"> {
  detections: FolderDetectionDetail[];
}

/** /folders/:id/history slim response. */
export interface DiseaseTrackingFolderHistory {
  folderId: string;
  name: string;
  isActive: boolean;
  targetDisease: DiseaseTarget;
  planting: Pick<
    FolderPlantingInfo,
    "plantingId" | "isActive" | "cropName" | "zoneId" | "zoneName"
  >;
  history: Array<{
    detectionId: string;
    uploadedAt: string;
    completedAt: string | null;
    disease: DiseaseTarget | null;
    confidence: number | null;
    confidenceScore: number | null;
    allPredictions: Record<string, number> | null;
    recommendations: BilingualRecommendations | null;
  }>;
}

/** Demo synthesizer ipuclari — in-memory; app oldurulurse uncertain fallback'a duser. */
interface DemoLiveScanHint {
  className?: string;
  confidence?: number;
  allProbs?: Record<string, number>;
  timestamp?: number;
}

const demoPendingHints = new Map<
  string,
  {
    hintedLabel?: string | null;
    liveScanResult?: DemoLiveScanHint | null;
    folderId?: string | null;
  }
>();

// Hastalik tespit API
export const diseaseAPI = {
  async submitDetection(
    imageUri: string,
    folderId?: string | null,
    hintedLabel?: string | null,
    liveScanResult?: DemoLiveScanHint | null,
  ): Promise<ApiResponse<SubmitDetectionResponse>> {
    const token = await secureGet(TOKEN_KEY);
    if (!token) return { success: false, error: "Oturum bulunamadı" };

    if (isDemoToken(token)) {
      try {
        const { Directory, File, Paths } = await import("expo-file-system");
        const { upsertDetection } = await import("./demo/demoStorage");
        const detectionId = `demo-det-${Date.now().toString(36)}-${Math.random()
          .toString(36)
          .slice(2, 8)}`;
        const imageUuid = `demo-img-${Date.now().toString(36)}-${Math.random()
          .toString(36)
          .slice(2, 8)}`;

        let storedUri = imageUri;
        try {
          const dir = new Directory(Paths.document, "disease");
          if (!dir.exists) dir.create({ intermediates: true });
          const dest = new File(dir, `${detectionId}.jpg`);
          if (imageUri.startsWith("file://") || imageUri.startsWith("/")) {
            const src = new File(imageUri);
            if (src.exists) {
              src.copy(dest);
              storedUri = dest.uri;
            }
          }
        } catch (err) {
          console.log("[DISEASE] demo image copy err:", err);
        }

        const det: DiseaseDetection = {
          detection_id: detectionId,
          user_id: "0",
          image_uuid: imageUuid,
          image_s3_key: "demo://local",
          status: "PROCESSING",
          uploaded_at: new Date().toISOString(),
          processing_started_at: new Date().toISOString(),
          completed_at: null,
          detected_disease: null,
          confidence: null,
          confidence_score: null,
          all_predictions: null,
          recommendations: null,
          error_message: null,
          imageUrl: storedUri,
          confidence_status: null,
          top_guess: null,
        };
        await upsertDetection(det);
        demoPendingHints.set(detectionId, {
          hintedLabel: hintedLabel ?? null,
          liveScanResult: liveScanResult ?? null,
          folderId: folderId ?? null,
        });

        console.log(
          "[DISEASE] demo submit",
          folderId ? `folder=${folderId.slice(0, 8)}` : "(general)",
          hintedLabel ? `hint=${hintedLabel}` : "",
        );

        return {
          success: true,
          data: {
            detectionId,
            imageUuid,
            status: "PROCESSING",
            message: "demo: processing locally",
          },
        };
      } catch (err) {
        console.log("[DISEASE] demo submit err:", err);
        return { success: false, error: "Demo submit basarisiz" };
      }
    }

    try {
      // Thumbnail mobile-side uretilir; hata olursa upload yine devam etsin (orijinali kaybetme).
      const { compressForLocalCache } = await import("./diseaseImageProcessing");
      let thumbnailUri = imageUri; // fallback — original URI as thumbnail (rare)
      try {
        thumbnailUri = await compressForLocalCache(imageUri);
      } catch (err) {
        console.log("[DISEASE] thumb gen fail (using original):", String(err));
      }

      const formData = new FormData();
      formData.append("image", {
        uri: imageUri,
        type: "image/jpeg",
        name: "leaf.jpg",
      } as any);
      formData.append("thumbnail", {
        uri: thumbnailUri,
        type: "image/jpeg",
        name: "leaf-thumb.jpg",
      } as any);
      // Folder context (opsiyonel) — set edilirse detection bu klasore baglanir
      if (folderId) {
        formData.append("folderId", folderId);
      }

      try {
        const { buildCaptureMetadata } = await import("./captureMetadata");
        const meta = await buildCaptureMetadata({
          liveScanResult: liveScanResult
            ? { className: liveScanResult.className, confidence: liveScanResult.confidence }
            : null,
        });
        formData.append("metadata", JSON.stringify(meta));
      } catch (err) {
        // Metadata olusturulamazsa submit yine de ilerlesin
        console.log("[DISEASE] meta build fail:", String(err));
      }

      console.log("[DISEASE] submit", folderId ? `folder=${folderId.slice(0, 8)}` : "(general)");
      const res = await fetchWithTimeout(
        `${API_BASE_URL}/disease/submit`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        },
        30000,
      );

      if (!res.ok) {
        console.log("[DISEASE] err:", res.status);
        return { success: false, error: `API Error: ${res.status}` };
      }

      const json = await res.json();
      console.log("[DISEASE] submitted:", json.data?.detectionId?.slice(0, 8));
      return json;
    } catch (error) {
      console.log("[DISEASE] submit err:", error);
      return { success: false, error: "Görsel gönderilemedi" };
    }
  },

  // ── Klasor (folder) endpoints ──────────────────────────────────────────

  async createFolder(
    zoneId: string,
    name: string,
  ): Promise<ApiResponse<DiseaseTrackingFolder>> {
    const token = await secureGet(TOKEN_KEY);
    if (isDemoToken(token)) {
      const { createFolder: createDemoFolder } = await import("./demo/demoStorage");
      const { getDemoZones } = await import("./demo/demoData");
      const zone = getDemoZones().find((z) => z.zone_id === zoneId);
      if (!zone) return { success: false, error: "Bilinmeyen bölge" };
      const folder = await createDemoFolder({
        zoneId,
        zoneName: zone.zone_name,
        cropName: "Domates",
        name,
      });
      return { success: true, data: folder };
    }
    return authFetch("/disease/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zoneId, name }),
    });
  },

  // farmId: paydas (stakeholder) icin zorunlu — backend ciftlik-kapsamli doner.
  // Ciftci icin atlanir (kendi user_id'ine gore doner).
  async getFolders(farmId?: string): Promise<ApiResponse<DiseaseTrackingFolder[]>> {
    const token = await secureGet(TOKEN_KEY);
    if (isDemoToken(token)) {
      const { listFolders, seedIfEmpty } = await import("./demo/demoStorage");
      const { getDemoFields } = await import("./demo/demoData");
      await seedIfEmpty(getDemoFields());
      const list = await listFolders();
      return { success: true, data: list };
    }
    return authFetch(
      `/disease/folders${farmId ? `?farm_id=${encodeURIComponent(farmId)}` : ""}`,
    );
  },

  async getFolderDetail(
    folderId: string,
    farmId?: string,
  ): Promise<ApiResponse<DiseaseTrackingFolderDetail>> {
    const token = await secureGet(TOKEN_KEY);
    if (isDemoToken(token)) {
      const { getFolderDetail: getDemoFolderDetail } = await import("./demo/demoStorage");
      const detail = await getDemoFolderDetail(folderId);
      if (!detail) return { success: false, error: "Klasör bulunamadı" };
      return { success: true, data: detail };
    }
    return authFetch(
      `/disease/folders/${folderId}${farmId ? `?farm_id=${encodeURIComponent(farmId)}` : ""}`,
    );
  },

  async getFolderHistory(
    folderId: string,
  ): Promise<ApiResponse<DiseaseTrackingFolderHistory>> {
    const token = await secureGet(TOKEN_KEY);
    if (isDemoToken(token)) {
      const { getFolderDetail: getDemoFolderDetail } = await import("./demo/demoStorage");
      const detail = await getDemoFolderDetail(folderId);
      if (!detail) return { success: false, error: "Klasör bulunamadı" };
      return {
        success: true,
        data: {
          folderId: detail.folderId,
          name: detail.name,
          isActive: detail.isActive,
          targetDisease: detail.targetDisease,
          planting: {
            plantingId: detail.planting.plantingId,
            isActive: detail.planting.isActive,
            cropName: detail.planting.cropName,
            zoneId: detail.planting.zoneId,
            zoneName: detail.planting.zoneName,
          },
          history: detail.detections.map((d) => ({
            detectionId: d.detection_id,
            uploadedAt: d.uploaded_at,
            completedAt: d.completed_at,
            disease: d.detected_disease,
            confidence: d.confidence,
            confidenceScore: d.confidence_score,
            allPredictions: d.all_predictions ?? null,
            recommendations: d.recommendations ?? null,
          })),
        },
      };
    }
    return authFetch(`/disease/folders/${folderId}/history`);
  },

  async deactivateFolder(
    folderId: string,
  ): Promise<ApiResponse<{ message: string }>> {
    const token = await secureGet(TOKEN_KEY);
    if (isDemoToken(token)) {
      const { deactivateFolder: deactivateDemoFolder } = await import(
        "./demo/demoStorage"
      );
      await deactivateDemoFolder(folderId);
      return { success: true, data: { message: "deactivated" } };
    }
    return authFetch(`/disease/folders/${folderId}/deactivate`, {
      method: "PATCH",
    });
  },

  async getDetectionStatus(
    detectionId: string,
  ): Promise<ApiResponse<DiseaseDetection>> {
    const token = await secureGet(TOKEN_KEY);
    if (isDemoToken(token)) {
      const {
        getDetection,
        upsertDetection,
        attachDetectionToFolder,
      } = await import("./demo/demoStorage");
      const { synthesizeDemoDetection } = await import("./demo/demoData");

      const det = await getDetection(detectionId);
      if (!det) return { success: false, error: "Detection not found" };

      if (det.status === "PROCESSING") {
        const hints = demoPendingHints.get(detectionId);
        const synthesized = synthesizeDemoDetection({
          imageUri: det.imageUrl ?? "",
          detectionId: det.detection_id,
          imageUuid: det.image_uuid,
          hintedLabel: hints?.hintedLabel,
          liveScanResult: hints?.liveScanResult,
          folderId: hints?.folderId,
        });
        await upsertDetection(synthesized);
        if (hints?.folderId) {
          await attachDetectionToFolder(hints.folderId, synthesized);
        }
        demoPendingHints.delete(detectionId);
        return { success: true, data: synthesized };
      }
      return { success: true, data: det };
    }
    return authFetch(`/disease/requests/${detectionId}`);
  },

  async getAllDetections(): Promise<
    ApiResponse<{ count: number; detections: DiseaseDetection[] }>
  > {
    const token = await secureGet(TOKEN_KEY);
    if (isDemoToken(token)) {
      const { listDetections, seedIfEmpty } = await import("./demo/demoStorage");
      const { getDemoFields } = await import("./demo/demoData");
      await seedIfEmpty(getDemoFields());
      const detections = await listDetections();
      return { success: true, data: { count: detections.length, detections } };
    }
    return authFetch("/disease/requests");
  },

  async getImageUrl(
    detectionId: string,
  ): Promise<ApiResponse<ImageUrlResponse>> {
    const token = await secureGet(TOKEN_KEY);
    if (isDemoToken(token)) {
      const { getDetection } = await import("./demo/demoStorage");
      const det = await getDetection(detectionId);
      const local = det?.imageUrl ?? "";
      return {
        success: true,
        data: {
          imageUrl: local,
          expiresIn: 3600 * 24 * 365,
          expiresAt: new Date(Date.now() + 365 * 86400 * 1000).toISOString(),
        },
      };
    }
    return authFetch(`/disease/requests/${detectionId}/image`);
  },

  async deleteDetection(
    detectionId: string,
  ): Promise<ApiResponse<{ message: string }>> {
    const token = await secureGet(TOKEN_KEY);
    if (isDemoToken(token)) {
      const { deleteDetection: deleteDemoDetection } = await import(
        "./demo/demoStorage"
      );
      await deleteDemoDetection(detectionId);
      return { success: true, data: { message: "deleted" } };
    }
    return authFetch(`/disease/requests/${detectionId}`, { method: "DELETE" });
  },

  async submitFeedback(
    detectionId: string,
    feedback: UserFeedback,
    correction?: DiseaseCorrection | null,
  ): Promise<
    ApiResponse<{
      detectionId: string;
      feedback: UserFeedback;
      correction: DiseaseCorrection | null;
    }>
  > {
    const token = await secureGet(TOKEN_KEY);
    if (isDemoToken(token)) {
      const { applyFeedback } = await import("./demo/demoStorage");
      await applyFeedback(detectionId, feedback, correction);
      return {
        success: true,
        data: { detectionId, feedback, correction: correction ?? null },
      };
    }
    return authFetch(`/disease/requests/${detectionId}/feedback`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        feedback,
        ...(correction ? { correction } : {}),
      }),
    });
  },

  async pollDetectionStatus(
    detectionId: string,
    onProgress?: (status: DetectionStatus) => void,
    maxAttempts = 30,
    intervalMs = 2000,
  ): Promise<DiseaseDetection> {
    for (let i = 0; i < maxAttempts; i++) {
      const response = await this.getDetectionStatus(detectionId);

      if (!response.success || !response.data) {
        throw new Error(response.error || "Detection failed");
      }

      const detection = response.data;
      onProgress?.(detection.status);

      if (detection.status === "COMPLETED") {
        console.log("[DISEASE] done:", detection.detected_disease, `${detection.confidence}%`);
        return detection;
      }

      if (detection.status === "FAILED") {
        console.log("[DISEASE] failed:", detection.error_message);
        throw new Error(detection.error_message || "Detection failed");
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error("Timeout waiting for detection results");
  },
};

// Sulama is (irrigation) tipleri
export interface IrrigationJob {
  job_id: string;
  zone_id: string | null;
  status: string;
  should_irrigate: boolean;
  water_amount_ml: number | null;
  recommended_duration_min: number | null;
  start_time: string | null;
  current_sm: number | null;
  target_sm: number | null;
  sm_deficit: number | null;
  urgency_level: string | null;
  reasoning: string | null;
  recommendation_time: string | null;
  actual_water_amount_ml: number | null;
  actual_start_time: string | null;
  actual_duration_min: number | null;
  created_at: string;
}

export interface IrrigationZoneRecommendation {
  zone_id: string;
  zone_name: string;
  job: IrrigationJob | null;
}

function generateDemoIrrigationJobs(zoneIndex: number): IrrigationJob[] {
  const now = new Date();
  const jobs: IrrigationJob[] = [];
  const seededRand = (i: number) => ((zoneIndex * 7 + i * 13 + 37) % 100) / 100;

  for (let i = 0; i < 5; i++) {
    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const isExecuted = i > 0;
    const r = seededRand(i);
    jobs.push({
      job_id: `demo-job-${zoneIndex}-${i}`,
      zone_id: `demo-zone-${zoneIndex}`,
      status: i === 0 ? "PENDING" : "EXECUTED",
      should_irrigate: true,
      water_amount_ml: Math.round(150 + r * 150),
      recommended_duration_min: Math.round(5 + r * 20),
      start_time: date.toISOString(),
      current_sm: Math.round(30 + r * 25),
      target_sm: Math.round(55 + r * 15),
      sm_deficit: Math.round(10 + r * 20),
      urgency_level: r < 0.33 ? "high" : r < 0.66 ? "medium" : "low",
      reasoning: "Soil moisture below threshold",
      recommendation_time: date.toISOString(),
      actual_water_amount_ml: isExecuted ? Math.round(140 + r * 160) : null,
      actual_start_time: isExecuted ? date.toISOString() : null,
      actual_duration_min: isExecuted ? Math.round(5 + r * 15) : null,
      created_at: date.toISOString(),
    });
  }
  return jobs;
}

// Sulama API
// Backend endpointleri:
//   POST /api/irrigation/run/:zone_id   — Yeni sulama isi olustur (mevcut)
//   POST /api/irrigation/preview        — On izleme verisi al (mevcut)
//   GET  /api/irrigation/zone/:zoneId/jobs  — Zone sulama isleri
//   PATCH /api/irrigation/jobs/:jobId/actual — Gercek degerleri guncelle
export const irrigationAPI = {
  // Zone sulama islerini getir
  async getZoneJobs(
    zoneId: string,
    zoneIndex = 0,
  ): Promise<ApiResponse<IrrigationJob[]>> {
    const token = await secureGet(TOKEN_KEY);
    if (!token || isDemoToken(token)) {
      return { success: true, data: generateDemoIrrigationJobs(zoneIndex) };
    }
    console.log("[IRRIGATION] getZoneJobs zoneId:", zoneId);
    const res = await authFetch<IrrigationJob[]>(`/irrigation/zone/${zoneId}/jobs`);
    // Endpoint henuz yoksa (404) bos liste dondur
    if (!res.success && res.error?.includes("404")) {
      return { success: true, data: [] };
    }
    return res;
  },

  // Gercek sulama degerlerini guncelle
  async updateJobActual(
    jobId: string,
    data: { actual_water_amount_ml?: number; actual_start_time?: string; actual_duration_min?: number },
  ): Promise<ApiResponse<IrrigationJob>> {
    const token = await secureGet(TOKEN_KEY);
    if (!token || isDemoToken(token)) {
      return { success: true, data: { job_id: jobId, ...data } as any };
    }
    return authFetch<IrrigationJob>(`/irrigation/jobs/${jobId}/actual`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  },

  // Manuel sulama kaydi olustur (oneri olmadan)
  async createManualActual(
    zoneId: string,
    data: {
      actual_start_time: string;
      actual_water_amount_ml?: number;
      actual_duration_min?: number;
    },
  ): Promise<ApiResponse<any>> {
    const token = await secureGet(TOKEN_KEY);
    if (!token || isDemoToken(token)) {
      return { success: true, data: { job: { job_id: "demo-manual", status: "EXECUTED", ...data } } };
    }
    console.log("[MANUAL_IRRIGATION] createManualActual zoneId:", zoneId, "payload:", data);
    return authFetch(`/irrigation/zone/${zoneId}/manual-actual`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  },

  // Tarla bazinda tum zone onerilerini getir
  async getFieldRecommendations(
    fieldId: string,
  ): Promise<ApiResponse<IrrigationZoneRecommendation[]>> {
    const token = await secureGet(TOKEN_KEY);
    if (!token || isDemoToken(token)) {
      return { success: true, data: [] };
    }
    return authFetch<IrrigationZoneRecommendation[]>(
      `/irrigation/field/${fieldId}/recommendations`,
    );
  },

  // Tarla bazinda tum zone sulama islerini getir
  async getFieldJobs(fieldId: string): Promise<ApiResponse<IrrigationJob[]>> {
    return authFetch<IrrigationJob[]>(`/irrigation/field/${fieldId}/jobs`);
  },

  // Zone icin sulama isi olustur (mevcut backend endpoint)
  async runForZone(zoneId: string) {
    return authFetch(`/irrigation/run/${zoneId}`, { method: "POST" });
  },
};
