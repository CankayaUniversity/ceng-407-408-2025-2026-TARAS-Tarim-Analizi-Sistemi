// BLE yardimci modulu - gateway provizyon islemleri
// react-native-ble-plx ile BLE tarama, baglanti ve GATT yazma

import { BleManager, Device, State } from "react-native-ble-plx";
import { Platform, PermissionsAndroid } from "react-native";

const SERVICE_UUID = "4e5f6a7b-1234-5678-9abc-def012345678";
const CHAR_SSID = "4e5f6a7b-1234-5678-9abc-def012345601";
const CHAR_PASS = "4e5f6a7b-1234-5678-9abc-def012345602";
const CHAR_KEY = "4e5f6a7b-1234-5678-9abc-def012345603";
const CHAR_STATUS = "4e5f6a7b-1234-5678-9abc-def012345604";

const GATEWAY_PREFIX = "TARAS-GW-";

// Status byte degerleri
const STATUS_SAVING = 0x01;
const STATUS_SUCCESS = 0x02;
const STATUS_BACKEND_FAIL = 0xfd;
const STATUS_WIFI_FAIL = 0xfe;
const STATUS_ERROR = 0xff;

// Base64 encoder - React Native ortaminda btoa() olmayabilir
const BASE64_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export const base64Encode = (str: string): string => {
  let result = "";
  const bytes = Array.from(str).map((c) => c.charCodeAt(0));
  let i = 0;

  while (i < bytes.length) {
    const b0 = bytes[i++] || 0;
    const b1 = bytes[i++] ?? 0;
    const b2 = bytes[i++] ?? 0;
    const hasSecond = i - 2 < bytes.length;
    const hasThird = i - 1 < bytes.length;

    result += BASE64_CHARS[b0 >> 2];
    result += BASE64_CHARS[((b0 & 3) << 4) | (b1 >> 4)];
    result += hasSecond ? BASE64_CHARS[((b1 & 15) << 2) | (b2 >> 6)] : "=";
    result += hasThird ? BASE64_CHARS[b2 & 63] : "=";
  }

  return result;
};

// Android icin BLE ve konum izinleri iste
export const requestPermissions = async (): Promise<boolean> => {
  if (Platform.OS !== "android") return true;

  try {
    const apiLevel = Platform.Version;

    // Android 12+ (API 31) icin BLUETOOTH_SCAN ve BLUETOOTH_CONNECT
    if (apiLevel >= 31) {
      const results = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);

      const allGranted = Object.values(results).every(
        (r) => r === PermissionsAndroid.RESULTS.GRANTED,
      );

      if (!allGranted) {
        console.log("[BLE] izinler reddedildi:", results);
        return false;
      }
      return true;
    }

    // Android 11 ve alti icin sadece konum izni
    const locationResult = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    );

    if (locationResult !== PermissionsAndroid.RESULTS.GRANTED) {
      console.log("[BLE] konum izni reddedildi");
      return false;
    }
    return true;
  } catch (error) {
    console.log("[BLE] izin hatasi:", error);
    return false;
  }
};

// BLE durumunu kontrol et
export const checkBLEState = async (
  manager: BleManager,
): Promise<boolean> => {
  try {
    const state = await manager.state();
    if (state === State.PoweredOn) return true;

    console.log("[BLE] durum:", state);

    // BLE acilana kadar bekle (max 5 saniye)
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        subscription.remove();
        resolve(false);
      }, 5000);

      const subscription = manager.onStateChange((newState) => {
        if (newState === State.PoweredOn) {
          clearTimeout(timeout);
          subscription.remove();
          resolve(true);
        }
      }, true);
    });
  } catch (error) {
    console.log("[BLE] durum kontrol hatasi:", error);
    return false;
  }
};

// TARAS-GW-* cihazlarini tara
export const scanForGateways = async (
  manager: BleManager,
  timeoutMs: number,
  onFound: (device: Device) => void,
): Promise<void> => {
  console.log("[BLE] tarama baslatiliyor:", timeoutMs, "ms");

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      manager.stopDeviceScan();
      console.log("[BLE] tarama suresi doldu");
      resolve();
    }, timeoutMs);

    manager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        console.log("[BLE] tarama hatasi:", error.message);
        clearTimeout(timeout);
        resolve();
        return;
      }

      if (device?.name?.startsWith(GATEWAY_PREFIX)) {
        console.log("[BLE] gateway bulundu:", device.name, "rssi:", device.rssi);
        onFound(device);
      }
    });
  });
};

