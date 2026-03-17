// Guvenli 3D Canvas - WebGL hatalarini yakalar ve fallback gosterir
// Props: theme, children, fallback, onCreated, camera, style
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
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

export function Safe3DCanvas({
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
      <View style={{ flex: 1 }}>
        {fallback}
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={[styles.loadingText, { color: theme.text }]}>
            {t.errors.preparing}
          </Text>
        </View>
      </View>
    );
  }

  // GL test durumu
  if (canvasState === "testing" && GLView) {
    return (
      <View style={{ flex: 1 }}>
        {fallback}
        <View style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}>
          <GLView
            ref={glTestRef}
            style={{ width: 1, height: 1 }}
            onContextCreate={handleGLContextCreate}
          />
        </View>
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={[styles.loadingText, { color: theme.text }]}>
            {t.errors.checking3DModule}
          </Text>
        </View>
      </View>
    );
  }

  // Hata durumu
  if (canvasState === "error") {
    return (
      <View style={{ flex: 1 }}>
        {fallback}
        <View
          style={[
            styles.errorOverlay,
            { backgroundColor: theme.surface, borderColor: theme.accentDim },
          ]}
        >
          <Text style={[styles.errorTitle, { color: theme.text }]}>
            {t.errors.cannotLoad3D}
          </Text>
          {errorMessage ? (
            <Text style={[styles.errorMessage, { color: theme.textSecondary }]}>
              {errorMessage}
            </Text>
          ) : null}

          <View style={styles.buttonRow}>
            <TouchableOpacity
              onPress={handleRetry}
              style={[styles.button, { backgroundColor: theme.accent }]}
            >
              <Text style={styles.buttonText}>{t.common.retry}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowDebug(!showDebug)}
              style={[styles.debugButton, { backgroundColor: "#6b7280" }]}
            >
              <Text style={styles.buttonText}>
                {showDebug ? t.errors.hideDebug : t.errors.showDebug}
              </Text>
            </TouchableOpacity>
          </View>

          {showDebug && (
            <ScrollView style={styles.debugContainer} nestedScrollEnabled>
              <Text style={styles.debugHeader}>
                Debug (Attempt {renderAttemptRef.current + 1}):
              </Text>
              <Text style={styles.debugInfo}>{__DEV__ ? "DEV" : "PROD"}</Text>
              {debugInfo.map((info, i) => (
                <View key={i} style={styles.debugEntry}>
                  <Text style={styles.debugTime}>[{info.timestamp}]</Text>
                  <Text style={styles.debugStage}>{info.stage}</Text>
                  {info.glInfo && (
                    <Text style={styles.debugGl}>{info.glInfo}</Text>
                  )}
                  {info.error && (
                    <Text style={styles.debugError}>{info.error}</Text>
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
        <View style={{ flex: 1 }}>
          <Canvas
            camera={camera}
            style={style}
            onCreated={handleCanvasCreated}
            gl={{
              powerPreference: "high-performance",
              antialias: true,
              alpha: false,
            }}
          >
            {children}
          </Canvas>
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={theme.accent} />
            <Text style={[styles.loadingText, { color: theme.text }]}>
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
      return <View style={{ flex: 1 }}>{fallback}</View>;
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
    return <View style={{ flex: 1 }}>{fallback}</View>;
  }
}

const styles = StyleSheet.create({
  errorOverlay: {
    position: "absolute",
    bottom: 16,
    left: 16,
    right: 16,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    maxHeight: "80%",
  },
  errorTitle: { fontSize: 14, fontWeight: "600", marginBottom: 8 },
  errorMessage: { fontSize: 12, marginBottom: 12 },
  buttonRow: { flexDirection: "row", gap: 8 },
  button: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 6 },
  debugButton: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 6 },
  buttonText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  debugContainer: {
    marginTop: 12,
    backgroundColor: "#1f2937",
    borderRadius: 6,
    padding: 10,
    maxHeight: 250,
  },
  debugHeader: {
    color: "#f59e0b",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 4,
  },
  debugInfo: { color: "#34d399", fontSize: 11, marginBottom: 8 },
  debugEntry: {
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#374151",
    paddingBottom: 6,
  },
  debugTime: { color: "#9ca3af", fontSize: 10, fontFamily: "monospace" },
  debugStage: { color: "#60a5fa", fontSize: 11, fontWeight: "600" },
  debugGl: { color: "#34d399", fontSize: 10, fontFamily: "monospace" },
  debugError: { color: "#f87171", fontSize: 10, fontFamily: "monospace" },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  loadingText: { marginTop: 12, fontSize: 14 },
});
