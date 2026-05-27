// Ana ekran - 3D tarla gorunumu ve sensor verileri
// Props: theme, isDark, dashboardData, isActive
import { Suspense, useRef, useEffect, useMemo, useCallback, memo } from "react";
import {
  View,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useThree } from "@react-three/fiber/native";
import { useSharedValue } from "react-native-reanimated";
import { ColorPlane, NodeInfo, computeFieldKey, ZoneScreenPos, moistureToColor } from "../../components/ColorPlane";
import { ConnectorOverlay, Rect } from "../../components/ConnectorOverlay";
import { usePlaneWarmupOverlay } from "../../hooks/usePlaneWarmupOverlay";
import { appStyles } from "../../styles";

import { Theme } from "../../utils/theme";
import { DashboardData, irrigationAPI, IrrigationJob } from "../../utils/api";
import { IrrigationSuggestion } from "./types";
import { useSectionFocusFor } from "../../context/SectionFocusContext";

import { s, spacing } from "../../utils/responsive";
import { FeaturedZoneCard } from "./FeaturedZoneCard";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
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

// Bir zone'un sulama ozeti — tum zone'lar icin basta hesaplanip haritada tutulur
interface ZoneIrrigation {
  pendingSuggestion: IrrigationSuggestion | null;
  noActionEvaluation: { reasoning: string | null; created_at: string } | null;
  lastIrrigationTime: string | null;
}

