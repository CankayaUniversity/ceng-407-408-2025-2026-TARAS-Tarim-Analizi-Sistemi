// Disease detection submit'iyle birlikte gonderilen metadata sidecar.
// Backend bu blob'u oldugu gibi `disease_detection.capture_metadata` kolonuna yazar.

import Constants from "expo-constants";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY_DATASET_CONSENT = "@taras/dataset_consent_v1";
const APP_VERSION = Constants.expoConfig?.version ?? "0.0.0";

export interface CaptureMetadata {
  device: {
    model: string;
    os: string;
    app_version: string;
  };
  capture: {
    captured_at: string;
    image_dimensions?: { width: number; height: number };
    size_bytes?: number;
  };
  live_scan_prediction?: {
    class: string;
    confidence: number;
  } | null;
  // Settings'teki "TARAS'i gelistirmeye yardim et" toggle'inin capture anindaki degeri.
  consent_dataset: boolean;
}

export async function loadDatasetConsent(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(STORAGE_KEY_DATASET_CONSENT);
    // Pilot asamasinda default ON; public launch oncesi OFF'a cekilecek.
    if (v == null) return true;
    return v === "1";
  } catch {
    return true;
  }
}

export async function saveDatasetConsent(value: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY_DATASET_CONSENT, value ? "1" : "0");
  } catch {
    // sessizce yut
  }
}

interface BuildOpts {
  imageDimensions?: { width: number; height: number } | null;
  imageSizeBytes?: number | null;
  liveScanResult?: {
    className?: string;
    confidence?: number;
  } | null;
}

export async function buildCaptureMetadata(opts: BuildOpts = {}): Promise<CaptureMetadata> {
  const consent = await loadDatasetConsent();
  return {
    device: {
      // Platform.constants.Model sadece Android'de typedlanmamis sekilde mevcut.
      model:
        ((Platform.constants as unknown as { Model?: string })?.Model) ??
        ((Platform.constants as unknown as { systemName?: string })?.systemName) ??
        Platform.OS,
      os: `${Platform.OS} ${Platform.Version}`,
      app_version: APP_VERSION,
    },
    capture: {
      captured_at: new Date().toISOString(),
      ...(opts.imageDimensions ? { image_dimensions: opts.imageDimensions } : {}),
      ...(opts.imageSizeBytes ? { size_bytes: opts.imageSizeBytes } : {}),
    },
    live_scan_prediction:
      opts.liveScanResult?.className && typeof opts.liveScanResult.confidence === "number"
        ? {
            class: opts.liveScanResult.className,
            confidence: opts.liveScanResult.confidence,
          }
        : null,
    consent_dataset: consent,
  };
}
