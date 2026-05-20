// Cihaz uzerinde hastalik tespiti — delegate fallback zinciri ile model yukleme
// Inference useLiveScan icinde calisir; bu modul model yuklemeden + delegate seciminden sorumlu
//
// Strateji:
//   - Android: nnapi -> default (CPU)
//   - iOS:     core-ml -> metal -> default (CPU)
// Calisan delegate AsyncStorage'a kaydedilir; sonraki acilis dogrudan onu dener.
// Mimari fallback (worklet -> JS thread) ayri bir bayrak olarak saklanir.

import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  loadTensorflowModel,
  TensorflowModel,
  TensorflowModelDelegate,
} from "react-native-fast-tflite";

export interface LocalInferenceResult {
  status: "confident" | "uncertain" | "dark" | "overexposed";
  className?: string;
  confidence?: number;
  allProbs?: Record<string, number>;
  inferenceMs?: number;
}

const STORAGE_KEY_DELEGATE = "@taras/disease_delegate_v1";
const STORAGE_KEY_ARCH_FALLBACK = "@taras/disease_arch_fallback_v1";

const DELEGATE_CHAIN: TensorflowModelDelegate[] = Platform.select({
  ios: ["core-ml", "metal", "default"],
  android: ["nnapi", "default"],
  default: ["default"],
}) as TensorflowModelDelegate[];

let _model: TensorflowModel | null = null;
let _loadPromise: Promise<TensorflowModel> | null = null;
let _activeDelegate: TensorflowModelDelegate | null = null;

async function tryLoadWithDelegate(
  delegate: TensorflowModelDelegate,
): Promise<TensorflowModel> {
  return loadTensorflowModel(
    require("../../assets/models/disease_detection/disease_model.tflite"),
    delegate,
  );
}

async function loadWithFallbackChain(): Promise<TensorflowModel> {
  // Onceki acilista calisan delegate varsa onu zincirin basina koy
  let chain = [...DELEGATE_CHAIN];
  try {
    const saved = (await AsyncStorage.getItem(
      STORAGE_KEY_DELEGATE,
    )) as TensorflowModelDelegate | null;
    if (saved && chain.includes(saved)) {
      chain = [saved, ...chain.filter((d) => d !== saved)];
    }
  } catch {
    // AsyncStorage hatasi sessiz — chain default ile devam eder
  }

  let lastErr: unknown = null;
  for (const delegate of chain) {
    try {
      const m = await tryLoadWithDelegate(delegate);
      _activeDelegate = delegate;
      console.log("[DISEASE] tflite yuklendi, delegate:", m.delegate);
      // Calisan delegate'i kaydet — sonraki acilista dogrudan kullanilir
      AsyncStorage.setItem(STORAGE_KEY_DELEGATE, delegate).catch(() => {});
      return m;
    } catch (err) {
      lastErr = err;
      const msg = (err as { message?: string })?.message ?? String(err);
      console.log(`[DISEASE] delegate ${delegate} basarisiz:`, msg);
      // Delegate degisikligini logla
      if (delegate !== chain[chain.length - 1]) {
        const next = chain[chain.indexOf(delegate) + 1];
        console.log(`[DISEASE] delegate fallback: ${delegate} -> ${next}`);
      }
    }
  }
  throw lastErr ?? new Error("Tum delegate'ler basarisiz");
}

export function loadDiseaseModel(): Promise<TensorflowModel> {
  if (_model) return Promise.resolve(_model);
  if (_loadPromise) return _loadPromise;
  try {
    _loadPromise = loadWithFallbackChain()
      .then((m) => {
        _model = m;
        return m;
      })
      .catch((err) => {
        _loadPromise = null;
        throw err;
      });
  } catch (err) {
    _loadPromise = null;
    return Promise.reject(err);
  }
  return _loadPromise;
}

export function getActiveDelegate(): TensorflowModelDelegate | null {
  return _activeDelegate;
}

// ── Mimari secimi (worklet vs JS-thread inference) ────────────────────────
// useLiveScan ust uste 3 worklet hatasi gorurse "fallback" bayragini kaldirir;
// sonraki oturumlar dogrudan B mimarisinden baslar.

export async function loadArchFallbackPreference(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(STORAGE_KEY_ARCH_FALLBACK);
    return v === "1";
  } catch {
    return false;
  }
}

export function persistArchFallback(): void {
  AsyncStorage.setItem(STORAGE_KEY_ARCH_FALLBACK, "1").catch(() => {});
}
