// Ana ekran - 3D tarla gorunumu ve sensor verileri
// Props: theme, isDark, dashboardData, isActive
import { Suspense, useRef, useEffect, useMemo, useCallback, memo } from "react";
import {
  Animated,
  View,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useThree } from "@react-three/fiber/native";
import { ColorPlane, NodeInfo } from "../../components/ColorPlane";
import { appStyles } from "../../styles";

import { Theme } from "../../utils/theme";
import { DashboardData } from "../../utils/api";
import { NodePopup } from "./NodePopup";

import { spacing } from "../../utils/responsive";
import { StatusCard } from "./StatusCard";
import { Safe3DCanvas } from "../../components/Safe3DCanvas";
import { useScreenReset } from "../../hooks/useScreenReset";
import { useState } from "react";
const THREE: any = require("three");

function SceneBackground({ color }: { color: string }) {
  const { scene } = useThree();
  useEffect(() => {
    scene.background = new THREE.Color(color);
  }, [scene, color]);
  return null;
}

// Kamera otomatik sigdirma — tarla modeli her zaman gorunur kalir
// Sahne icinden useThree ile gercek viewport ve kamera bilgisine erisir
const FIELD_EXTENT = 8; // ColorPlane TARGET_SIZE
const PADDING = 1.15; // %15 bosluk

function CameraAutoFit() {
  const { camera, viewport, invalidate } = useThree();
  const fitted = useRef(false);

  useEffect(() => {
    const cam = camera as any;
    if (!cam.isPerspectiveCamera) return;

    // Kameradan sahne merkezine mesafe
    const pos = cam.position;
    const dist = Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z);

    const halfExtent = (FIELD_EXTENT / 2) * PADDING;

    // Dikey FOV: modelin dikey olarak sigmasi icin gereken aci
    const vFovRad = 2 * Math.atan(halfExtent / dist);

    // Yatay FOV: modelin yatay olarak sigmasi icin gereken aci
    // Eger canvas dar (portrait) ise yatay sigdirma daha kritik
    const aspect = viewport.aspect || 1;
    const hFovRad = 2 * Math.atan(halfExtent / (dist * aspect));

    // Ikisinden buyugunu sec — her iki eksende de sigsin
    const requiredFov = Math.max(vFovRad, hFovRad) * (180 / Math.PI);

    // Makul sinirlar icinde tut
    const clampedFov = Math.min(40, Math.max(12, requiredFov));

    if (Math.abs(cam.fov - clampedFov) > 0.5) {
      cam.fov = clampedFov;
      cam.updateProjectionMatrix();
      invalidate();
    }
    fitted.current = true;
  }, [camera, viewport.aspect, invalidate]);

  return null;
}

interface HomeScreenProps {
  theme: Theme;
  isDark: boolean;
  dashboardData: DashboardData | null;
  isActive?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
}

export const HomeScreen = memo(({
  theme,
  isDark,
  dashboardData,
  isActive = true,
  refreshing = false,
  onRefresh,
}: HomeScreenProps) => {
  const [selectedNode, setSelectedNode] = useState<NodeInfo | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // 3D Canvas — FOV CameraAutoFit tarafindan sahne icinden ayarlanir
  const cameraConfig = useMemo(() => ({ position: [0, 16, 22.6], fov: 22 }), []);
  const canvasStyle = useMemo(() => ({ flex: 1 }), []);

  useScreenReset(isActive, {
    onDeactivate: () => setSelectedNode(null),
  });

  const fieldData = dashboardData?.field ?? {
    polygon: { exterior: [] },
    nodes: [],
  };
  const loading = !dashboardData;

  // Node sec/kaldir
  const handleNodeSelect = useCallback((node: NodeInfo | null) => {
    if (node) {
      setSelectedNode(node);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start(() => setSelectedNode(null));
    }
  }, [fadeAnim]);

  const handleClosePopup = useCallback(() => handleNodeSelect(null), [handleNodeSelect]);

  return (
    <View style={{ flex: 1, position: "relative" }}>
      <View style={{ flex: 1, marginHorizontal: spacing.sm }}>
        <ScrollView
          style={{ flexGrow: 0, flexShrink: 0 }}
          showsVerticalScrollIndicator={true}
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} colors={[theme.accent]} />
            ) : undefined
          }
        >
          <StatusCard
            theme={theme}
            dashboardData={dashboardData}
            loading={loading}
          />
        </ScrollView>

        {/* 3D Canvas */}
        <View
          style={[appStyles.canvasContainer, { position: "relative" }]}
          collapsable={false}
          removeClippedSubviews={false}
        >
          <Safe3DCanvas
            theme={theme}
            camera={cameraConfig}
            style={canvasStyle}
            fallback={
              <View
                style={{
                  flex: 1,
                  justifyContent: "center",
                  alignItems: "center",
                  backgroundColor: theme.background,
                }}
              >
                <ActivityIndicator size="large" color={theme.accent} />
              </View>
            }
          >
            <SceneBackground color={theme.background} />
            <CameraAutoFit />
            <Suspense
              fallback={
                <View
                  style={{
                    flex: 1,
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <ActivityIndicator size="large" color={theme.accent} />
                </View>
              }
            >
              <ColorPlane
                fieldData={fieldData}
                isDark={isDark}
                onNodeSelect={handleNodeSelect}
                selectedNodeId={selectedNode?.id ?? null}
                isActive={isActive}
              />
            </Suspense>
          </Safe3DCanvas>

          <NodePopup
            theme={theme}
            selectedNode={
              selectedNode
                ? {
                    id: selectedNode.id,
                    moisture: selectedNode.moisture,
                    airTemperature: selectedNode.airTemperature,
                    airHumidity: selectedNode.airHumidity,
                  }
                : null
            }
            fadeAnim={fadeAnim}
            onClose={handleClosePopup}
          />
        </View>
      </View>
    </View>
  );
});
