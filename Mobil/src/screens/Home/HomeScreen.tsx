// Ana ekran - 3D tarla gorunumu ve sensor verileri
// Props: theme, isDark, dashboardData, isActive
import { Suspense, useRef, useEffect, useMemo, useCallback, memo } from "react";
import {
  View,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from "react-native";
import { useThree } from "@react-three/fiber/native";
import { ColorPlane, NodeInfo, computeFieldKey } from "../../components/ColorPlane";
import { usePlaneWarmupOverlay } from "../../hooks/usePlaneWarmupOverlay";
import { appStyles } from "../../styles";

import { Theme } from "../../utils/theme";
import { DashboardData, irrigationAPI } from "../../utils/api";
import { IrrigationSuggestion } from "./types";

import { spacing } from "../../utils/responsive";
import { WelcomeHeader } from "./WelcomeHeader";
import { FeaturedZoneCard } from "./FeaturedZoneCard";
import { IrrigationDetailScreen } from "../Irrigation/IrrigationDetailScreen";
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
  const [showDetail, setShowDetail] = useState(false);

  // Sulama verisi — secili zone icin
  const [pendingSuggestion, setPendingSuggestion] = useState<IrrigationSuggestion | null>(null);
  const [lastIrrigationTime, setLastIrrigationTime] = useState<string | null>(null);
  const [irrigationRefreshKey, setIrrigationRefreshKey] = useState(0);

  // Secili node her zaman mevcut tarlanin node'larindan biri olmali.
  // isActive degistiginde (ekrana donus) veya dashboardData (tarla degisimi)
  // degistiginde: node gecerli degilse ilk node'a sifirla.
  useEffect(() => {
    if (!isActive) return;
    const nodes = dashboardData?.field?.nodes ?? [];
    setSelectedNode((prev) => {
      if (nodes.length === 0) return null;
      const isValid = prev !== null && nodes.some((n) => n.id === prev.id);
      return isValid ? prev : nodes[0];
    });
  }, [isActive, dashboardData?.field?.nodes]);

  const currentFieldKey = useMemo(
    () => (dashboardData?.field ? computeFieldKey(dashboardData.field) : ""),
    [dashboardData?.field],
  );

  const {
    overlay: warmupOverlay,
    onGLContextId: handleGLContextId,
    onPlaneReady: handlePlaneReady,
  } = usePlaneWarmupOverlay({
    theme,
    isActive,
    isDark,
    currentFieldKey,
  });

  // 3D Canvas — FOV CameraAutoFit tarafindan sahne icinden ayarlanir
  const cameraConfig = useMemo(() => ({ position: [0, 16, 22.6], fov: 22 }), []);
  const canvasStyle = useMemo(() => ({ flex: 1 }), []);

  useScreenReset(isActive, {
    onDeactivate: () => {
      setShowDetail(false);
    },
  });

  const fieldData = dashboardData?.field ?? {
    polygon: { exterior: [] },
    nodes: [],
  };

  // Secili node'un indeksi — zone adi icin
  const nodeIndex = useMemo(() => {
    if (!selectedNode || !fieldData.nodes.length) return 0;
    const idx = fieldData.nodes.findIndex((n) => n.id === selectedNode.id);
    return idx >= 0 ? idx : 0;
  }, [selectedNode, fieldData.nodes]);

  // Secili zone degistiginde veya detay ekranindan donuste sulama verilerini cek
  useEffect(() => {
    if (!selectedNode) {
      setPendingSuggestion(null);
      setLastIrrigationTime(null);
      return;
    }

    irrigationAPI.getZoneJobs(selectedNode.zone_id ?? selectedNode.id, nodeIndex).then((res) => {
      if (!res.success || !res.data) return;

      const sorted = [...res.data].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );

      const pending = sorted.find((j) => j.status === "PENDING" && j.should_irrigate);
      setPendingSuggestion(
        pending
          ? {
              job_id: pending.job_id,
              status: pending.status,
              reasoning: pending.reasoning,
              water_amount_ml: pending.water_amount_ml,
              start_time: pending.start_time,
              urgency_level: pending.urgency_level as IrrigationSuggestion["urgency_level"],
            }
          : null,
      );

      const lastExecuted = sorted.find((j) => j.status === "EXECUTED");
      setLastIrrigationTime(
        lastExecuted?.actual_start_time ?? lastExecuted?.start_time ?? null,
      );
    });
  }, [selectedNode, nodeIndex, irrigationRefreshKey]);

  // 3D model'den node tiklamasi — secili kalir, bos tiklamada degisim yok
  const handleNodeSelect = useCallback((node: NodeInfo | null) => {
    if (node) setSelectedNode(node);
  }, []);

  // FeaturedZoneCard tiklamasi — detay ekranini ac
  const handleOpenDetail = useCallback(() => {
    if (selectedNode && dashboardData) setShowDetail(true);
  }, [selectedNode, dashboardData]);

  return (
    <View className="flex-1 relative" style={{ backgroundColor: theme.background }}>
      <View className="flex-1" style={{ marginHorizontal: spacing.sm }}>
        <ScrollView
          style={{ flexGrow: 0, flexShrink: 0 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} colors={[theme.primary]} />
            ) : undefined
          }
        >
          <WelcomeHeader theme={theme} dashboardData={dashboardData} />
          <FeaturedZoneCard
            theme={theme}
            node={selectedNode}
            nodeIndex={nodeIndex}
            nextIrrigationTime={dashboardData?.irrigation?.nextIrrigationTime ?? null}
            pendingSuggestion={pendingSuggestion}
            lastIrrigationTime={lastIrrigationTime}
            onPress={handleOpenDetail}
          />
        </ScrollView>

        {/* 3D Canvas — yatay margin'lari ekrana kadar uzat (outer wrapper'in spacing.sm'sini ters ceviriyoruz) */}
        <View
          style={[
            appStyles.canvasContainer,
            {
              position: "relative",
              flex: 1,
              marginLeft: -spacing.sm,
              marginRight: -spacing.sm,
              borderRadius: 14,
            },
          ]}
        >
        <View
          style={{ flex: 1, position: "relative" }}
          collapsable={false}
          removeClippedSubviews={false}
        >
          <Safe3DCanvas
            theme={theme}
            camera={cameraConfig}
            style={canvasStyle}
            onGLContextId={handleGLContextId}
            fallback={
              <View
                className="flex-1 justify-center items-center"
                style={{ backgroundColor: theme.background }}
              >
                <ActivityIndicator size="large" color={theme.primary} />
              </View>
            }
          >
            <SceneBackground color={theme.background} />
            <CameraAutoFit />
            <Suspense
              fallback={
                <View className="flex-1 justify-center items-center">
                  <ActivityIndicator size="large" color={theme.primary} />
                </View>
              }
            >
              <ColorPlane
                fieldData={fieldData}
                isDark={isDark}
                onNodeSelect={handleNodeSelect}
                selectedNodeId={selectedNode?.id ?? null}
                isActive={isActive}
                onPlaneReady={handlePlaneReady}
              />
            </Suspense>
          </Safe3DCanvas>

          {warmupOverlay}
        </View>
        </View>
      </View>

      {/* Sulama detay overlay */}
      {showDetail && selectedNode && dashboardData && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.background, zIndex: 200 }]}>
          <IrrigationDetailScreen
            node={selectedNode}
            nodeIndex={nodeIndex}
            dashboardData={dashboardData}
            theme={theme}
            onBack={() => {
              setShowDetail(false);
              setIrrigationRefreshKey((k) => k + 1);
            }}
          />
        </View>
      )}
    </View>
  );
});