// Ham sulama islerini kart ozetine cevir (en yeni PENDING / NO_ACTION / EXECUTED)
function deriveZoneIrrigation(jobs: IrrigationJob[]): ZoneIrrigation {
  const sorted = [...jobs].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  const pending = sorted.find((j) => j.status === "PENDING" && j.should_irrigate);
  const noAction = pending ? null : sorted.find((j) => j.status === "NO_ACTION");
  const lastExecuted = sorted.find((j) => j.status === "EXECUTED");
  return {
    pendingSuggestion: pending
      ? {
          job_id: pending.job_id,
          status: pending.status,
          reasoning: pending.reasoning,
          water_amount_ml: pending.water_amount_ml,
          start_time: pending.start_time,
          urgency_level: pending.urgency_level as IrrigationSuggestion["urgency_level"],
        }
      : null,
    noActionEvaluation: noAction
      ? { reasoning: noAction.reasoning, created_at: noAction.created_at }
      : null,
    lastIrrigationTime: lastExecuted?.actual_start_time ?? lastExecuted?.start_time ?? null,
  };
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

  // Sulama verisi — TUM zone'lar icin BASTA bir kez cekilir (zone tiklamasinda yeni sorgu YOK).
  // Harita: zoneKey → ozet. Secili zone bu haritadan okunur.
  const [zoneIrrigation, setZoneIrrigation] = useState<Record<string, ZoneIrrigation>>({});
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);
  const [irrigationRefreshKey, setIrrigationRefreshKey] = useState(0);

  // ─── Zone → kart baglanti cizgisi (ConnectorOverlay) ───
  // Secili zone'un canvas icindeki konumu (0..1) — ColorPlane her frame yazar, overlay okur
  const zonePosSV = useSharedValue<ZoneScreenPos>({ fx: 0.5, fy: 0.5, visible: false });
  const [cardRect, setCardRect] = useState<Rect | null>(null);
  const [canvasRect, setCanvasRect] = useState<Rect | null>(null);
  const [planeReady, setPlaneReady] = useState(false);
  const rootRef = useRef<View>(null);
  const cardWrapRef = useRef<View>(null);
  const canvasWrapRef = useRef<View>(null);
  const pendingZoneIdRef = useRef<string | null>(null);
  const lastHandledFocusNonceRef = useRef(-1);
  const homeFocus = useSectionFocusFor("home");

  // Kart + canvas dikdortgenlerini olc, overlay-yerel koordinata cevir (root orijinini cikar)
  const measureConnector = useCallback(() => {
    const root = rootRef.current;
    const card = cardWrapRef.current;
    const canvas = canvasWrapRef.current;
    if (!root || !card || !canvas) return;
    root.measureInWindow((rx, ry) => {
      card.measureInWindow((cx, cy, cw, ch) => {
        setCardRect({ x: cx - rx, y: cy - ry, w: cw, h: ch });
      });
      canvas.measureInWindow((vx, vy, vw, vh) => {
        setCanvasRect({ x: vx - rx, y: vy - ry, w: vw, h: vh });
      });
    });
  }, []);

  // Secili node her zaman mevcut tarlanin node'larindan biri olmali.
  // isActive degistiginde (ekrana donus) veya dashboardData (tarla degisimi)
  // degistiginde: node gecerli degilse ilk node'a sifirla.
  useEffect(() => {
    if (!isActive) return;
    const nodes = dashboardData?.field?.nodes ?? [];
    setSelectedNode((prev) => {
      if (nodes.length === 0) return null;
      const isValid = prev !== null && nodes.some((n) => n.id === prev.id);
      if (isValid) return prev;
      // Boot/tarla degisimi: en yuksek oncelikli = en kuru zone (en dusuk nem).
      // ?? Infinity — eksik nem degeri olan node "en kuru" yarisini kazanmasin.
      return nodes.reduce(
        (driest, n) =>
          (n.moisture ?? Infinity) < (driest.moisture ?? Infinity) ? n : driest,
        nodes[0],
      );
    });
  }, [isActive, dashboardData?.field?.nodes]);

  const currentFieldKey = useMemo(
    () => (dashboardData?.field ? computeFieldKey(dashboardData.field) : ""),
    [dashboardData?.field],
  );

  // Tarla degisince eski projeksiyon konumunu gizle — bir frame'lik bayat tail cizilmesin
  useEffect(() => {
    zonePosSV.value = { ...zonePosSV.value, visible: false };
  }, [currentFieldKey, zonePosSV]);

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

  // Connector cizgisi plane hazir olana kadar gosterilmez (warmup fade biter bitmez gosterilir)
  const handlePlaneReadyAll = useCallback(() => {
    handlePlaneReady();
    setPlaneReady(true);
  }, [handlePlaneReady]);

  // Tab'dan cikinca yeniden silah — donuste ColorPlane onPlaneReady'yi tekrar fire eder
  useEffect(() => {
    if (!isActive) setPlaneReady(false);
  }, [isActive]);

  // 3D Canvas — FOV CameraAutoFit tarafindan sahne icinden ayarlanir
  const cameraConfig = useMemo(() => ({ position: [0, 16, 22.6], fov: 22 }), []);
  const canvasStyle = useMemo(() => ({ flex: 1 }), []);

  useScreenReset(isActive, {
    onDeactivate: () => {},
  });

  // Real field data only — placeholder yok. ColorPlane sadece valid polygon ile
  // mount edilir ki snapshot bos/transient state'i yakalamasin (logged-in user
  // briefly demo data goruyordu, snapshot demo polygonu yakaliyor ve sonsuza
  // kadar yanlis poz kaliyordu).
  const fieldData = dashboardData?.field;

  // Secili node'un indeksi — zone adi icin
  const nodeIndex = useMemo(() => {
    if (!selectedNode || !fieldData?.nodes?.length) return 0;
    const idx = fieldData.nodes.findIndex((n) => n.id === selectedNode.id);
    return idx >= 0 ? idx : 0;
  }, [selectedNode, fieldData?.nodes]);

  // Connector balonu rengi — secili zone'un nem renginden turetilir (overlay'de pastel + saydam)
  const zoneColor = useMemo(
    () => (selectedNode ? moistureToColor(selectedNode.moisture, isDark) : theme.primary),
    [selectedNode, theme.primary, isDark],
  );

  // Kartta gosterilecek sensor ortalamasi — zone secili ise O ZONE'un node'lari (zone_id ile
  // gruplanir), secili degilse tum tarla. "zone'un sensor node ortalamasi" = bu.
  const displaySensor = useMemo(() => {
    const all = fieldData?.nodes ?? [];
    if (all.length === 0) return null;
    const src = selectedNode
      ? all.filter((n) =>
          selectedNode.zone_id ? n.zone_id === selectedNode.zone_id : n.id === selectedNode.id,
        )
      : all;
    const ns = src.length > 0 ? src : all;
    const avg = (sel: (n: NodeInfo) => number) =>
      ns.reduce((sum, n) => sum + sel(n), 0) / ns.length;
    return {
      moisture: avg((n) => n.moisture),
      airTemp: avg((n) => n.airTemperature),
      airHumidity: avg((n) => n.airHumidity),
      count: ns.length,
    };
  }, [fieldData?.nodes, selectedNode]);

  // TUM zone'larin sulama verisini tek seferde cek — basta, tarla degisince, manuel yenilemede
  // ve detay ekranindan donuste (irrigationRefreshKey). Zone TIKLAMASINDA sorgu YOK.
  useEffect(() => {
    const nodes = dashboardData?.field?.nodes ?? [];
    if (nodes.length === 0) {
      setZoneIrrigation({});
      return;
    }
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        nodes.map(async (n, idx) => {
          const zid = n.zone_id ?? n.id;
          const res = await irrigationAPI.getZoneJobs(zid, idx);
          return [zid, deriveZoneIrrigation(res.success && res.data ? res.data : [])] as const;
        }),
      );
      if (cancelled) return;
      setZoneIrrigation(Object.fromEntries(entries));
      setLastFetchedAt(new Date());
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFieldKey, irrigationRefreshKey]);

  // Secili zone'un sulama ozeti — haritadan okunur (sorgu yok)
  const currentIrrigation = selectedNode
    ? zoneIrrigation[selectedNode.zone_id ?? selectedNode.id] ?? null
    : null;

  // Manuel yenileme — sensor (onRefresh) + tum zone sulama (irrigationRefreshKey++) + zaman damgasi
  const handleDataRefresh = useCallback(() => {
    setIrrigationRefreshKey((k) => k + 1);
    onRefresh?.();
  }, [onRefresh]);

  // 3D model'den node secimi — null gelirse (secili zone'a tekrar dokunma) secimi temizle:
  // connector + 3D pulse kapanir, kart FIELD MODE'a (tarla geneli) duser
  const handleNodeSelect = useCallback((node: NodeInfo | null) => {
    setSelectedNode(node);
  }, []);

  // LLM highlight_zone — home.fieldVisualization focus + zoneId gelirse o zone'u sec.
  // Node'lar henuz yoksa pendingZoneIdRef'te beklet, geldiklerinde uygula (cold-launch yarisI).
  useEffect(() => {
    // Sadece YENI focus istegini (nonce) stash et — eski direktif tarla degisiminde
    // manuel secimi ezmesin
    if (
      homeFocus?.section === "fieldVisualization" &&
      homeFocus.zoneId &&
      homeFocus.nonce !== lastHandledFocusNonceRef.current
    ) {
      pendingZoneIdRef.current = homeFocus.zoneId;
      lastHandledFocusNonceRef.current = homeFocus.nonce;
    }
    const zid = pendingZoneIdRef.current;
    if (!zid) return;
    const nodes = fieldData?.nodes ?? [];
    const node = nodes.find((n) => (n.zone_id ?? n.id) === zid || n.id === zid);
    if (node) {
      pendingZoneIdRef.current = null;
      setSelectedNode(node);
    }
  }, [homeFocus, fieldData?.nodes]);

  // FeaturedZoneCard tiklamasi — IrrigationDetail stack screen'ine git
  const navigation = useNavigation<any>();
  const handleOpenDetail = useCallback(() => {
    if (selectedNode && dashboardData) {
      navigation.navigate("IrrigationDetail", { node: selectedNode, nodeIndex });
    }
  }, [selectedNode, dashboardData, nodeIndex, navigation]);

  // IrrigationDetail'den donunce sulama verilerini yenile
  useFocusEffect(
    useCallback(() => {
      setIrrigationRefreshKey((k) => k + 1);
    }, []),
  );

  return (
    <View ref={rootRef} className="flex-1 relative" style={{ backgroundColor: theme.background }}>
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
          {/* Kart sarici — connector cizgisi icin olculur (collapsable=false Android'de gerekli).
              Margin'ler kartin kendisinde DEGIL burada → cardRect = kartin gorunur siniri,
              cizgi karta bosluksuz degsin. */}
          <View
            ref={cardWrapRef}
            collapsable={false}
            onLayout={measureConnector}
            style={{ marginHorizontal: s(2), marginBottom: spacing.sm }}
          >
            <FeaturedZoneCard
              theme={theme}
              node={selectedNode}
              nodeIndex={nodeIndex}
              sensor={displaySensor}
              pendingSuggestion={currentIrrigation?.pendingSuggestion ?? null}
              noActionEvaluation={currentIrrigation?.noActionEvaluation ?? null}
              lastIrrigationTime={currentIrrigation?.lastIrrigationTime ?? null}
              highlightColor={selectedNode ? zoneColor : null}
              fetchedAt={lastFetchedAt}
              onRefreshData={handleDataRefresh}
              onPress={handleOpenDetail}
            />
          </View>
        </ScrollView>

        {/* 3D Canvas — yatay margin'lari ekrana kadar uzat (outer wrapper'in spacing.sm'sini ters ceviriyoruz) */}
        <View
          ref={canvasWrapRef}
          collapsable={false}
          onLayout={measureConnector}
          style={[
            appStyles.canvasContainer,
            {
              position: "relative",
              flex: 1,
              marginLeft: -spacing.sm,
              marginRight: -spacing.sm,
              borderRadius: 10,
            },
          ]}
        >
        <View
          style={{ flex: 1, position: "relative" }}
          collapsable={false}
          removeClippedSubviews={false}
        >
          {fieldData && fieldData.polygon.exterior.length >= 3 ? (
            <>
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
                    onPlaneReady={handlePlaneReadyAll}
                    zonePosSV={zonePosSV}
                  />
                </Suspense>
              </Safe3DCanvas>
              {warmupOverlay}
            </>
          ) : (
            <View
              className="flex-1 justify-center items-center"
              style={{ backgroundColor: theme.background }}
            >
              <ActivityIndicator size="large" color={theme.primary} />
            </View>
          )}
        </View>
        </View>
      </View>

      {/* Secili zone'u kart ile baglayan kesintisiz cizgi — canvas + kart uzerinde, dokunmaz */}
      {fieldData && (
        <ConnectorOverlay
          zonePosSV={zonePosSV}
          cardRect={cardRect}
          canvasRect={canvasRect}
          active={isActive && planeReady && selectedNode !== null}
          zoneColor={zoneColor}
        />
      )}
    </View>
  );
});
