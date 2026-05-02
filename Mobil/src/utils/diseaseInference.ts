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
import { isPostNmsSchema, LEAF_INPUT_SIZE, LeafBox } from "./leafDetection";

export interface LocalInferenceResult {
  status: "confident" | "uncertain" | "dark" | "overexposed" | "no_leaf";
  className?: string;
  confidence?: number;
  allProbs?: Record<string, number>;
  inferenceMs?: number;
  /** Yaprak tespit cascade aktifken son tespit edilen kutu (debug + UI overlay) */
  leafBox?: LeafBox;
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

// ───────────────────────────────────────────────────────────────────────────
// Yaprak tespit cascade (toggle ile aktif)
// ───────────────────────────────────────────────────────────────────────────
//
// Bundled tflite RAW SSD cikislari veriyor (anchor decode + NMS gerek). Mobile
// JS'te bunu cozmek pratik degil. ML tarafi modeli MultilevelDetectionGenerator
// wrapper ile re-export edince (knowledge_ops.md §12) cascade calisir hale gelir.
//
// Bu hook'lar acilir-kapanir bir "slot" olarak yazildi:
//  - loadLeafDetectorModel() -> sema dogrulamasi yapar; yanlissa null doner
//  - Toggle JS state'inde yasiyor; null donen yuklemede toggle OFF'a doner
//  - Default OFF, AsyncStorage'da persist
//
// Modeli yeniledikten sonra hicbir mobile kod degisikligi gerekmez.

const STORAGE_KEY_LEAF_DELEGATE = "@taras/leaf_delegate_v1";
const STORAGE_KEY_LEAF_TOGGLE = "@taras/disease_use_leaf_v1";

let _leafModel: TensorflowModel | null = null;
let _leafLoadPromise: Promise<TensorflowModel | null> | null = null;
let _leafActiveDelegate: TensorflowModelDelegate | null = null;

async function tryLoadLeafWithDelegate(
  delegate: TensorflowModelDelegate,
): Promise<TensorflowModel> {
  return loadTensorflowModel(
    require("../../assets/models/leaf_detector/leaf_detector.tflite"),
    delegate,
  );
}

async function loadLeafWithFallbackChain(): Promise<TensorflowModel | null> {
  let chain = [...DELEGATE_CHAIN];
  try {
    const saved = (await AsyncStorage.getItem(
      STORAGE_KEY_LEAF_DELEGATE,
    )) as TensorflowModelDelegate | null;
    if (saved && chain.includes(saved)) {
      chain = [saved, ...chain.filter((d) => d !== saved)];
    }
  } catch {
    // sessiz — chain default ile devam
  }

  for (const delegate of chain) {
    try {
      const m = await tryLoadLeafWithDelegate(delegate);

      // Sema dogrulama — zero buffer ile bir kez calistir, post-NMS bekleniyor
      // (4 cikti tensoru: boxes, scores, classes, num_detections).
      // Eger raw SSD cikislari donerse (mevcut bundled model), null don.
      const dummy = new Float32Array(LEAF_INPUT_SIZE * LEAF_INPUT_SIZE * 3);
      const out = await m.run([dummy]);
      if (!isPostNmsSchema(out)) {
        const lengths = out
          .map((t) => (t as Float32Array | undefined)?.length ?? "?")
          .join(",");
        console.log(
          "[DISEASE] leaf detector schema mismatch:",
          out.length,
          "outputs (lengths:",
          lengths,
          "). Cascade unavailable until model is re-exported with NMS baked in.",
        );
        return null;
      }

      _leafActiveDelegate = delegate;
      console.log("[DISEASE] leaf detector yuklendi, delegate:", m.delegate);
      AsyncStorage.setItem(STORAGE_KEY_LEAF_DELEGATE, delegate).catch(() => {});
      return m;
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? String(err);
      console.log(`[DISEASE] leaf delegate ${delegate} basarisiz:`, msg);
    }
  }
  console.log("[DISEASE] leaf detector unavailable — tum delegate'ler basarisiz");
  return null;
}

/**
 * Loads the leaf detector tflite + validates output schema.
 * Returns the model on success, null on any failure (missing file, schema
 * mismatch, all delegates failed). Caller (useLiveScan) treats null as
 * "cascade disabled" and the toggle is reverted to OFF in JS state.
 *
 * Idempotent: subsequent calls reuse the cached model. Failures clear the
 * cache so a re-export can be tried without app restart.
 */
export function loadLeafDetectorModel(): Promise<TensorflowModel | null> {
  if (_leafModel) return Promise.resolve(_leafModel);
  if (_leafLoadPromise) return _leafLoadPromise;
  _leafLoadPromise = loadLeafWithFallbackChain()
    .then((m) => {
      _leafModel = m;
      if (!m) _leafLoadPromise = null; // null sonuc cache'lenmesin (re-try mumkun)
      return m;
    })
    .catch((err) => {
      _leafLoadPromise = null;
      console.log(
        "[ERR] leaf model yukleme:",
        (err as { message?: string })?.message,
      );
      return null;
    });
  return _leafLoadPromise;
}

export function getLeafActiveDelegate(): TensorflowModelDelegate | null {
  return _leafActiveDelegate;
}

/** Toggle persistence: default OFF (return false on missing/error). */
export async function loadLeafToggle(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(STORAGE_KEY_LEAF_TOGGLE);
    return v === "1";
  } catch {
    return false;
  }
}

export function saveLeafToggle(on: boolean): void {
  AsyncStorage.setItem(STORAGE_KEY_LEAF_TOGGLE, on ? "1" : "0").catch(() => {});
}
