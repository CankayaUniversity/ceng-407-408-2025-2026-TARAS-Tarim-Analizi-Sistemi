// API katmani - tum backend baglantilari
// Moduller: authAPI, sensorAPI, socketAPI, imagesAPI, healthAPI, dashboardAPI, diseaseAPI
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { io, Socket } from "socket.io-client";
import type { FieldData } from "./fieldPlaceholder";

import { fetchWithTimeout } from "./fetchWithTimeout";

// Environment variables from app.config.js
export const API_HOST = Constants.expoConfig?.extra?.apiHost || "";
const DEMO_USERNAME = Constants.expoConfig?.extra?.demoUsername || "";
const DEMO_PASSWORD = Constants.expoConfig?.extra?.demoPassword || "";

const API_BASE_URL = `${API_HOST}/api`;
const TOKEN_KEY = "auth_token";
const USER_DATA_KEY = "user_data";

let socket: Socket | null = null;

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
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

interface Zone {
  zone_id: string;
  zone_name: string;
  field_name: string;
  farm_name: string;
}

// Token ile header olustur
async function getAuthHeaders() {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
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
      const demoToken = "DEMO_MODE_TOKEN";
      const demoUser = {
        user_id: 0,
        username: DEMO_USERNAME,
        email: "test@local.demo",
        role: "demo",
      };
      await AsyncStorage.setItem(TOKEN_KEY, demoToken);
      await AsyncStorage.setItem(USER_DATA_KEY, JSON.stringify(demoUser));
      return { success: true, data: { token: demoToken, user: demoUser } };
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
        await AsyncStorage.setItem(TOKEN_KEY, data.data.token);
        if (data.data?.user) {
          await AsyncStorage.setItem(
            USER_DATA_KEY,
            JSON.stringify(data.data.user),
          );
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
      const res = await fetchWithTimeout(
        `${API_BASE_URL}/auth/register`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, email, password }),
        },
        15000,
      );
      const data = await res.json();

      if (data.success && data.data?.token) {
        await AsyncStorage.setItem(TOKEN_KEY, data.data.token);
        if (data.data?.user) {
          await AsyncStorage.setItem(
            USER_DATA_KEY,
            JSON.stringify(data.data.user),
          );
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

  async getStoredUser(): Promise<User | null> {
    try {
      const userJson = await AsyncStorage.getItem(USER_DATA_KEY);
      return userJson ? JSON.parse(userJson) : null;
    } catch {
      return null;
    }
  },

  async logout() {
    await AsyncStorage.removeItem(TOKEN_KEY);
    await AsyncStorage.removeItem(USER_DATA_KEY);
  },

  async getToken() {
    return AsyncStorage.getItem(TOKEN_KEY);
  },

  async isAuthenticated() {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    return !!token;
  },
};

// Sensor veri islemleri
export const sensorAPI = {
  async getUserZones(): Promise<ApiResponse<{ zones: Zone[] }>> {
    return authFetch("/sensors/zones");
  },

  async getZoneSensors(zoneId: string) {
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
    return authFetch<{
      zone_id: string;
      zone_name: string;
      readings: SensorReading[];
    }>(`/sensors/zone/${zoneId}/history?hours=${hours}`);
  },

  async getFieldHistory(fieldId: string, hours = 72) {
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
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (!token) return null;
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
};

// Gorsel yukleme
export const imagesAPI = {
  async upload(imageUri: string, fileName = "image.jpg") {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
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
}

export interface DashboardData {
  weather: WeatherData;
  irrigation: IrrigationData;
  sensors: SensorSummary;
  field: FieldData;
}

// Dashboard verileri
export const dashboardAPI = {
  getFields: async (): Promise<FieldSummary[]> => {
    const token = await AsyncStorage.getItem(TOKEN_KEY);

    if (!token || token === "DEMO_MODE_TOKEN") {
      const { getDemoFields } = await import("./demoData");
      return getDemoFields();
    }

    try {
      const res = await authFetch<FieldSummary[]>("/dashboard/fields");
      if (res.success && res.data) {
        console.log("[DASHBOARD] fields:", res.data.length);
        return res.data;
      }
      throw new Error(res.error || "Failed to fetch fields");
    } catch (error) {
      console.log("[DASHBOARD] err, demo fallback:", error);
      const { getDemoFields } = await import("./demoData");
      return getDemoFields();
    }
  },

  getFieldDashboard: async (fieldId: string): Promise<DashboardData> => {
    const token = await AsyncStorage.getItem(TOKEN_KEY);

    if (!token || token === "DEMO_MODE_TOKEN") {
      const { generateDemoDashboardData } = await import("./demoData");
      return generateDemoDashboardData(fieldId);
    }

    try {
      const res = await authFetch<DashboardData>(
        `/dashboard/fields/${fieldId}`,
      );
      if (res.success && res.data) {
        return res.data;
      }
      throw new Error(res.error || "Failed to fetch dashboard data");
    } catch (error) {
      console.log("[DASHBOARD] err:", fieldId.slice(0, 8), error);
      const { generateDemoDashboardData } = await import("./demoData");
      return generateDemoDashboardData(fieldId);
    }
  },
};

// Hastalik tespit tipleri
export type DetectionStatus =
  | "NOT_STARTED"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED";

export interface DiseaseDetection {
  detection_id: string;
  user_id: string;
  image_uuid: string;
  image_s3_key: string;
  status: DetectionStatus;
  uploaded_at: string;
  processing_started_at: string | null;
  completed_at: string | null;
  detected_disease: string | null;
  confidence: number | null;
  confidence_score: number | null;
  all_predictions: Record<string, number> | null;
  recommendations: string[] | null;
  error_message: string | null;
  imageUrl?: string | null;
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

// Hastalik tespit API
export const diseaseAPI = {
  async submitDetection(
    imageUri: string,
  ): Promise<ApiResponse<SubmitDetectionResponse>> {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (!token) return { success: false, error: "Oturum bulunamadı" };

    try {
      const formData = new FormData();
      formData.append("image", {
        uri: imageUri,
        type: "image/jpeg",
        name: "leaf.jpg",
      } as any);

      console.log("[DISEASE] submit");
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

  async getDetectionStatus(
    detectionId: string,
  ): Promise<ApiResponse<DiseaseDetection>> {
    return authFetch(`/disease/requests/${detectionId}`);
  },

  async getAllDetections(): Promise<
    ApiResponse<{ count: number; detections: DiseaseDetection[] }>
  > {
    return authFetch("/disease/requests");
  },

  async getImageUrl(
    detectionId: string,
  ): Promise<ApiResponse<ImageUrlResponse>> {
    return authFetch(`/disease/requests/${detectionId}/image`);
  },

  async deleteDetection(
    detectionId: string,
  ): Promise<ApiResponse<{ message: string }>> {
    return authFetch(`/disease/requests/${detectionId}`, { method: "DELETE" });
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
