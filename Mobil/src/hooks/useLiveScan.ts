// Canli tarama — TFLite + vision-camera frame processor
//
// Iki mimari, hata sayisina gore otomatik gecis:
//   A) Worklet runSync — tum is worklet thread'inde, yalnizca sonuc objesi JS'e (resmi yol)
//   B) Bridge fallback — uint8 buffer JS'e, normalize + run() JS thread'inde, tek pre-allocated f32 buffer
//
// Adaptif tempo: bir EMA latency * safety_factor ile interval hesaplanir; sabit FPS yok.
// Stabil sahne tasarrufu: 2 sn boyunca ayni sonuc + parlaklik degisimi yoksa keep-alive (2.5 Hz).
// AppState: arka plana gectiginde frame processor durur, on plana gelince devam eder.
// AsyncStorage: ust uste 3 worklet hatasinda B mimarisi kaydedilir; bir sonraki acilis B'den baslar.

import { useState, useEffect, useRef, useCallback } from "react";
import { AppState } from "react-native";
import { useFrameProcessor } from "react-native-vision-camera";
import type { ReadonlyFrameProcessor } from "react-native-vision-camera";
import { useResizePlugin } from "vision-camera-resize-plugin";
import { useRunOnJS, useSharedValue } from "react-native-worklets-core";
import type { ISharedValue } from "react-native-worklets-core";
import type { TensorflowModel } from "react-native-fast-tflite";
import manifest from "../../assets/models/disease_detection/model_manifest.json";
import {
  loadDiseaseModel,
  loadLeafDetectorModel,
  loadArchFallbackPreference,
  persistArchFallback,
  saveLeafToggle,
  type LocalInferenceResult,
} from "../utils/diseaseInference";
import {
  LEAF_INPUT_SIZE,
  parseLeafDetectorOutputs,
  leafBoxToCropPx,
  normalizeLeafInputInPlace,
  type LeafBox,
} from "../utils/leafDetection";

// ── Sabitler ─────────────────────────────────────────────────────────────
const SMOOTH_WINDOW = 5;
const SMOOTH_MIN = 3;

const MIN_INTERVAL_MS = 100;         // 10 Hz tavan — kameranin/UI thread'in nefesi
const SAFETY_FACTOR = 2.0;           // EMA * 2.0 = %100 pay (ust sinir yok)

const LIGHT_DARK_THR = 40 / 255;
const LIGHT_BRIGHT_THR = 220 / 255;

const ARCH_ERROR_THRESHOLD = 3;      // ust uste N hata sonrasi B'ye ge

const INPUT_SIZE = 224 * 224 * 3;    // 150528

export interface UseLiveScanReturn {
  liveResult: LocalInferenceResult | null;
  modelLoading: boolean;
  frameProcessor: ReadonlyFrameProcessor | undefined;
  inferenceMs: number | null;
  /** Bir sonraki taramaya kadar gecen sure (ms) — UI ring icin */
  currentIntervalMs: number;
  /** Photo capture'in worklet'in bitmesini beklemek icin kullandigi promise */
  waitForInflightDrained: (timeoutMs?: number) => Promise<void>;
  /** Yaprak cascade aktif mi (model yuklenebildi mi)? */
  leafCascadeActive: boolean;
}

