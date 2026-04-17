// Guvenli 3D Canvas - WebGL hatalarini yakalar ve fallback gosterir
// Props: theme, children, fallback, onCreated, camera, style
import React, { useState, useEffect, useRef, memo } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
  Platform,
  InteractionManager,
} from "react-native";
import { Theme } from "../utils/theme";
import { useLanguage } from "../context/LanguageContext";

let Canvas: any = null;
let canvasLoadError: Error | null = null;
let GLView: any = null;

try {
  Canvas = require("@react-three/fiber/native").Canvas;
  GLView = require("expo-gl").GLView;
} catch (e: any) {
  canvasLoadError = e;
  console.log("[3D] module load err:", e.message);
}

// expo-gl getActiveUniform() bazen null donuyor, Three.js WebGLUniforms crash.
// Bu hatayi yakalayip sessizce atla — 3D sahne calismaya devam eder.
const ErrorUtils = (global as any).ErrorUtils;
if (ErrorUtils && !ErrorUtils.__gl_patched) {
  const origHandler = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error: any, isFatal: boolean) => {
    if (
      error?.message?.includes("Cannot read property") &&
      error?.stack?.includes("WebGLUniforms")
    ) {
      return; // expo-gl uyumsuzlugu, guvensiz degil
    }
    origHandler(error, isFatal);
  });
  ErrorUtils.__gl_patched = true;
}

interface Safe3DCanvasProps {
  theme: Theme;
  children: React.ReactNode;
  fallback: React.ReactNode;
  onCreated?: (state: any) => void;
  camera?: any;
  style?: any;
}

interface DebugInfo {
  timestamp: string;
  platform: string;
  stage: string;
  error?: string;
  stack?: string;
  glInfo?: string;
}

