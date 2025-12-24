import AsyncStorage from '@react-native-async-storage/async-storage';

// Use your computer's IP address when testing on a physical device
// Use 'localhost' when testing on emulator/simulator
const API_BASE_URL = 'http://192.168.1.6:3000/api';
const TOKEN_KEY = 'auth_token';

interface LoginResponse {
  success: boolean;
  data?: {
    token: string;
    user: {
      user_id: number;
      username: string;
      email: string;
      role: string;
    };
  };
  error?: string;
}

interface UserResponse {
  success: boolean;
  data?: {
    user_id: number;
    username: string;
    email: string;
    role: string;
    farms: any[];
    unread_alerts: number;
  };
  error?: string;
}

export const authAPI = {
  async login(identifier: string, password: string): Promise<LoginResponse> {
    try {
      console.log('Sending login request to:', `${API_BASE_URL}/auth/login`);
      console.log('With credentials:', { identifier, password: '***' });
      
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ identifier, password }),
      });

      console.log('Response status:', response.status);
      const data = await response.json();
      console.log('Response data:', data);

      if (data.success && data.data?.token) {
        await AsyncStorage.setItem(TOKEN_KEY, data.data.token);
      }

      return data;
    } catch (error) {
      console.error('Login API error:', error);
      return {
        success: false,
        error: 'Bağlantı hatası. Backend sunucusuna erişilemiyor.',
      };
    }
  },

  async register(username: string, email: string, password: string): Promise<LoginResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, email, password }),
      });

      const data = await response.json();

      if (data.success && data.data?.token) {
        await AsyncStorage.setItem(TOKEN_KEY, data.data.token);
      }

      return data;
    } catch (error) {
      console.error('Register error:', error);
      return {
        success: false,
        error: 'Bağlantı hatası. Lütfen tekrar deneyin.',
      };
    }
  },

  async getProfile(): Promise<UserResponse> {
    try {
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      if (!token) {
        return {
          success: false,
          error: 'Oturum bulunamadı',
        };
      }

      const response = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      return response.json();
    } catch (error) {
      console.error('Profile error:', error);
      return {
        success: false,
        error: 'Profil yüklenemedi',
      };
    }
  },

  async logout(): Promise<void> {
    await AsyncStorage.removeItem(TOKEN_KEY);
  },

  async getToken(): Promise<string | null> {
    return AsyncStorage.getItem(TOKEN_KEY);
  },

  async isAuthenticated(): Promise<boolean> {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    return !!token;
  },
};

interface SensorReading {
  sensor_node_id: string;
  sensor_type: string;
  value: number;
  unit: string;
  timestamp: string;
}

interface SensorData {
  success: boolean;
  data?: {
    zone_id: string;
    zone_name: string;
    sensors: Array<{
      sensor_node_id: string;
      sensor_type: string;
      latest_reading?: SensorReading;
    }>;
  };
  error?: string;
}

interface HistoricalSensorData {
  success: boolean;
  data?: {
    zone_id: string;
    zone_name: string;
    readings: SensorReading[];
  };
  error?: string;
}

interface ZonesResponse {
  success: boolean;
  data?: {
    zones: Array<{
      zone_id: string;
      zone_name: string;
      field_name: string;
      farm_name: string;
    }>;
  };
  error?: string;
}

export const sensorAPI = {
  async getUserZones(): Promise<ZonesResponse> {
    try {
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      if (!token) {
        return { success: false, error: 'Oturum bulunamadı' };
      }

      console.log('Fetching zones from:', `${API_BASE_URL}/sensors/zones`);
      const response = await fetch(`${API_BASE_URL}/sensors/zones`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();
      console.log('Zones response:', data);
      return data;
    } catch (error) {
      console.error('Zones fetch error:', error);
      return {
        success: false,
        error: 'Zonalar yüklenemedi',
      };
    }
  },

  async getZoneSensors(zoneId: string): Promise<SensorData> {
    try {
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      if (!token) {
        return { success: false, error: 'Oturum bulunamadı' };
      }

      const response = await fetch(`${API_BASE_URL}/sensors/zone/${zoneId}/latest`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      return response.json();
    } catch (error) {
      console.error('Sensor data error:', error);
      return {
        success: false,
        error: 'Sensör verileri yüklenemedi',
      };
    }
  },

  async getZoneHistory(zoneId: string, hours: number = 24): Promise<HistoricalSensorData> {
    try {
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      if (!token) {
        return { success: false, error: 'Oturum bulunamadı' };
      }

      const url = `${API_BASE_URL}/sensors/zone/${zoneId}/history?hours=${hours}`;
      console.log('Fetching sensor history from:', url);
      
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      console.log('Sensor history response status:', response.status);
      const data = await response.json();
      console.log('Sensor history data:', JSON.stringify(data).substring(0, 200));
      
      return data;
    } catch (error) {
      console.error('Sensor history error:', error);
      return {
        success: false,
        error: 'Sensör geçmişi yüklenemedi',
      };
    }
  },
};
