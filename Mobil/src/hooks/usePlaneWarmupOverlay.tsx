// 3D plane warmup overlay — hem ilk mount'ta hem tab regain'inde Canvas GL
// surface warmup suresince plane'i mask'lar. Snapshot varsa blurred image,
// yoksa tema rengi + spinner gosterir. Fade onPlaneReady sinyali ile baslar.
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { ActivityIndicator, Animated, Image } from "react-native";
import { GLView } from "expo-gl";
import { File } from "expo-file-system";
import type { Theme } from "../utils/theme";

interface Snapshot {
  localUri: string;
  fieldKey: string;
  isDark: boolean;
}

interface Args {
  theme: Theme;
  isActive: boolean;
  isDark: boolean;
  currentFieldKey: string;
}

interface Result {
  overlay: ReactElement;
  onGLContextId: (id: number) => void;
  onPlaneReady: () => void;
}

const FADE_DURATION_MS = 220;
const SAFETY_TIMEOUT_MS = 2000;
const BLUR_RADIUS = 6;

export function usePlaneWarmupOverlay({
  theme,
  isActive,
  isDark,
  currentFieldKey,
}: Args): Result {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  // state (not ref) ki ctx hazir olunca snapshot effect yeniden tetiklensin
  const [glContextId, setGlContextId] = useState<number | null>(null);
  const [isWarmingUp, setIsWarmingUp] = useState(true);

  const warmupOpacity = useRef(new Animated.Value(1)).current;
  const wasActiveRef = useRef(isActive);
  const isInitialMountRef = useRef(true);
  const fadeStartedRef = useRef(false);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapshotFileRef = useRef<string | null>(null);

  const startFade = useCallback(() => {
    if (fadeStartedRef.current) return;
    fadeStartedRef.current = true;
    if (safetyTimerRef.current) {
      clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }
    Animated.timing(warmupOpacity, {
      toValue: 0,
      duration: FADE_DURATION_MS,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setIsWarmingUp(false);
    });
  }, [warmupOpacity]);

  // Mount + tab regain: mask'i 1'de tut, onPlaneReady bekle, safety 2s
  useLayoutEffect(() => {
    const wasInitialMount = isInitialMountRef.current;
    isInitialMountRef.current = false;

    if (!isActive) {
      // Blur: flag'leri resetle; mask'i yukseltme — Home disari animate
      // edilirken mask'i kullaniciya gostermiyoruz.
      wasActiveRef.current = isActive;
      fadeStartedRef.current = false;
      if (safetyTimerRef.current) {
        clearTimeout(safetyTimerRef.current);
        safetyTimerRef.current = null;
      }
      return;
    }
    const wasBlurred = !wasActiveRef.current;
    wasActiveRef.current = isActive;
    if (!wasBlurred && !wasInitialMount) return;
    warmupOpacity.setValue(1);
    setIsWarmingUp(true);
    safetyTimerRef.current = setTimeout(() => {
      safetyTimerRef.current = null;
      startFade();
    }, SAFETY_TIMEOUT_MS);
    return () => {
      if (safetyTimerRef.current) {
        clearTimeout(safetyTimerRef.current);
        safetyTimerRef.current = null;
      }
    };
  }, [isActive, warmupOpacity, startFade]);

  // Snapshot — onPlaneReady'den await ediliyor. takeSnapshotAsync JS'den
  // cagrildiginda native taraf glReadPixels'i GL thread queue'suna kuyruga
  // atar (mEventQueue.add). Pixel okuma Runnable drain edildiginde gerceklesir
  // — call site'tan saatler sonra olabilir. Eger fade onPlaneReady'de hemen
  // baslarsa, overlay fadeout sirasinda user plane'i dragleyebilir; queue
  // drain o anda olursa snapshot rotate edilmis poz'u yakalar. Cozum: Promise
  // resolve olana kadar (= bitmap dosyaya yazilana kadar = pixel okuma bitmis)
  // fade'i geciktir. Overlay opaque kaldigi sure boyunca pointerEvents="auto"
  // user'i blokluyor, tum render'lar default poz'da.
  const tryCaptureSnapshot = useCallback((): Promise<void> => {
    if (!currentFieldKey) return Promise.resolve();
    if (
      snapshot &&
      snapshot.fieldKey === currentFieldKey &&
      snapshot.isDark === isDark
    )
      return Promise.resolve();
    if (glContextId == null) return Promise.resolve();

    const capturedFieldKey = currentFieldKey;
    const capturedIsDark = isDark;
    const ctxId = glContextId;
    return GLView.takeSnapshotAsync(ctxId, {
      format: "jpeg",
      compress: 0.6,
      flip: false,
    })
      .then(async (snap: any) => {
        try {
          await Image.prefetch(snap.localUri);
        } catch {
          // prefetch basarisizsa Image mount'ta decode edecek
        }
        const prev = snapshotFileRef.current;
        snapshotFileRef.current = snap.localUri;
        setSnapshot({
          localUri: snap.localUri,
          fieldKey: capturedFieldKey,
          isDark: capturedIsDark,
        });
        if (prev) {
          try {
            new File(prev).delete();
          } catch {
            // ignore
          }
        }
      })
      .catch(() => {
        // basarisiz — overlay tema mask'a duser
      });
  }, [currentFieldKey, isDark, glContextId, snapshot]);

  // Unmount: son snapshot dosyasini sil
  useEffect(() => {
    return () => {
      const last = snapshotFileRef.current;
      if (last) {
        try {
          new File(last).delete();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  const onGLContextId = useCallback((id: number) => setGlContextId(id), []);
  const onPlaneReady = useCallback(async () => {
    // Once snapshot Promise'ini bekle (= pixel okuma bitti), sonra fade
    // basla. Boylece fade sirasinda user etkilesim yapamadi, tum
    // render'lar default poz'da, snapshot da default poz'da. Subsequent
    // tab regain'lerde valid snapshot oldugu icin tryCaptureSnapshot
    // hemen Promise.resolve() doner — fade gecikmez.
    await tryCaptureSnapshot();
    startFade();
  }, [tryCaptureSnapshot, startFade]);

  const hasValidSnapshot =
    !!snapshot &&
    snapshot.fieldKey === currentFieldKey &&
    snapshot.isDark === isDark;

  const overlay = useMemo(
    () => (
      <Animated.View
        pointerEvents={isWarmingUp ? "auto" : "none"}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          opacity: warmupOpacity,
          // bgColor sadece snapshot yoksa — valid snapshot'ta Image tum alani
          // kaplar. bg + image birlikte fade edince additive white ghosting
          // olusuyordu (mid-fade parlaklik artmasi).
          backgroundColor: hasValidSnapshot ? "transparent" : theme.background,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {hasValidSnapshot ? (
          <Image
            source={{ uri: snapshot!.localUri }}
            resizeMode="stretch"
            blurRadius={BLUR_RADIUS}
            fadeDuration={0}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
            }}
          />
        ) : (
          <ActivityIndicator size="large" color={theme.primary} />
        )}
      </Animated.View>
    ),
    [hasValidSnapshot, isWarmingUp, snapshot, theme, warmupOpacity],
  );

  return { overlay, onGLContextId, onPlaneReady };
}