export const Safe3DCanvas = memo(function Safe3DCanvas({
  theme,
  children,
  fallback,
  onCreated,
  camera,
  style,
}: Safe3DCanvasProps) {
  const { t } = useLanguage();
  const [canvasState, setCanvasState] = useState<
    "waiting" | "testing" | "loading" | "ready" | "error"
  >("waiting");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [debugInfo, setDebugInfo] = useState<DebugInfo[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const initTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);
  const renderAttemptRef = useRef(0);
  const glTestRef = useRef<any>(null);

  const addDebugInfo = (info: Partial<DebugInfo>) => {
    const newInfo: DebugInfo = {
      timestamp: new Date().toISOString().split("T")[1].split(".")[0],
      platform: Platform.OS,
      stage: "unknown",
      ...info,
    };
    if (__DEV__ && newInfo.error) {
      console.log(
        `[3D] ${newInfo.stage}: ${newInfo.error}`,
      );
    }
    setDebugInfo((prev) => [...prev, newInfo]);
  };

  useEffect(() => {
    mountedRef.current = true;

    if (canvasLoadError) {
      addDebugInfo({ stage: "module-err", error: canvasLoadError.message });
      setErrorMessage(`Failed to load 3D module: ${canvasLoadError.message}`);
      setCanvasState("error");
      return;
    }

    if (!Canvas) {
      addDebugInfo({ stage: "no-canvas", error: "Canvas component is null" });
      setErrorMessage("3D Canvas module not available");
      setCanvasState("error");
      return;
    }

    addDebugInfo({
      stage: "init",
      glInfo: `${Platform.OS} ${Platform.Version}`,
    });

    const interactionHandle = InteractionManager.runAfterInteractions(() => {
      if (mountedRef.current) {
        if (GLView) {
          addDebugInfo({ stage: "testing-gl" });
          setCanvasState("testing");
        } else {
          addDebugInfo({ stage: "skip-gl-test" });
          setCanvasState("loading");
        }
      }
    });

    return () => {
      mountedRef.current = false;
      interactionHandle.cancel();
      if (initTimeoutRef.current) clearTimeout(initTimeoutRef.current);
    };
  }, []);

  // GL context test sonucu
  const handleGLContextCreate = (gl: any) => {
    if (!mountedRef.current) return;

    try {
      addDebugInfo({
        stage: "gl-ok",
        glInfo: `buffer: ${gl.drawingBufferWidth}`,
      });
      if (glTestRef.current) glTestRef.current = null;
      setCanvasState("loading");
    } catch (error: any) {
      addDebugInfo({ stage: "gl-err", error: error?.message || String(error) });
      setCanvasState("error");
      setErrorMessage(`GL test failed: ${error?.message || "Unknown error"}`);
    }
  };

  // Timeout ayarla
  useEffect(() => {
    if (canvasState === "loading" || canvasState === "testing") {
      initTimeoutRef.current = setTimeout(() => {
        if (
          mountedRef.current &&
          (canvasState === "loading" || canvasState === "testing")
        ) {
          addDebugInfo({
            stage: "timeout",
            error: `15s timeout (attempt ${renderAttemptRef.current + 1})`,
          });
          setCanvasState("error");
          setErrorMessage("3D rendering initialization timed out");
        }
      }, 15000);

      return () => {
        if (initTimeoutRef.current) clearTimeout(initTimeoutRef.current);
      };
    }
  }, [canvasState]);

  const handleCanvasCreated = (state: any) => {
    if (!mountedRef.current) return;

    try {
      if (initTimeoutRef.current) clearTimeout(initTimeoutRef.current);

      let glInfo = "GL context created";
      try {
        const gl = state.gl;
        if (gl) {
          const debugInfoExt = gl.getExtension?.("WEBGL_debug_renderer_info");
          if (debugInfoExt) {
            const renderer =
              gl.getParameter?.(debugInfoExt.UNMASKED_RENDERER_WEBGL) ||
              "Unknown";
            glInfo = `Renderer: ${renderer}`;
          }
        }
      } catch {
        glInfo = "GL info unavailable";
      }

      addDebugInfo({ stage: "ready", glInfo });
      setCanvasState("ready");
      onCreated?.(state);
    } catch (error: any) {
      addDebugInfo({
        stage: "create-err",
        error: error?.message || String(error),
      });
      setCanvasState("error");
      setErrorMessage(
        `Failed to initialize: ${error?.message || "Unknown error"}`,
      );
    }
  };

  const handleRetry = () => {
    renderAttemptRef.current += 1;
    addDebugInfo({ stage: `retry-${renderAttemptRef.current}` });
    setCanvasState("waiting");
    setErrorMessage("");

    InteractionManager.runAfterInteractions(() => {
      if (mountedRef.current) {
        setCanvasState(GLView ? "testing" : "loading");
      }
    });
  };

  // Bekleme durumu
  if (canvasState === "waiting") {
    return (
      <View className="flex-1">
        {fallback}
        <View className="overlay-fill" style={{ backgroundColor: "rgba(0,0,0,0.3)" }}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text className="mt-3 text-sm" style={{ color: theme.textMain }}>
            {t.errors.preparing}
          </Text>
        </View>
      </View>
    );
  }

  // GL test durumu
  if (canvasState === "testing" && GLView) {
    return (
      <View className="flex-1">
        {fallback}
        <View style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}>
          <GLView
            ref={glTestRef}
            style={{ width: 1, height: 1 }}
            onContextCreate={handleGLContextCreate}
          />
        </View>
        <View className="overlay-fill" style={{ backgroundColor: "rgba(0,0,0,0.3)" }}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text className="mt-3 text-sm" style={{ color: theme.textMain }}>
            {t.errors.checking3DModule}
          </Text>
        </View>
      </View>
    );
  }

  // Hata durumu
  if (canvasState === "error") {
    return (
      <View className="flex-1">
        {fallback}
        <View
          className="absolute bottom-4 left-4 right-4 rounded-lg p-3 border"
          style={{ backgroundColor: theme.surface, borderColor: theme.border, maxHeight: "80%" }}
        >
          <Text className="text-sm font-semibold mb-2" style={{ color: theme.textMain }}>
            {t.errors.cannotLoad3D}
          </Text>
          {errorMessage ? (
            <Text className="text-xs mb-3" style={{ color: theme.textSecondary }}>
              {errorMessage}
            </Text>
          ) : null}

          <View className="flex-row gap-2">
            <TouchableOpacity
              onPress={handleRetry}
              className="py-2 px-4 rounded-md"
              style={{ backgroundColor: theme.primary }}
            >
              <Text className="text-white text-xs font-semibold">{t.common.retry}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowDebug(!showDebug)}
              className="bg-gray-500 py-2 px-4 rounded-md"
            >
              <Text className="text-white text-xs font-semibold">
                {showDebug ? t.errors.hideDebug : t.errors.showDebug}
              </Text>
            </TouchableOpacity>
          </View>

          {showDebug && (
            <ScrollView
              className="mt-3 bg-gray-800 rounded-md p-2.5"
              style={{ maxHeight: 250 }}
              nestedScrollEnabled
            >
              <Text className="text-xs font-semibold text-amber-500 mb-1">
                Debug (Attempt {renderAttemptRef.current + 1}):
              </Text>
              <Text className="text-[11px] text-emerald-400 mb-2">
                {__DEV__ ? "DEV" : "PROD"}
              </Text>
              {debugInfo.map((info, i) => (
                <View key={i} className="mb-2 border-b border-gray-700 pb-1.5">
                  <Text className="text-[10px] text-gray-400 font-mono">
                    [{info.timestamp}]
                  </Text>
                  <Text className="text-[11px] text-blue-400 font-semibold">
                    {info.stage}
                  </Text>
                  {info.glInfo && (
                    <Text className="text-[10px] text-emerald-400 font-mono">
                      {info.glInfo}
                    </Text>
                  )}
                  {info.error && (
                    <Text className="text-[10px] text-red-400 font-mono">
                      {info.error}
                    </Text>
                  )}
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    );
  }

  // Yukleme durumu
  if (canvasState === "loading") {
    try {
      return (
        <View className="flex-1">
          <Canvas
            frameloop="demand"
            camera={camera}
            style={style}
            onCreated={handleCanvasCreated}
            gl={{
              powerPreference: "low-power",
              antialias: true,
              alpha: false,
            }}
          >
            {children}
          </Canvas>
          <View className="overlay-fill" style={{ backgroundColor: "rgba(0,0,0,0.3)" }}>
            <ActivityIndicator size="large" color={theme.primary} />
            <Text className="mt-3 text-sm" style={{ color: theme.textMain }}>
              {t.errors.loading3D}
            </Text>
          </View>
        </View>
      );
    } catch (renderError: any) {
      setTimeout(() => {
        if (mountedRef.current) {
          addDebugInfo({
            stage: "render-err",
            error: renderError?.message || String(renderError),
          });
          setCanvasState("error");
          setErrorMessage(
            `Canvas render failed: ${renderError?.message || "Unknown"}`,
          );
        }
      }, 0);
      return <View className="flex-1">{fallback}</View>;
    }
  }

  // Hazir durumu
  try {
    return (
      <Canvas
        camera={camera}
        style={style}
        gl={{
          powerPreference: "high-performance",
          antialias: true,
          alpha: false,
        }}
      >
        {children}
      </Canvas>
    );
  } catch (renderError: any) {
    console.log("[3D] render err:", renderError);
    return <View className="flex-1">{fallback}</View>;
  }
});