// Taramayi durdur
export const stopScan = (manager: BleManager): void => {
  try {
    manager.stopDeviceScan();
    console.log("[BLE] tarama durduruldu");
  } catch (error) {
    console.log("[BLE] tarama durdurma hatasi:", error);
  }
};

// Gateway provizyon - baglanti kur, GATT yaz, durum izle
export const provisionGateway = async (
  manager: BleManager,
  deviceId: string,
  ssid: string,
  password: string,
  apiKey: string,
  onStatus: (status: number) => void,
): Promise<boolean> => {
  try {
    console.log("[BLE] baglaniliyor:", deviceId);

    // Cihaza baglan
    const device = await manager.connectToDevice(deviceId, {
      requestMTU: 512,
      timeout: 10000,
    });
    console.log("[BLE] baglandi:", device.id);

    // Servisleri ve characteristic'leri kesfet
    await device.discoverAllServicesAndCharacteristics();
    console.log("[BLE] servisler kesfedildi");

    // Yazmalar + WiFi testi: gateway yazma sonrasi WiFi test eder
    // Status dinlemeyi once baslat (gateway 0x01=testing, 0x02=ok, 0xFE=wifi_fail, 0xFF=error gonderir)
    console.log("[BLE] ssid yaziliyor");
    await device.writeCharacteristicWithResponseForService(
      SERVICE_UUID, CHAR_SSID, base64Encode(ssid));

    console.log("[BLE] sifre yaziliyor");
    await device.writeCharacteristicWithResponseForService(
      SERVICE_UUID, CHAR_PASS, base64Encode(password));

    console.log("[BLE] api key yaziliyor");
    await device.writeCharacteristicWithResponseForService(
      SERVICE_UUID, CHAR_KEY, base64Encode(apiKey));

    console.log("[BLE] yazmalar tamam, WiFi testi bekleniyor...");
    onStatus(STATUS_SAVING);

    // Gateway simdi WiFi test ediyor (15s), sonucu bekle
    return new Promise((resolve) => {
      let resolved = false;

      const timeout = setTimeout(() => {
        if (resolved) return;
        resolved = true;
        console.log("[BLE] WiFi test zaman asimi");
        subscription.remove();
        device.cancelConnection().catch(() => {});
        resolve(false);
      }, 30000);

      const subscription = device.monitorCharacteristicForService(
        SERVICE_UUID, CHAR_STATUS,
        (error, characteristic) => {
          if (resolved) return;

          if (error) {
            // Disconnect after writes = gateway rebooted = success
            console.log("[BLE] disconnect (muhtemelen reboot):", error.message);
            resolved = true;
            clearTimeout(timeout);
            subscription.remove();
            onStatus(STATUS_SUCCESS);
            resolve(true);
            return;
          }

          if (characteristic?.value) {
            const status = base64DecodeByte(characteristic.value);
            console.log("[BLE] status:", "0x" + status.toString(16));
            onStatus(status);

            if (status === STATUS_SUCCESS) {
              resolved = true;
              clearTimeout(timeout);
              subscription.remove();
              device.cancelConnection().catch(() => {});
              resolve(true);
            } else if (status === STATUS_WIFI_FAIL || status === STATUS_BACKEND_FAIL) {
              resolved = true;
              clearTimeout(timeout);
              subscription.remove();
              console.log(status === STATUS_WIFI_FAIL
                ? "[BLE] WiFi baglantisi basarisiz!"
                : "[BLE] Backend sunucusuna ulasilamiyor!");
              resolve(false);
            } else if (status === STATUS_ERROR) {
              resolved = true;
              clearTimeout(timeout);
              subscription.remove();
              device.cancelConnection().catch(() => {});
              resolve(false);
            }
          }
        },
      );
    });
  } catch (error) {
    console.log(
      "[BLE] provizyon hatasi:",
      error instanceof Error ? error.message : error,
    );
    return false;
  }
};

// Base64 tek byte decode (BLE status okumak icin)
// Base64 decode — tek byte icin ozel destek (BLE status byte)
function base64DecodeByte(input: string): number {
  const chars = BASE64_CHARS;
  const str = input.replace(/=+$/, "");
  if (str.length < 2) return 0;
  const a = chars.indexOf(str[0]);
  const b = chars.indexOf(str[1]);
  return ((a << 2) | (b >> 4)) & 0xff;
}