export function useLiveScan(
  isActive: boolean,
  pauseRef?: ISharedValue<boolean>,
  useLeafDetection: boolean = false,
): UseLiveScanReturn {
  // ── React state ──────────────────────────────────────────────────────
  const [liveResult, setLiveResult] = useState<LocalInferenceResult | null>(null);
  const [inferenceMs, setInferenceMs] = useState<number | null>(null);
  const [currentIntervalMs, setCurrentIntervalMs] = useState<number>(MIN_INTERVAL_MS);
  const [model, setModel] = useState<TensorflowModel | undefined>(undefined);
  const [modelLoading, setModelLoading] = useState(false);
  const [leafModel, setLeafModel] = useState<TensorflowModel | undefined>(undefined);
  const [leafCascadeActive, setLeafCascadeActive] = useState(false);

  // ── Resize plugin ─────────────────────────────────────────────────────
  const { resize } = useResizePlugin();

  // ── Shared values (worklet runtime) ──────────────────────────────────
  const inflightShared = useSharedValue(false);
  const lastFireMsShared = useSharedValue(0);
  const latencyEmaShared = useSharedValue(0);
  const lastEmittedKeyShared = useSharedValue<string>("");
  const errorCountShared = useSharedValue(0);
  const useFallbackShared = useSharedValue(false);
  const appPausedShared = useSharedValue(false);
  // Yaprak cascade flag — JS effect bunu setLeafShared.value ile gunceller
  const useLeafShared = useSharedValue(false);

  // ── JS-side refs ──────────────────────────────────────────────────────
  const modelRef = useRef<TensorflowModel | null>(null);
  const historyRef = useRef<LocalInferenceResult[]>([]);
  const lastEmittedKeyRef = useRef<string>("");
  const lastTimerEmitRef = useRef(0);
  // Mimari B icin tek seferlik allocate edilen buffer (asla yeniden tahsis edilmez)
  const f32BufRef = useRef<Float32Array | null>(null);
  // Cancellation guard — modal kapandiginda bayat setState'i engeller
  const aliveRef = useRef(true);

  // ── Manifest sabitleri (primitive) ────────────────────────────────────
  const T = manifest.output.postprocessing.divide_by_temperature;
  const confidenceThreshold = manifest.output.postprocessing.confidence_threshold;
  const classNames = manifest.classes.map((c) => c.name);
  const numClasses = classNames.length;
  const meanR = manifest.input.preprocessing.normalize_mean[0];
  const meanG = manifest.input.preprocessing.normalize_mean[1];
  const meanB = manifest.input.preprocessing.normalize_mean[2];
  const invStdR = 1 / manifest.input.preprocessing.normalize_std[0];
  const invStdG = 1 / manifest.input.preprocessing.normalize_std[1];
  const invStdB = 1 / manifest.input.preprocessing.normalize_std[2];

  // ── Yumusatma (cogunluk + ortalama guven) ─────────────────────────────
  const smooth = useCallback((raw: LocalInferenceResult): LocalInferenceResult => {
    if (raw.status === "dark" || raw.status === "overexposed") {
      historyRef.current = [];
      return raw;
    }

    const buf = historyRef.current;
    buf.push(raw);
    if (buf.length > SMOOTH_WINDOW) buf.shift();

    if (buf.length < SMOOTH_MIN) return { status: "uncertain" };

    const confidents = buf.filter((p) => p.status === "confident" && p.className);
    if (confidents.length === 0) return { status: "uncertain" };

    const counts = new Map<string, number>();
    confidents.forEach((p) => {
      counts.set(p.className!, (counts.get(p.className!) ?? 0) + 1);
    });

    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const [topClass, topCount] = sorted[0];
    if (topCount < SMOOTH_MIN) return { status: "uncertain" };

    const matching = confidents.filter((p) => p.className === topClass);
    const avgConf = matching.reduce((s, p) => s + (p.confidence ?? 0), 0) / buf.length;

    const avgProbs: Record<string, number> = {};
    if (matching[0].allProbs) {
      Object.keys(matching[0].allProbs).forEach((k) => {
        avgProbs[k] = confidents.reduce(
          (s, p) => s + (p.allProbs?.[k] ?? 0),
          0,
        ) / confidents.length;
      });
    }

    return {
      status: "confident",
      className: topClass,
      confidence: avgConf,
      allProbs: avgProbs,
    };
  }, []);

  // ── Sonuc emisyonu (JS-side dedup) ────────────────────────────────────
  const commitResult = useCallback(
    (next: LocalInferenceResult, ms: number) => {
      if (!aliveRef.current) return;
      const smoothed = smooth(next);
      const conf = Math.round((smoothed.confidence ?? 0) * 20); // 5%'lik kovalar
      const key = `${smoothed.status}:${smoothed.className ?? ""}:${conf}`;
      if (key !== lastEmittedKeyRef.current) {
        lastEmittedKeyRef.current = key;
        setLiveResult(smoothed);
      }
      const now = Date.now();
      if (now - lastTimerEmitRef.current > 500) {
        lastTimerEmitRef.current = now;
        setInferenceMs(ms);
        // UI ring icin: bir sonraki tarama yaklasik olarak ne kadar surecek?
        // ms*SAFETY_FACTOR, alt sinir MIN_INTERVAL_MS, ust sinir yok
        let interval = ms * SAFETY_FACTOR;
        if (interval < MIN_INTERVAL_MS) interval = MIN_INTERVAL_MS;
        setCurrentIntervalMs(interval);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [smooth],
  );

  // ── Worklet -> JS koprusu (Mimari A): kucuk sonuc objesi ──────────────
  const emitResult = useRunOnJS(
    (next: LocalInferenceResult, ms: number) => {
      try {
        commitResult(next, ms);
      } catch (err) {
        console.log("[ERR] emitResult:", (err as { message?: string })?.message);
      }
    },
    [commitResult],
  );

  // ── Worklet -> JS koprusu (Mimari B): uint8 buffer ────────────────────
  const processOnJS = useRunOnJS(
    async (uint8: Uint8Array) => {
      try {
        const m = modelRef.current;
        if (!m) {
          inflightShared.value = false;
          return;
        }
        // Pre-allocated buffer'i bir kez olustur, sonra hep yeniden kullan
        if (!f32BufRef.current) {
          f32BufRef.current = new Float32Array(INPUT_SIZE);
        }
        const f32 = f32BufRef.current;

        // uint8 [0..255] -> float32 [0..1] -> ImageNet normalize (tek pass)
        const len = uint8.length;
        for (let i = 0; i < len; i += 3) {
          f32[i] = (uint8[i] / 255 - meanR) * invStdR;
          f32[i + 1] = (uint8[i + 1] / 255 - meanG) * invStdG;
          f32[i + 2] = (uint8[i + 2] / 255 - meanB) * invStdB;
        }

        const t0 = Date.now();
        const outputs = await m.run([f32]);
        const ms = Date.now() - t0;
        const logits = outputs[0] as Float32Array;

        // Softmax + argmax (10 element, tek pass)
        let maxLogit = -Infinity;
        for (let i = 0; i < numClasses; i++) {
          const v = logits[i] / T;
          if (v > maxLogit) maxLogit = v;
        }
        let sumExp = 0;
        const probs = new Array<number>(numClasses);
        for (let i = 0; i < numClasses; i++) {
          const e = Math.exp(logits[i] / T - maxLogit);
          probs[i] = e;
          sumExp += e;
        }
        const invSum = 1 / sumExp;
        let topProb = 0;
        let topIdx = 0;
        for (let i = 0; i < numClasses; i++) {
          probs[i] *= invSum;
          if (probs[i] > topProb) {
            topProb = probs[i];
            topIdx = i;
          }
        }

        let result: LocalInferenceResult;
        if (topProb < confidenceThreshold) {
          result = { status: "uncertain" };
        } else {
          const allProbs: Record<string, number> = {};
          for (let i = 0; i < numClasses; i++) {
            allProbs[classNames[i]] = probs[i];
          }
          result = {
            status: "confident",
            className: classNames[topIdx],
            confidence: topProb,
            allProbs,
          };
        }
        commitResult(result, ms);
        // EMA worklet tarafinda hesaplaniyor; B mimarisi de paylasir
        latencyEmaShared.value =
          latencyEmaShared.value === 0
            ? ms
            : latencyEmaShared.value * 0.7 + ms * 0.3;
      } catch (err) {
        console.log("[ERR] processOnJS:", (err as { message?: string })?.message);
      } finally {
        inflightShared.value = false;
      }
    },
    [commitResult],
  );

  // ── Model yukleme + B-fallback tercihi ────────────────────────────────
  useEffect(() => {
    if (!isActive) return;
    if (modelRef.current) return;

    let cancelled = false;
    setModelLoading(true);

    // Onceki oturumda B'ye dustuysek dogrudan baslat
    loadArchFallbackPreference().then((useFallback) => {
      if (cancelled) return;
      if (useFallback) {
        useFallbackShared.value = true;
        console.log("[DISEASE] arch: B (onceki oturumdan kaydedilmis)");
      } else {
        console.log("[DISEASE] arch: A (worklet runSync deneniyor)");
      }
    });

    loadDiseaseModel()
      .then((m) => {
        if (cancelled) return;
        modelRef.current = m;
        setModel(m);
        setModelLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.log("[ERR] model yukleme:", (err as { message?: string })?.message);
        setModelLoading(false);
      });

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  // ── Yaprak modeli yukleme (toggle aktif + ekran aktifken) ─────────────
  // Sema dogrulama loadLeafDetectorModel icinde yapilir; null donerse
  // toggle JS state'inde OFF'a doner ve persist edilir (kullanici elle
  // tekrar acmazsa bir daha denenmez).
  useEffect(() => {
    if (!isActive) return;
    if (!useLeafDetection) {
      // Toggle OFF — cascade flag'i indir, model state'i temizle (model JS-side
      // singleton'da kalir, gereksiz reload yok).
      useLeafShared.value = false;
      setLeafCascadeActive(false);
      return;
    }
    if (leafModel) {
      // Zaten yuklenmis
      useLeafShared.value = true;
      setLeafCascadeActive(true);
      return;
    }

    let cancelled = false;
    loadLeafDetectorModel()
      .then((m) => {
        if (cancelled) return;
        if (!m) {
          // Sema yanlis veya tum delegate'ler basarisiz — toggle'i OFF'a dusur
          console.log("[DISEASE] leaf cascade unavailable — toggle reverting to OFF");
          saveLeafToggle(false);
          useLeafShared.value = false;
          setLeafCascadeActive(false);
          return;
        }
        setLeafModel(m);
        useLeafShared.value = true;
        setLeafCascadeActive(true);
      })
      .catch((err) => {
        if (cancelled) return;
        console.log(
          "[ERR] leaf model load:",
          (err as { message?: string })?.message,
        );
        saveLeafToggle(false);
        useLeafShared.value = false;
        setLeafCascadeActive(false);
      });

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, useLeafDetection]);

  // ── AppState: arka plan/on plan ──────────────────────────────────────
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      const paused = state !== "active";
      appPausedShared.value = paused;
      if (paused) {
        inflightShared.value = false;
      }
    });
    return () => sub.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Inactive temizligi ───────────────────────────────────────────────
  useEffect(() => {
    aliveRef.current = true;
    if (!isActive) {
      historyRef.current = [];
      lastEmittedKeyRef.current = "";
      setLiveResult(null);
      setInferenceMs(null);
      setCurrentIntervalMs(MIN_INTERVAL_MS);
      inflightShared.value = false;
      lastEmittedKeyShared.value = "";
      lastFireMsShared.value = 0;
      latencyEmaShared.value = 0;
      // errorCountShared & useFallbackShared korunur — oturum boyu
    }
    return () => {
      aliveRef.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  // ── Photo capture senkronizasyonu ────────────────────────────────────
  const waitForInflightDrained = useCallback(
    async (timeoutMs = 400): Promise<void> => {
      const start = Date.now();
      while (inflightShared.value && Date.now() - start < timeoutMs) {
        await new Promise((r) => setTimeout(r, 16));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ── Mimari A -> B otomatik gecisi (worklet hatalari) ──────────────────
  const onWorkletError = useRunOnJS((msg: string) => {
    console.log("[ERR] worklet:", msg);
    if (useFallbackShared.value) return;
    if (errorCountShared.value >= ARCH_ERROR_THRESHOLD) {
      useFallbackShared.value = true;
      persistArchFallback();
      console.log("[DISEASE] arch: A -> B (worklet ust uste hata, kalici)");
    }
  }, []);

  // ── Frame processor ──────────────────────────────────────────────────
  const frameProcessor = useFrameProcessor(
    (frame) => {
      "worklet";
      // Erken cikislar
      if (appPausedShared.value) return;
      if (pauseRef && pauseRef.value) return;
      if (inflightShared.value) return;
      if (!model) return;

      // Adaptif interval — EMA * SAFETY_FACTOR, alt sinir MIN_INTERVAL_MS, ust sinir yok
      // Bootstrap (ilk frame): MIN_INTERVAL_MS — hizli baslat, sonra EMA devralir
      const now = Date.now();
      const ema = latencyEmaShared.value;
      let interval = ema > 0 ? ema * SAFETY_FACTOR : MIN_INTERVAL_MS;
      if (interval < MIN_INTERVAL_MS) interval = MIN_INTERVAL_MS;
      if (now - lastFireMsShared.value < interval) return;
      lastFireMsShared.value = now;

      try {
        inflightShared.value = true;

        // ── 0) YAPRAK CASCADE — toggle ON + leafModel hazir + Mimari A ──
        // Once leaf detector. Yaprak yoksa siniflandirici cagrilmaz (enerji + dogruluk).
        // Yaprak varsa kutu kare crop'a donusturulur; classifier bu crop uzerinde calisir.
        // Mimari B (JS-thread fallback) cascade'i atlar — leaf inference worklet sync gerektiriyor.
        let cropPx: { x: number; y: number; width: number; height: number } | undefined;
        let detectedLeafBox: LeafBox | undefined;
        if (useLeafShared.value && leafModel && !useFallbackShared.value) {
          const leafInput = resize(frame, {
            scale: { width: LEAF_INPUT_SIZE, height: LEAF_INPUT_SIZE },
            pixelFormat: "rgb",
            dataType: "float32",
          }) as Float32Array;
          normalizeLeafInputInPlace(leafInput);

          const leafOutputs = leafModel.runSync([leafInput]);
          const leafResult = parseLeafDetectorOutputs(leafOutputs);

          if (!leafResult.available) {
            // Sema dogrulamasi yukleme zamaninda yapildi; buraya dusmemeli.
            // Defansif: bu frame'de cascade'i atla, classifier full frame'le calissin.
          } else if (!leafResult.topBox) {
            const k = "no_leaf:";
            if (lastEmittedKeyShared.value !== k) {
              lastEmittedKeyShared.value = k;
              emitResult({ status: "no_leaf" }, 0);
            }
            inflightShared.value = false;
            return;
          } else {
            cropPx = leafBoxToCropPx(leafResult.topBox, frame.width, frame.height);
            detectedLeafBox = leafResult.topBox;
          }
        }

        // 1) Resize — options inline (worklet runtime alocate eder)
        // Mimari B icin uint8, Mimari A icin float32 — secim worklet basinda
        // cropPx varsa (cascade aktif + yaprak bulundu) o bolge resize edilir
        const useB = useFallbackShared.value;
        const f32OrU8 = useB
          ? (cropPx
              ? resize(frame, {
                  crop: cropPx,
                  scale: { width: 224, height: 224 },
                  pixelFormat: "rgb",
                  dataType: "uint8",
                })
              : resize(frame, {
                  scale: { width: 224, height: 224 },
                  pixelFormat: "rgb",
                  dataType: "uint8",
                }))
          : (cropPx
              ? resize(frame, {
                  crop: cropPx,
                  scale: { width: 224, height: 224 },
                  pixelFormat: "rgb",
                  dataType: "float32",
                })
              : resize(frame, {
                  scale: { width: 224, height: 224 },
                  pixelFormat: "rgb",
                  dataType: "float32",
                }));

        const len = f32OrU8.length;

        // 2) Subsampled luma (her 16. piksel) — A ve B icin ortak
        let lumaSum = 0;
        let sampleCount = 0;
        if (useB) {
          // uint8 yolu: /255 fly'da
          for (let i = 0; i < len; i += 48) {
            lumaSum +=
              0.299 * (f32OrU8[i] / 255) +
              0.587 * (f32OrU8[i + 1] / 255) +
              0.114 * (f32OrU8[i + 2] / 255);
            sampleCount++;
          }
        } else {
          for (let i = 0; i < len; i += 48) {
            lumaSum += 0.299 * f32OrU8[i] + 0.587 * f32OrU8[i + 1] + 0.114 * f32OrU8[i + 2];
            sampleCount++;
          }
        }
        const meanLuma = lumaSum / sampleCount;

        // Aydinlatma erken cikis — buffer JS'e gitmeden
        if (meanLuma < LIGHT_DARK_THR) {
          const k = "dark:";
          if (lastEmittedKeyShared.value !== k) {
            lastEmittedKeyShared.value = k;
            emitResult({ status: "dark" }, 0);
          }
          inflightShared.value = false;
          return;
        }
        if (meanLuma > LIGHT_BRIGHT_THR) {
          const k = "overexposed:";
          if (lastEmittedKeyShared.value !== k) {
            lastEmittedKeyShared.value = k;
            emitResult({ status: "overexposed" }, 0);
          }
          inflightShared.value = false;
          return;
        }

        // ── Mimari B: uint8'i JS'e ship et (~150 KB) ───────────────────
        if (useB) {
          processOnJS(f32OrU8 as Uint8Array);
          // inflight processOnJS finally'sinde temizlenir
          return;
        }

        // ── Mimari A: tum is worklet'te ──────────────────────────────
        const f32 = f32OrU8 as Float32Array;
        for (let i = 0; i < len; i += 3) {
          f32[i] = (f32[i] - meanR) * invStdR;
          f32[i + 1] = (f32[i + 1] - meanG) * invStdG;
          f32[i + 2] = (f32[i + 2] - meanB) * invStdB;
        }

        const t0 = Date.now();
        const outputs = model.runSync([f32]);
        const ms = Date.now() - t0;
        const logits = outputs[0] as Float32Array;

        // EMA guncelle
        latencyEmaShared.value =
          latencyEmaShared.value === 0
            ? ms
            : latencyEmaShared.value * 0.7 + ms * 0.3;

        // Softmax + argmax
        let maxLogit = -Infinity;
        for (let i = 0; i < numClasses; i++) {
          const v = logits[i] / T;
          if (v > maxLogit) maxLogit = v;
        }
        let sumExp = 0;
        const expArr = new Array<number>(numClasses);
        for (let i = 0; i < numClasses; i++) {
          const e = Math.exp(logits[i] / T - maxLogit);
          expArr[i] = e;
          sumExp += e;
        }
        const invSum = 1 / sumExp;
        let topProb = 0;
        let topIdx = 0;
        for (let i = 0; i < numClasses; i++) {
          expArr[i] *= invSum;
          if (expArr[i] > topProb) {
            topProb = expArr[i];
            topIdx = i;
          }
        }

        // Worklet-side dedup: 5%'lik bucket
        let resultStatus: "confident" | "uncertain";
        let resultName = "";
        if (topProb < confidenceThreshold) {
          resultStatus = "uncertain";
        } else {
          resultStatus = "confident";
          resultName = classNames[topIdx];
        }
        const conf5 = Math.round(topProb * 20);
        const key = `${resultStatus}:${resultName}:${conf5}`;
        if (key !== lastEmittedKeyShared.value) {
          lastEmittedKeyShared.value = key;
          if (resultStatus === "confident") {
            const allProbs: Record<string, number> = {};
            for (let i = 0; i < numClasses; i++) {
              allProbs[classNames[i]] = expArr[i];
            }
            emitResult(
              {
                status: "confident",
                className: resultName,
                confidence: topProb,
                allProbs,
                leafBox: detectedLeafBox,
              },
              ms,
            );
          } else {
            emitResult({ status: "uncertain", leafBox: detectedLeafBox }, ms);
          }
        } else {
          // Ayni sonuc — sadece timer guncellemesi icin runOnJS gerekmiyor
          // commitResult zaten 2 Hz throttle yapiyor
        }

        // Basari -> hata sayacini sifirla
        errorCountShared.value = 0;
        inflightShared.value = false;
      } catch (err) {
        const e = err as { name?: string; message?: string };
        const detail = `${e?.name ?? "?"}: ${e?.message ?? String(err)}`;
        errorCountShared.value = errorCountShared.value + 1;
        onWorkletError(detail);
        inflightShared.value = false;
      }
    },
    [
      model,
      leafModel,
      resize,
      pauseRef,
      emitResult,
      processOnJS,
      onWorkletError,
      meanR,
      meanG,
      meanB,
      invStdR,
      invStdG,
      invStdB,
      T,
      confidenceThreshold,
      classNames,
      numClasses,
    ],
  );

  return {
    liveResult,
    modelLoading,
    frameProcessor: isActive ? frameProcessor : undefined,
    inferenceMs,
    currentIntervalMs,
    waitForInflightDrained,
    leafCascadeActive,
  };
}
