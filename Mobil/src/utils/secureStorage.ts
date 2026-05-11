// Sifrelenmis AsyncStorage sarmalayici — hassas veriler icin (token, kullanici bilgisi)
// AES-256-GCM sifreleme expo-crypto ile

import AsyncStorage from "@react-native-async-storage/async-storage";
import { AESEncryptionKey, AESSealedData, aesEncryptAsync, aesDecryptAsync } from "expo-crypto";

const KEY_STORAGE = "__device_aes_key__";

let cachedKey: AESEncryptionKey | null = null;

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getOrCreateKey(): Promise<AESEncryptionKey> {
  if (cachedKey) return cachedKey;

  const stored = await AsyncStorage.getItem(KEY_STORAGE);
  if (stored) {
    cachedKey = await AESEncryptionKey.import(stored, "base64");
    return cachedKey;
  }

  cachedKey = await AESEncryptionKey.generate();
  const exported = await cachedKey.encoded("base64");
  await AsyncStorage.setItem(KEY_STORAGE, exported);
  return cachedKey;
}

export async function secureGet(key: string): Promise<string | null> {
  try {
    const stored = await AsyncStorage.getItem(key);
    if (!stored) return null;

    const aesKey = await getOrCreateKey();
    const bytes = base64ToBytes(stored);
    const sealed = AESSealedData.fromCombined(bytes);
    const decrypted = await aesDecryptAsync(sealed, aesKey);
    return new TextDecoder().decode(decrypted as Uint8Array);
  } catch (error) {
    // Sifre cozme basarisiz (eski plaintext token veya bozuk veri)
    // Bozuk anahtari temizle, null dondur — app login ekranina yonlensin
    console.log("[SECURE] decrypt failed for", key, "— clearing");
    await AsyncStorage.removeItem(key);
    return null;
  }
}

export async function secureSet(key: string, value: string): Promise<void> {
  try {
    const aesKey = await getOrCreateKey();
    const plaintext = new TextEncoder().encode(value);
    const sealed = await aesEncryptAsync(plaintext, aesKey);
    const combined = await sealed.combined("base64");
    await AsyncStorage.setItem(key, combined);
  } catch (error) {
    console.log("[SECURE] encrypt failed for", key, error);
    throw error;
  }
}

export async function secureRemove(key: string): Promise<void> {
  await AsyncStorage.removeItem(key);
}
