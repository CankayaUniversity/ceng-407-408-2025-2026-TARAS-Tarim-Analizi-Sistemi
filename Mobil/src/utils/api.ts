import AsyncStorage from '@react-native-async-storage/async-storage';
import { io, Socket } from 'socket.io-client';
import type { FieldData } from './fieldPlaceholder';

const API_HOST = 'http://13.61.7.197:3000';
const API_BASE_URL = `${API_HOST}/api`;
const TOKEN_KEY = 'auth_token';
const USER_DATA_KEY = 'user_data';

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
  sensor_node_id: string;
  sensor_type: string;
  value: number;
  unit: string;
  timestamp: string;
}

interface Zone {
  zone_id: string;
  zone_name: string;
  field_name: string;
  farm_name: string;
}

async function getAuthHeaders() {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : null;
}

async function authFetch<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  const headers = await getAuthHeaders();
  if (!headers) return { success: false, error: 'Oturum bulunamadı' };

  try {
    const res = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: { ...headers, ...options.headers },
    });
    return res.json();
  } catch {
    return { success: false, error: 'Bağlantı hatası' };
  }
}

export const authAPI = {
  async login(username: string, password: string): Promise<ApiResponse<LoginData>> {
    // Local demo user - skip API, use offline mode
    if (username.toLowerCase() === 'testuser' && password === 'test123') {
      const demoToken = 'DEMO_MODE_TOKEN';
      const demoUser = {
        user_id: 0,
        username: 'testuser',
        email: 'test@local.demo',
        role: 'demo',
      };
      await AsyncStorage.setItem(TOKEN_KEY, demoToken);
      await AsyncStorage.setItem(USER_DATA_KEY, JSON.stringify(demoUser));
      return {
        success: true,
        data: {
          token: demoToken,
          user: demoUser,
        },
      };
    }

    // Real users - connect to AWS database
    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: username, password }),
      });
      const data = await res.json();

      if (data.success && data.data?.token) {
        await AsyncStorage.setItem(TOKEN_KEY, data.data.token);
        if (data.data?.user) {
          await AsyncStorage.setItem(USER_DATA_KEY, JSON.stringify(data.data.user));
        }
      }
      return data;
    } catch {
      return { success: false, error: 'Sunucuya bağlanılamadı' };
    }
  },

  async register(username: string, email: string, password: string): Promise<ApiResponse<LoginData>> {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password }),
      });
      const data = await res.json();

      if (data.success && data.data?.token) {
        await AsyncStorage.setItem(TOKEN_KEY, data.data.token);
        if (data.data?.user) {
          await AsyncStorage.setItem(USER_DATA_KEY, JSON.stringify(data.data.user));
        }
      }
      return data;
    } catch {
      return { success: false, error: 'Sunucuya bağlanılamadı' };
    }
  },

  async getProfile(): Promise<ApiResponse<ProfileData>> {
    return authFetch('/auth/me');
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

export const sensorAPI = {
  async getUserZones(): Promise<ApiResponse<{ zones: Zone[] }>> {
    return authFetch('/sensors/zones');
  },

  async getZoneSensors(zoneId: string) {
    return authFetch<{
      zone_id: string;
      zone_name: string;
      sensors: Array<{ sensor_node_id: string; sensor_type: string; latest_reading?: SensorReading }>;
    }>(`/sensors/zone/${zoneId}/latest`);
  },

  async getZoneHistory(zoneId: string, hours = 24) {
    return authFetch<{
      zone_id: string;
      zone_name: string;
      readings: SensorReading[];
    }>(`/sensors/zone/${zoneId}/history?hours=${hours}`);
  },
};

export interface SensorDataEvent {
  sensor_node_id: string;
  sensor_type: string;
  value: number;
  unit: string;
  timestamp: string;
}

export const socketAPI = {
  async connect(): Promise<Socket | null> {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (!token) return null;
    if (socket?.connected) return socket;

    socket = io(API_HOST, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    return socket;
  },

  onSensorData(callback: (data: SensorDataEvent) => void) {
    socket?.on('sensor-data', callback);
  },

  offSensorData(callback?: (data: SensorDataEvent) => void) {
    callback ? socket?.off('sensor-data', callback) : socket?.off('sensor-data');
  },

  disconnect() {
    socket?.disconnect();
    socket = null;
  },

  isConnected: () => socket?.connected ?? false,
  getSocket: () => socket,
};

export const imagesAPI = {
  async upload(imageUri: string, fileName = 'image.jpg') {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (!token) return { success: false, error: 'Oturum bulunamadı' };

    const formData = new FormData();
    formData.append('image', { uri: imageUri, type: 'image/jpeg', name: fileName } as any);

    try {
      const res = await fetch(`${API_BASE_URL}/images/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
        body: formData,
      });
      return res.json();
    } catch {
      return { success: false, error: 'Görsel yüklenemedi' };
    }
  },

  async list() {
    return authFetch<Array<{ image_id: string; url: string; created_at: string }>>('/images');
  },
};

export const healthAPI = {
  async check() {
    try {
      const res = await fetch(`${API_HOST}/health`);
      const data = await res.json();
      return { success: true, status: data.status || 'ok' };
    } catch {
      return { success: false, error: 'Sunucuya erişilemiyor' };
    }
  },
};

// Dashboard types
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

export const dashboardAPI = {
  getFields: async (): Promise<FieldSummary[]> => {
    const token = await AsyncStorage.getItem(TOKEN_KEY);

    // Demo mode - use local data
    if (!token || token === 'DEMO_MODE_TOKEN') {
      const { getDemoFields } = await import('./demoData');
      return getDemoFields();
    }

    // Real mode - fetch from AWS database
    try {
      const res = await authFetch<FieldSummary[]>('/dashboard/fields');
      if (res.success && res.data) {
        return res.data;
      }
      throw new Error(res.error || 'Failed to fetch fields');
    } catch (error) {
      console.error('dashboardAPI.getFields error:', error);
      const { getDemoFields } = await import('./demoData');
      return getDemoFields();
    }
  },

  getFieldDashboard: async (fieldId: string): Promise<DashboardData> => {
    const token = await AsyncStorage.getItem(TOKEN_KEY);

    // Demo mode - use local data
    if (!token || token === 'DEMO_MODE_TOKEN') {
      const { generateDemoDashboardData } = await import('./demoData');
      return generateDemoDashboardData(fieldId);
    }

    // Real mode - fetch from AWS database
    try {
      const res = await authFetch<DashboardData>(`/dashboard/fields/${fieldId}`);
      if (res.success && res.data) {
        return res.data;
      }
      throw new Error(res.error || 'Failed to fetch dashboard data');
    } catch (error) {
      console.error('dashboardAPI.getFieldDashboard error:', error);
      const { generateDemoDashboardData } = await import('./demoData');
      return generateDemoDashboardData(fieldId);
    }
  },
};

// Disease Detection types
export type DetectionStatus = 'NOT_STARTED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface DiseaseDetection {
  detection_id: string;
  user_id: string;
  image_uuid: string;
  image_s3_key: string;
  status: DetectionStatus;
  uploaded_at: string;
  processing_started_at: string | null;
  completed_at: string | null;

  // Results (null until COMPLETED)
  detected_disease: string | null;
  confidence: number | null;
  confidence_score: number | null;
  all_predictions: Record<string, number> | null;
  recommendations: string[] | null;
  error_message: string | null;
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

export const diseaseAPI = {
  async submitDetection(imageUri: string): Promise<ApiResponse<SubmitDetectionResponse>> {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (!token) return { success: false, error: 'Oturum bulunamadı' };

    const formData = new FormData();
    formData.append('image', {
      uri: imageUri,
      type: 'image/jpeg',
      name: 'leaf.jpg',
    } as any);

    try {
      const res = await fetch(`${API_BASE_URL}/disease/submit`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
        body: formData,
      });
      return res.json();
    } catch {
      return { success: false, error: 'Görsel gönderilemedi' };
    }
  },

  async getDetectionStatus(detectionId: string): Promise<ApiResponse<DiseaseDetection>> {
    return authFetch(`/disease/requests/${detectionId}`);
  },

  async getAllDetections(): Promise<ApiResponse<{ count: number; detections: DiseaseDetection[] }>> {
    return authFetch('/disease/requests');
  },

  async getImageUrl(detectionId: string): Promise<ApiResponse<ImageUrlResponse>> {
    return authFetch(`/disease/requests/${detectionId}/image`);
  },

  async deleteDetection(detectionId: string): Promise<ApiResponse<{ message: string }>> {
    return authFetch(`/disease/requests/${detectionId}`, { method: 'DELETE' });
  },

  async pollDetectionStatus(
    detectionId: string,
    onProgress?: (status: DetectionStatus) => void,
    maxAttempts = 30,
    intervalMs = 2000
  ): Promise<DiseaseDetection> {
    for (let i = 0; i < maxAttempts; i++) {
      const response = await this.getDetectionStatus(detectionId);

      if (!response.success || !response.data) {
        throw new Error(response.error || 'Detection failed');
      }

      const detection = response.data;
      onProgress?.(detection.status);

      if (detection.status === 'COMPLETED') {
        return detection;
      }

      if (detection.status === 'FAILED') {
        throw new Error(detection.error_message || 'Detection failed');
      }

      // Still processing, wait and retry
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    throw new Error('Timeout waiting for detection results');
  },
};
