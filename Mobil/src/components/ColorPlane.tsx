// 3D tarla gorsellestirme - nem bazli renk haritalama ve sensor nodelari
// Props: fieldData, isDark, isActive, onNodeSelect, selectedNodeId, onCameraConfigChange, onPlaneReady
import {
  useRef,
  useMemo,
  useEffect,
  useLayoutEffect,
  useCallback,
  memo,
} from "react";
import { useFrame, useThree } from "@react-three/fiber/native";
import {
  FieldData,
  FieldPolygon,
  SensorNode,
  calculatePolygonCentroid,
} from "../utils/fieldPlaceholder";
import { palette } from "../styles/colors";
import type { SharedValue } from "react-native-reanimated";
const THREE: any = require("three");

const LIGHT_COLORS = [
  palette.olive[700],
  palette.olive[600],
  palette.olive[500],
  palette.olive[400],
  palette.gold[500],
  palette.gold[400],
];
const DARK_COLORS = [
  palette.olive[600],
  palette.olive[500],
  palette.olive[400],
  palette.olive[300],
  palette.gold[500],
  palette.gold[300],
];

// ─── Gorsel ayarlar — buradan kolayca duzenle ────────────────────────────────

// Sinir
const BORDER_WIDTH = 0.012;

// Nabiz
const PULSE_RADIUS = 5.5;
const PULSE_SPEED = 1.5;
const PULSE_SHARPNESS = 1.0;
const PULSE_BRIGHTNESS_EDGE = 0.05;
const PULSE_BRIGHTNESS_CENTER = 0.2;

// Pin yayilimi — zone'daki sensor sayisi >1 ise pin'ler merkez etrafinda duzgun
// cokgen (2=cizgi, 3=ucgen, 4=kare...) seklinde dizilir. Halka yaricapi pin boyuna
// orantili (sera) ya da saksi ustune oturacak sekilde (saksi). Konum saklanmadigi
// icin gercek yer degil — "bu zone'da N sensor var" gosterimi.
const PIN_RING_FACTOR = 1.3;

// ─────────────────────────────────────────────────────────────────────────────

const LUT_SIZE = 128;

// hex -> {r,g,b} donusturucu
const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
  const c = hex.replace("#", "");
  return {
    r: parseInt(c.substring(0, 2), 16),
    g: parseInt(c.substring(2, 4), 16),
    b: parseInt(c.substring(4, 6), 16),
  };
};

// rgb'yi grinin tonuna dogru harmanla (doygunlugu azalt) — t=0 ayni, t=1 tam gri
const desatRgb = (
  c: { r: number; g: number; b: number },
  t: number,
): { r: number; g: number; b: number } => {
  const gray = (c.r + c.g + c.b) / 3;
  return {
    r: c.r + (gray - c.r) * t,
    g: c.g + (gray - c.g) * t,
    b: c.b + (gray - c.b) * t,
  };
};

const INITIAL_ROTATION_Y = Math.PI / 4;
const MIN_TILT = 0;
const MAX_TILT = Math.PI / 4;
const ROTATION_SCALE = 0.005;
const ROTATION_INTERPOLATION = 0.4;
const X_VELOCITY_DAMPING = 0.85;
const Y_VELOCITY_DAMPING = 0.8;
const X_VELOCITY_MULTIPLIER = 1.2;
const Y_VELOCITY_MULTIPLIER = 1.4;

const TARGET_SIZE = 8;
const TAP_DISTANCE_THRESHOLD = 10;
const TAP_TIME_THRESHOLD = 300;
const PIN_WORLD_SIZE = 0.5;

// Nem → renk: tema-uyumlu soilMoisture paleti. Connector balonu + cizgi + plane zone'lari + pinler kullanir.
// AYDINLIK: acik→koyu. KARANLIK: koyu zeminde goz almasin diye doygun orta tonlar (kuru ucu beyaz DEGIL).
export const moistureToColor = (m: number, isDark = false): string => {
  const clamped = Math.max(0, Math.min(100, m));
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const rgbToHex = (r: number, g: number, b: number) =>
    "#" +
    [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

  // KARANLIK: tum skala MAT (dusuk doygunluk) + koyu zemine uygun. Kuru uc en mat/solgun → "ideal"den
  // ayrik (yetersiz sulama). Nem arttikca ton KOYULASIR (acik mat mavi → koyu mat mavi), hepsi az doygun.
  // AYDINLIK: orijinal acik→koyu (100→900) skala — acik zeminde dogru kontrast.
  const stops = isDark
    ? [
        desatRgb(hexToRgb(palette.soilMoisture[400]), 0.55), // 0%  — kuru: en mat/solgun, ideal'den ayrik
        desatRgb(hexToRgb(palette.soilMoisture[500]), 0.35), // 33% — mat
        desatRgb(hexToRgb(palette.soilMoisture[700]), 0.4), // 67% — mat + daha koyu
        desatRgb(hexToRgb(palette.soilMoisture[800]), 0.4), // 100% — mat + en koyu
      ]
    : [
        hexToRgb(palette.soilMoisture[100]), // 0%  — kuru, cok acik mavi
        hexToRgb(palette.soilMoisture[300]), // 33% — hafif nem, acik mavi
        hexToRgb(palette.soilMoisture[600]), // 67% — nemli, orta mavi
        hexToRgb(palette.soilMoisture[900]), // 100% — doygun, derin lacivert
      ];

  const t = clamped / 100;
  const seg = Math.min(2, Math.floor(t * 3));
  const segT = t * 3 - seg;
  const a = stops[seg];
  const b = stops[seg + 1];
  return rgbToHex(
    lerp(a.r, b.r, segT),
    lerp(a.g, b.g, segT),
    lerp(a.b, b.b, segT),
  );
};

export type NodeInfo = SensorNode;

// Field kimlik anahtari — polygon + node topolojisini ozetler.
// Snapshot staleness kontrolu icin HomeScreen ile ortak kullanilir.
export const computeFieldKey = (fieldData: FieldData): string => {
  // sensorCount key'e dahil — pin sayisi degisince snapshot/remount invalidate olsun.
  const nodeIds = fieldData.nodes
    .map((n) => `${n.id}:${n.sensorCount ?? 1}`)
    .join(",");
  const polygonHash = fieldData.polygon.exterior
    .slice(0, 3)
    .flat()
    .join(",");
  return `${polygonHash}-${nodeIds}`;
};

export interface CameraConfig {
  position: [number, number, number];
  fov: number;
}

// Kamera ayarlarini hesapla
function calculateCameraConfig(scale: number): CameraConfig {
  const baseFov = 30;
  const baseDistance = 22.6;
  const cameraY = 16;

  let fov = baseFov;
  if (scale < 0.05) {
    fov = Math.min(45, baseFov + 10);
  } else if (scale > 5) {
    fov = Math.max(20, baseFov - 5);
  }

  return { position: [0, cameraY, baseDistance], fov };
}

// Secili zone merkezinin canvas icindeki konumu — 0..1 fraction (sol-ust orijin)
export interface ZoneScreenPos {
  fx: number;
  fy: number;
  visible: boolean;
}

interface ColorPlaneProps {
  fieldData: FieldData;
  isDark?: boolean;
  isActive?: boolean;
  onNodeSelect?: (node: NodeInfo | null) => void;
  selectedNodeId?: string | null;
  onCameraConfigChange?: (config: CameraConfig) => void;
  onPlaneReady?: () => void;
  // Secili zone'un ekran fraction'i — her frame yazilir, ConnectorOverlay okur
  zonePosSV?: SharedValue<ZoneScreenPos>;
}

interface Position {
  x: number;
  y: number;
}

interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

// Polygon sinirlarini hesapla
function getPolygonBounds(exterior: [number, number][]): Bounds {
  const xs = exterior.map((p) => p[0]);
  const zs = exterior.map((p) => p[1]);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  };
}

// Three.js shape olustur
function createFieldShape(polygon: FieldPolygon): any {
  const shape = new THREE.Shape();
  const ext = polygon.exterior;
  if (ext.length < 3) return shape;

  shape.moveTo(ext[0][0], ext[0][1]);
  for (let i = 1; i < ext.length; i++) {
    shape.lineTo(ext[i][0], ext[i][1]);
  }
  shape.closePath();

  if (polygon.holes && polygon.holes.length > 0) {
    polygon.holes.forEach((hole) => {
      if (hole.length < 3) return;
      const holePath = new THREE.Path();
      holePath.moveTo(hole[0][0], hole[0][1]);
      for (let i = 1; i < hole.length; i++) {
        holePath.lineTo(hole[i][0], hole[i][1]);
      }
      holePath.closePath();
      shape.holes.push(holePath);
    });
  }

  return shape;
}

export const ColorPlane = memo(function ColorPlane({
  fieldData,
  isDark = false,
  isActive = true,
  onNodeSelect,
  selectedNodeId: externalSelectedNodeId,
  onCameraConfigChange,
  onPlaneReady,
  zonePosSV,
}: ColorPlaneProps) {
  const COLORS = isDark ? DARK_COLORS : LIGHT_COLORS;
  const nodes = fieldData.nodes;

  const fieldKey = useMemo(
    () => computeFieldKey(fieldData),
    [fieldData],
  );

  useEffect(() => {
    console.log("[3D]", fieldData.isPotField ? "POT" : "GREENHOUSE",
      "nodes:", nodes.length, "key:", fieldKey.slice(0, 24));
  }, [fieldKey]);

  const meshRef = useRef<any>(null);
  const groupRef = useRef<any>(null);
  const rotationVelocityRef = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const lastPositionRef = useRef<Position>({ x: 0, y: 0 });
  const dragStartTimeRef = useRef(0);
  const dragDistanceRef = useRef<Position>({ x: 0, y: 0 });
  const initializedRef = useRef(false);
  const targetRotationRef = useRef({ x: 0, y: INITIAL_ROTATION_Y });
  const pendingNodeRef = useRef<NodeInfo | null>(null);
  const nodePointerStartRef = useRef<{
    x: number;
    y: number;
    time: number;
  } | null>(null);

  // Secim ref bazli — setState re-render'i bypass edilir, tap spike kaldirilir
  const selectedNodeIdRef = useRef<string | null>(null);
  // applySelection fn ref — field/scale'e gore guncellenir, tap handler buradan cagirir
  const applySelectionRef = useRef<(nodeId: string | null) => void>(() => {});

  const { bounds, centeredBounds, scale, centerX, centerZ } = useMemo(() => {
    const bounds = getPolygonBounds(fieldData.polygon.exterior);
    const width = bounds.maxX - bounds.minX;
    const depth = bounds.maxZ - bounds.minZ;
    const maxDim = Math.max(width, depth);
    const rawScale = TARGET_SIZE / maxDim;
    const scale = Math.max(0.01, Math.min(10, rawScale));
    const centroid = calculatePolygonCentroid(fieldData.polygon.exterior);
    const centerX = centroid.x;
    const centerZ = centroid.z;
    const centeredBounds = {
      minX: bounds.minX - centerX,
      maxX: bounds.maxX - centerX,
      minZ: centerZ - bounds.maxZ,
      maxZ: centerZ - bounds.minZ,
    };
    return { bounds, centeredBounds, scale, centerX, centerZ };
  }, [fieldData.polygon]);

  const geometry = useMemo(() => {
    const shape = createFieldShape(fieldData.polygon);
    const extrudeSettings = { depth: 1.5 / scale, bevelEnabled: false };
    const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geo.rotateX(-Math.PI / 2);
    geo.translate(-centerX, 0, centerZ);
    return geo;
  }, [fieldData.polygon, scale, centerX, centerZ]);

  useEffect(() => {
    const config = calculateCameraConfig(scale);
    onCameraConfigChange?.(config);
  }, [fieldData, bounds, scale, centerX, centerZ, nodes, onCameraConfigChange]);

  const { invalidate, gl, camera } = useThree();

  const invalidateRef = useRef(invalidate);
  invalidateRef.current = invalidate;

  // Secili zone'u ekran fraction'ina projekte etmek icin — tekrar kullanilabilir vektor
  const projVec = useMemo<any>(() => new THREE.Vector3(), []);
  const lastZoneEmitRef = useRef({ fx: -1, fy: -1, visible: false });

  const lutDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePointerDown = useCallback((e: any) => {
    isDraggingRef.current = true;
    dragStartTimeRef.current = Date.now();
    dragDistanceRef.current = { x: 0, y: 0 };
    const x =
      e.clientX ?? e.pageX ?? e.screenX ?? e.nativeEvent?.locationX ?? 0;
    const y =
      e.clientY ?? e.pageY ?? e.screenY ?? e.nativeEvent?.locationY ?? 0;
    lastPositionRef.current = { x, y };
    invalidateRef.current();
  }, []);

  const handlePointerMove = useCallback((e: any) => {
    if (!isDraggingRef.current || !groupRef.current) return;
    const currentX =
      e.clientX ?? e.pageX ?? e.screenX ?? e.nativeEvent?.locationX ?? 0;
    const currentY =
      e.clientY ?? e.pageY ?? e.screenY ?? e.nativeEvent?.locationY ?? 0;
    const deltaX = currentX - lastPositionRef.current.x;
    const deltaY = currentY - lastPositionRef.current.y;
    const rotationY = deltaX * ROTATION_SCALE;
    const rotationX = deltaY * ROTATION_SCALE;
    targetRotationRef.current.x += rotationX;
    targetRotationRef.current.y += rotationY;
    targetRotationRef.current.x = Math.max(
      MIN_TILT,
      Math.min(MAX_TILT, targetRotationRef.current.x),
    );
    rotationVelocityRef.current.y = rotationY * Y_VELOCITY_MULTIPLIER;
    rotationVelocityRef.current.x = rotationX * X_VELOCITY_MULTIPLIER;
    dragDistanceRef.current.x += Math.abs(deltaX);
    dragDistanceRef.current.y += Math.abs(deltaY);

    if (pendingNodeRef.current && nodePointerStartRef.current) {
      const totalDist = Math.hypot(
        currentX - nodePointerStartRef.current.x,
        currentY - nodePointerStartRef.current.y,
      );
      if (totalDist > TAP_DISTANCE_THRESHOLD) {
        pendingNodeRef.current = null;
        nodePointerStartRef.current = null;
      }
    }

    lastPositionRef.current = { x: currentX, y: currentY };
    invalidateRef.current();
  }, []);

  const handlePointerUp = useCallback(
    (e: any) => {
      isDraggingRef.current = false;

      if (pendingNodeRef.current && nodePointerStartRef.current) {
        const currentX =
          e.clientX ?? e.pageX ?? e.screenX ?? e.nativeEvent?.locationX ?? 0;
        const currentY =
          e.clientY ?? e.pageY ?? e.screenY ?? e.nativeEvent?.locationY ?? 0;
        const elapsed = Date.now() - nodePointerStartRef.current.time;
        const distance = Math.hypot(
          currentX - nodePointerStartRef.current.x,
          currentY - nodePointerStartRef.current.y,
        );

        if (
          distance <= TAP_DISTANCE_THRESHOLD &&
          elapsed <= TAP_TIME_THRESHOLD
        ) {
          const node = pendingNodeRef.current;
          if (selectedNodeIdRef.current === node.id) {
            applySelectionRef.current(null);
            onNodeSelect?.(null);
          } else {
            applySelectionRef.current(node.id);
            onNodeSelect?.(node);
          }
        }
      }

      pendingNodeRef.current = null;
      nodePointerStartRef.current = null;
      invalidateRef.current();
    },
    [onNodeSelect],
  );

  const handlePointerLeave = useCallback(() => {
    isDraggingRef.current = false;
    pendingNodeRef.current = null;
    nodePointerStartRef.current = null;
  }, []);

  const attachPointerListeners = useCallback(
    (glRenderer: any) => {
      if (!glRenderer?.domElement) return;
      if (glRenderer.domElement._hasGlobalPointerListeners) return;
      const canvas = glRenderer.domElement;
      canvas.addEventListener("pointerdown", handlePointerDown);
      canvas.addEventListener("pointermove", handlePointerMove);
      canvas.addEventListener("pointerup", handlePointerUp);
      canvas.addEventListener("pointerleave", handlePointerLeave);
      glRenderer.domElement._hasGlobalPointerListeners = true;
    },
    [handlePointerDown, handlePointerMove, handlePointerUp, handlePointerLeave],
  );

  useEffect(() => {
    attachPointerListeners(gl);
  }, [gl, attachPointerListeners]);

  // Plane "hazir" sinyali — isActive regain sonrasi N useFrame ticki gectiginde
  // tek sefer onPlaneReady fire eder. HomeScreen bu sinyalle warmup fade'i baslatir.
  const readyFramesRef = useRef(0);
  const readyFiredRef = useRef(false);
  // Shader mount sonrasi bekleyen secimi uygula — auto-select race fix
  const selectionAppliedRef = useRef(false);

  useFrame((_, delta) => {
    if (!isActive) {
      isDraggingRef.current = false;
      readyFramesRef.current = 0;
      readyFiredRef.current = false;
      return;
    }
    if (!groupRef.current) return;
    initializeRotation();

    const needsUpdate = updateRotation();
    const hasMomentum = applyMomentum();

    if (shaderRef.current) {
      shaderRef.current.uniforms.uTime.value += delta;

      // Shader ilk mount olunca bekleyen secimi uygula
      if (!selectionAppliedRef.current && selectedNodeIdRef.current) {
        selectionAppliedRef.current = true;
        applySelectionRef.current(selectedNodeIdRef.current);
      }
    }

    // Secili zone merkezini ekran fraction'ina projekte et — ConnectorOverlay tail'i okur.
    // Sadece konum gercekten degisince yaz (idle frame'lerde UI thread'i bombalamamak icin).
    if (zonePosSV && groupRef.current) {
      const selId = selectedNodeIdRef.current;
      const node = selId ? nodes.find((n) => n.id === selId) : null;
      if (node) {
        // Bu frame'in rotation'i matrixWorld'e islensin (matrisler normalde render'da guncellenir)
        groupRef.current.updateWorldMatrix(true, false);
        const pos = getNodeLocalPosition(node);
        projVec.set(pos.x, pos.y, pos.z);
        groupRef.current.localToWorld(projVec); // yerel → dunya (scale + rotation)
        projVec.project(camera); // dunya → NDC [-1, 1]
        const fx = projVec.x * 0.5 + 0.5;
        const fy = -projVec.y * 0.5 + 0.5;
        const visible =
          Math.abs(projVec.x) <= 1 && Math.abs(projVec.y) <= 1 && projVec.z <= 1;
        const last = lastZoneEmitRef.current;
        if (
          visible !== last.visible ||
          Math.abs(fx - last.fx) > 0.001 ||
          Math.abs(fy - last.fy) > 0.001
        ) {
          lastZoneEmitRef.current = { fx, fy, visible };
          zonePosSV.value = { fx, fy, visible };
        }
      } else if (lastZoneEmitRef.current.visible) {
        const last = lastZoneEmitRef.current;
        lastZoneEmitRef.current = { fx: last.fx, fy: last.fy, visible: false };
        zonePosSV.value = { fx: last.fx, fy: last.fy, visible: false };
      }
    }

    if (needsUpdate || hasMomentum) {
      invalidate();
    }

    if (!readyFiredRef.current) {
      readyFramesRef.current += 1;
      if (readyFramesRef.current >= 3) {
        readyFiredRef.current = true;
        onPlaneReady?.();
      }
    }
  });

  const initializeRotation = () => {
    if (!initializedRef.current) {
      groupRef.current.rotation.x = 0;
      groupRef.current.rotation.y = INITIAL_ROTATION_Y;
      targetRotationRef.current.x = 0;
      targetRotationRef.current.y = INITIAL_ROTATION_Y;
      initializedRef.current = true;
    }
  };

  const updateRotation = (): boolean => {
    const diffX = targetRotationRef.current.x - groupRef.current.rotation.x;
    const diffY = targetRotationRef.current.y - groupRef.current.rotation.y;
    groupRef.current.rotation.x += diffX * ROTATION_INTERPOLATION;
    groupRef.current.rotation.y += diffY * ROTATION_INTERPOLATION;
    return Math.abs(diffX) > 0.0001 || Math.abs(diffY) > 0.0001;
  };

  const applyMomentum = (): boolean => {
    if (isDraggingRef.current) return false;
    targetRotationRef.current.x += rotationVelocityRef.current.x;
    targetRotationRef.current.y += rotationVelocityRef.current.y;
    rotationVelocityRef.current.x *= X_VELOCITY_DAMPING;
    rotationVelocityRef.current.y *= Y_VELOCITY_DAMPING;
    targetRotationRef.current.x = Math.max(
      MIN_TILT,
      Math.min(MAX_TILT, targetRotationRef.current.x),
    );
    return (
      Math.abs(rotationVelocityRef.current.x) > 0.0001 ||
      Math.abs(rotationVelocityRef.current.y) > 0.0001
    );
  };

  const currentColor = COLORS[0];
  const shaderRef = useRef<any>(null);

  // Hafif periyodik render — pulse animasyonunu yasatir (~15fps)
  const idleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!isActive) {
      if (idleTimerRef.current) {
        clearInterval(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      return;
    }
    idleTimerRef.current = setInterval(() => invalidateRef.current(), 67);
    return () => {
      if (idleTimerRef.current) {
        clearInterval(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    };
  }, [isActive]);

  const normalizeToUV = (x: number, z: number) => ({
    u: (x - bounds.minX) / (bounds.maxX - bounds.minX),
    v: 1 - (z - bounds.minZ) / (bounds.maxZ - bounds.minZ),
  });

  // Alan en-boy oranini hesapla (UV stretching icin)
  const fieldWidth = bounds.maxX - bounds.minX;
  const fieldDepth = bounds.maxZ - bounds.minZ;
  const aspectRatio = fieldWidth / Math.max(fieldDepth, 0.001);

  // LUT doku — IDW sonucunu pre-bake eder, shader icinde 1 texture2D sample ile okunur
  // RGB = blended renk, A = minDist (pulse icin kullanilir)
  const fieldTexture = useMemo(() => {
    const data = new Uint8Array(LUT_SIZE * LUT_SIZE * 4);
    const tex = new THREE.DataTexture(
      data,
      LUT_SIZE,
      LUT_SIZE,
      THREE.RGBAFormat,
    );
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  }, []);

  const uniforms = useMemo(
    () => ({
      uFieldTex: { value: fieldTexture },
      uTime: { value: 0.0 },
      uPulseCenter: { value: new THREE.Vector2(-1, -1) },
      uPulseStartTime: { value: 0.0 },
      uBounds: { value: new THREE.Vector4(0, 1, 0, 1) },
      uNodeUVs: {
        value: Array.from({ length: 32 }, () => new THREE.Vector2(-100, -100)),
      },
      uNodeCount: { value: 0 },
      uFieldAspect: { value: 1.0 },
    }),
    [fieldTexture],
  );

  // Tab geri geldiginde LUT'u yeniden bake et — mount remount veya GL context
  // kaybi durumunda texture/uniform'lar sifirlanmis olabilir. Sync re-bake ilk
  // frame'de siyah yerine dogru renk gorunmesini garanti eder.
  const wasActiveRef = useRef(isActive);

  // Vertex shader - pozisyon ve UV hesaplama
  const vertexShader = `
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vViewDir;
    varying vec3 vLocalNormal;
    uniform vec4 uBounds;

    void main(){
      // UV'yi world position'dan hesapla (bounds'a gore normalize et)
      // uBounds = (minX, maxX, minZ, maxZ)
      float u = (position.x - uBounds.x) / (uBounds.y - uBounds.x);
      float v = (position.z - uBounds.z) / (uBounds.w - uBounds.z);
      vUv = vec2(u, v);

      vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
      vNormal = normalize(normalMatrix * normal);
      vLocalNormal = normal; // Orijinal normal (ust yuz tespiti icin)
      vViewDir = normalize(cameraPosition - worldPos);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  // Fragment shader — Voronoi dongusu tek seferlik; sinir + zone nabzi paylasir
  const fragmentShader = `
    precision highp float;
    #define MAX_NODES 32

    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vViewDir;

    uniform sampler2D uFieldTex;
    uniform float     uTime;
    uniform vec2      uPulseCenter;
    uniform float     uPulseStartTime;
    uniform vec2      uNodeUVs[MAX_NODES];
    uniform int       uNodeCount;
    uniform float     uFieldAspect;

    void main(){
      vec3 col = texture2D(uFieldTex, vUv).rgb;

      // Paylasilan Voronoi dongusu — sinir + nabiz icin tek calisir
      float minD1 = 1e9, minD2 = 1e9, minD3 = 1e9;
      vec2 nearUV = vec2(0.0), secUV = vec2(0.0), thrUV = vec2(0.0);
      if (uNodeCount > 0) {
        for (int i = 0; i < MAX_NODES; i++) {
          float du = (vUv.x - uNodeUVs[i].x) * uFieldAspect;
          float dv = vUv.y - uNodeUVs[i].y;
          float d  = sqrt(du * du + dv * dv);
          if (d < minD1) {
            minD3 = minD2; thrUV = secUV;
            minD2 = minD1; secUV = nearUV;
            minD1 = d;     nearUV = uNodeUVs[i];
          } else if (d < minD2) {
            minD3 = minD2; thrUV = secUV;
            minD2 = d;     secUV = uNodeUVs[i];
          } else if (d < minD3) {
            minD3 = d;     thrUV = uNodeUVs[i];
          }
        }
      }

      // Zone nabzi — tiklanma aninden baslayan, zone icinde sinirli radius
      if (uPulseCenter.x >= 0.0 && uNodeCount > 0) {
        float pdu = (vUv.x - uPulseCenter.x) * uFieldAspect;
        float pdv = vUv.y - uPulseCenter.y;
        float distToPulse = sqrt(pdu * pdu + pdv * pdv);
        if (distToPulse < minD1 + 0.001 && distToPulse < ${PULSE_RADIUS}) {
          float centerGlow = smoothstep(${PULSE_RADIUS}, 0.0, distToPulse);
          float elapsed    = uTime - uPulseStartTime;
          float raw        = (1.0 - cos(elapsed * ${PULSE_SPEED})) * 0.5;
          float pulse      = pow(raw, float(${PULSE_SHARPNESS}));
          float intensity  = pulse * (${PULSE_BRIGHTNESS_EDGE} + centerGlow * ${PULSE_BRIGHTNESS_CENTER});
          // Screen blend: karanlik zone'larda orantili daha fazla, acik zone'larda daha az parlama
          col = 1.0 - (1.0 - col) * (1.0 - vec3(intensity));
        }
      }

      // Voronoi sinirlari — nabizin uzerine yazilir; sinir hatti her zaman net
      if (uNodeCount > 1) {
        const float BORDER_WIDTH = ${BORDER_WIDTH};
        float dx12 = (nearUV.x - secUV.x) * uFieldAspect;
        float dy12 = nearUV.y - secUV.y;
        float nd12 = max(sqrt(dx12*dx12 + dy12*dy12), 0.001);
        float t12  = (minD2 - minD1) * (minD1 + minD2) / (2.0 * nd12);
        float dx13 = (nearUV.x - thrUV.x) * uFieldAspect;
        float dy13 = nearUV.y - thrUV.y;
        float nd13 = max(sqrt(dx13*dx13 + dy13*dy13), 0.001);
        float t13  = (minD3 - minD1) * (minD1 + minD3) / (2.0 * nd13);
        float trueDist = min(t12, t13);
        float aa = clamp(fwidth(trueDist), 0.0005, BORDER_WIDTH * 0.2);
        float border = 1.0 - smoothstep(BORDER_WIDTH - aa, BORDER_WIDTH + aa, trueDist);
        col = mix(col, vec3(0.93, 0.91, 0.84), border);
      }

      // Hafif rim isigi
      float rim = pow(1.0 - max(0.0, dot(normalize(vNormal), normalize(vViewDir))), 2.5);
      col = col + vec3(rim) * 0.06;

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `;

  // LUT bake — CPU'da Voronoi zone rengini doldur, uniformlari guncelle.
  // Fragment shader per-pixel N-node dongusu yerine bu texture'i sample eder.
  // uniforms obj'si stable ref (useMemo deps [fieldTexture]), mesh remount'ta
  // bile degerleri korunur — Vector4/Vector2 identity'si kalici.
  const bakeLUT = () => {
    const data = fieldTexture.image.data as Uint8Array;
    const N = nodes.length;

    // Node UV + renk cache — pixel loop disinda hesaplanir
    const nodeUVs: { u: number; v: number }[] = [];
    const nodeColors: { r: number; g: number; b: number }[] = [];
    for (let i = 0; i < N; i++) {
      const n = nodes[i];
      nodeUVs.push(normalizeToUV(n.x, n.z));
      nodeColors.push(
        N === 0
          ? { r: 60, g: 110, b: 90 }
          : hexToRgb(moistureToColor(n.moisture, isDark)),
      );
    }

    // Voronoi zone rengi — her piksel icin en yakin node'un rengi
    // Sinirlar GPU'da hesaplaniyor, burada sadece renk bake edilir
    for (let y = 0; y < LUT_SIZE; y++) {
      const v = y / (LUT_SIZE - 1);
      for (let x = 0; x < LUT_SIZE; x++) {
        const u = x / (LUT_SIZE - 1);
        const uC = u * aspectRatio;
        let minDist = 1e9;
        let nearest = 0;
        for (let i = 0; i < N; i++) {
          const np = nodeUVs[i];
          const dx = uC - np.u * aspectRatio;
          const dy = v - np.v;
          const d2 = dx * dx + dy * dy;
          if (d2 < minDist) {
            minDist = d2;
            nearest = i;
          }
        }
        const idx = (y * LUT_SIZE + x) * 4;
        const c = N > 0 ? nodeColors[nearest] : { r: 60, g: 110, b: 90 };
        data[idx] = c.r | 0;
        data[idx + 1] = c.g | 0;
        data[idx + 2] = c.b | 0;
        data[idx + 3] = 0;
      }
    }

    fieldTexture.needsUpdate = true;
    // Uniform'lari direkt mutate et — useMemo stable obj, shaderRef'e gerek yok.
    // Vector4/Vector2 identity'si kalici, next render fresh degerleri okur.
    uniforms.uBounds.value.set(
      centeredBounds.minX,
      centeredBounds.maxX,
      centeredBounds.minZ,
      centeredBounds.maxZ,
    );
    const uvArr = uniforms.uNodeUVs.value;
    const count = Math.min(N, 32);
    for (let i = 0; i < 32; i++) {
      if (i < count) uvArr[i].set(nodeUVs[i].u, nodeUVs[i].v);
      else uvArr[i].set(-100.0, -100.0);
    }
    uniforms.uNodeCount.value = count;
    uniforms.uFieldAspect.value = aspectRatio;
    invalidate();
  };

  // Sync bake — mount'ta ve fieldKey degisiminde commit sonrasi, paint oncesi
  // calisir. Mesh'in ilk gorunur frame'i mutlaka dogru uniform + LUT ile cizilir.
  // prevFieldKeyRef null baslar, useEffect'teki debounce ile senkron.
  const prevFieldKeyRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    prevFieldKeyRef.current = fieldKey;
    if (lutDebounceRef.current) {
      clearTimeout(lutDebounceRef.current);
      lutDebounceRef.current = null;
    }
    bakeLUT();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldKey, isDark]); // isDark → tema degisince LUT yeniden bake (nem renkleri tema-uyumlu)

  // Debounced bake — ayni field icinde node mutasyonlari (moisture) icin
  // socket spam'ini koalese eder. fieldKey degisince sync layout effect zaten
  // bake etti, redundant debounce zararsiz.
  useEffect(() => {
    if (lutDebounceRef.current) clearTimeout(lutDebounceRef.current);
    lutDebounceRef.current = setTimeout(() => {
      lutDebounceRef.current = null;
      bakeLUT();
    }, 200);
    return () => {
      if (lutDebounceRef.current) clearTimeout(lutDebounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes]);

  // Tab geri geldiginde sync re-bake — GL context kaybi veya remount'ta
  // texture/uniform'lar sifirlanmis olabilir. Ayrica Android GLSurfaceView
  // reattach sonrasi surface warmup gecikmesini dovmek icin ~200ms boyunca
  // her RAF'ta invalidate et — ilk swap hazir olur olmaz canvas goruntuyu gosterir.
  useLayoutEffect(() => {
    const regainedFocus = isActive && !wasActiveRef.current;
    wasActiveRef.current = isActive;
    if (!regainedFocus) return;

    // Rotation reset — tab donusunde plane default poz'a animate olsun. target'i
    // sifirla, velocity'yi sifirla, groupRef.rotation.y'yi en kisa acisal yola
    // sabitle (cok tur spin yerine). updateRotation lerp'i warmup overlay altinda
    // ~130ms'de geri kalani halleder.
    if (groupRef.current) {
      const TWO_PI = Math.PI * 2;
      let y = groupRef.current.rotation.y - INITIAL_ROTATION_Y;
      y = ((y % TWO_PI) + TWO_PI) % TWO_PI;
      if (y > Math.PI) y -= TWO_PI;
      groupRef.current.rotation.y = INITIAL_ROTATION_Y + y;
      targetRotationRef.current.x = 0;
      targetRotationRef.current.y = INITIAL_ROTATION_Y;
      rotationVelocityRef.current.x = 0;
      rotationVelocityRef.current.y = 0;
    }

    bakeLUT();

    let cancelled = false;
    const start = Date.now();
    const tick = () => {
      if (cancelled || Date.now() - start > 200) return;
      invalidateRef.current();
      requestAnimationFrame(tick);
    };
    const raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  const handleNodePointerDown = (node: NodeInfo) => (e: any) => {
    pendingNodeRef.current = node;
    const x =
      e.clientX ?? e.pageX ?? e.screenX ?? e.nativeEvent?.locationX ?? 0;
    const y =
      e.clientY ?? e.pageY ?? e.screenY ?? e.nativeEvent?.locationY ?? 0;
    nodePointerStartRef.current = { x, y, time: Date.now() };
  };

  const GEOMETRY_DEPTH = 1.5;
  const POT_HEIGHT_LOCAL = 5.0; // local group units — pot height in field coordinate space
  const POT_REF_SPACING = 12; // addFieldUtils spacing between pot centers

  // Saksi olcek carpani — gercek node araligi / referans aralik (12).
  // Wizard uretimi tarlalarda 1.0, daha buyuk koordinatli tarlalarda > 1.
  const potScale = useMemo(() => {
    if (!fieldData.isPotField || nodes.length < 2) return 1;
    let minDist = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dz = nodes[i].z - nodes[j].z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d > 0.01 && d < minDist) minDist = d;
      }
    }
    return isFinite(minDist) ? minDist / POT_REF_SPACING : 1;
  }, [nodes, fieldData.isPotField]);

  const scaledPotHeight = POT_HEIGHT_LOCAL * potScale;
  // Saksi tarlada: govde ustu (h) + toprak disk yuksekligi (0.3 * potScale)
  const geometrySurfaceY = fieldData.isPotField
    ? scaledPotHeight + 0.3 * potScale
    : GEOMETRY_DEPTH / scale;
  const NODE_HEIGHT = geometrySurfaceY + 0.05;

  const getNodeLocalPosition = (node: NodeInfo) => ({
    x: node.x - centerX,
    y: NODE_HEIGHT,
    z: centerZ - node.z,
  });

  // Pin boyutu: sera tarlalarda sabit dunya boyutu, saksi tarlalarda saksi ile orantili
  // Pin basi yaricapi (pinLocalSize * 0.36) ≈ saksi yaricapinin %25'i (3.5 * potScale)
  const pinLocalSize = fieldData.isPotField
    ? 2.5 * potScale
    : PIN_WORLD_SIZE / scale;

  // Backend spreadRadius yoksa (demo/eski veri) kullanilan yayilim yaricapi
  // (grup-yerel birim). Saksi: toprak diski (≈3.0*potScale) icinde. Sera: pin boyuna orantili.
  const fallbackSpreadRadius = fieldData.isPotField
    ? 1.1 * potScale
    : pinLocalSize * PIN_RING_FACTOR;

  // Pin yerlesimleri — her zone temsilci node'u icin sensorCount kadar pin uretir.
  // 1 → merkez; N>1 → merkez etrafinda duzgun N-gen halka (ust noktadan baslar).
  // Halka yaricapi: backend node.spreadRadius (zone extent orani) varsa onu, yoksa
  // pin boyuna gore fallback. sensorCount yoksa (eski veri) 1; 0 → pin yok.
  const pinPlacements = useMemo(() => {
    const out: { node: NodeInfo; x: number; z: number }[] = [];
    for (const node of nodes) {
      const count = node.sensorCount ?? 1;
      if (count <= 0) continue;
      const baseX = node.x - centerX;
      const baseZ = centerZ - node.z;
      if (count === 1) {
        out.push({ node, x: baseX, z: baseZ });
      } else {
        const ring =
          node.spreadRadius && node.spreadRadius > 0
            ? node.spreadRadius
            : fallbackSpreadRadius;
        for (let k = 0; k < count; k++) {
          const ang = (2 * Math.PI * k) / count - Math.PI / 2;
          out.push({
            node,
            x: baseX + Math.cos(ang) * ring,
            z: baseZ + Math.sin(ang) * ring,
          });
        }
      }
    }
    return out;
  }, [nodes, centerX, centerZ, fallbackSpreadRadius]);

  // InstancedMesh refs — head/body/tip pin parcalari
  // 22+ ayri mesh yerine 3 draw call'da render edilir
  const headInstRef = useRef<any>(null);
  const bodyInstRef = useRef<any>(null);
  const tipInstRef = useRef<any>(null);
  const potBodyInstRef = useRef<any>(null);
  const potSoilInstRef = useRef<any>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tmpColor = useMemo(() => new THREE.Color(), []);

  // Pin konum/renk degisiminde matrix + instanceColor guncelle.
  // Artik node basina degil, PIN basina (pinPlacements) — cok-sensorlu zone'da
  // ayni zone icin birden cok pin matrix slot'u olur.
  useEffect(() => {
    const head = headInstRef.current;
    const body = bodyInstRef.current;
    const tip = tipInstRef.current;
    if (!head || !body || !tip || pinPlacements.length === 0) return;

    for (let i = 0; i < pinPlacements.length; i++) {
      const p = pinPlacements[i];
      const y = NODE_HEIGHT;
      tmpColor.set(moistureToColor(p.node.moisture, isDark));

      // Pin basi (sphere, rotasyon yok)
      dummy.position.set(p.x, y + pinLocalSize * 1.1, p.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      head.setMatrixAt(i, dummy.matrix);
      head.setColorAt(i, tmpColor);

      // Pin govdesi (cone, ters cevrilmis)
      dummy.position.set(p.x, y + pinLocalSize * 0.2, p.z);
      dummy.rotation.set(Math.PI, 0, 0);
      dummy.updateMatrix();
      body.setMatrixAt(i, dummy.matrix);
      body.setColorAt(i, tmpColor);

      // Pin ucu (cone, ters cevrilmis)
      dummy.position.set(p.x, y - pinLocalSize * 0.7, p.z);
      dummy.updateMatrix();
      tip.setMatrixAt(i, dummy.matrix);
      tip.setColorAt(i, tmpColor);
    }

    head.instanceMatrix.needsUpdate = true;
    body.instanceMatrix.needsUpdate = true;
    tip.instanceMatrix.needsUpdate = true;
    if (head.instanceColor) head.instanceColor.needsUpdate = true;
    if (body.instanceColor) body.instanceColor.needsUpdate = true;
    if (tip.instanceColor) tip.instanceColor.needsUpdate = true;

    invalidate();
  }, [
    pinPlacements,
    pinLocalSize,
    NODE_HEIGHT,
    dummy,
    tmpColor,
    invalidate,
    isDark,
  ]);

  // Saksi instance guncelleme — govde + toprak yuzey
  // potScale ile olceklenir: wizard tarlalarinda 1, buyuk koordinatli tarlalarda > 1
  useEffect(() => {
    if (!fieldData.isPotField) return;
    const body = potBodyInstRef.current;
    const soil = potSoilInstRef.current;
    if (!body || nodes.length === 0) return;

    const h = scaledPotHeight;

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const lx = node.x - centerX;
      const lz = centerZ - node.z;
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(potScale, potScale, potScale);

      // Saksi govdesi
      dummy.position.set(lx, h / 2, lz);
      dummy.updateMatrix();
      body.setMatrixAt(i, dummy.matrix);

      // Toprak yuzey — saksi ustunde ince disk
      // Geometri yuksekligi 0.3, merkez Y = h + 0.15*ps → alt yuz h, ust yuz h + 0.3*ps
      if (soil) {
        dummy.position.set(lx, h + 0.15 * potScale, lz);
        dummy.updateMatrix();
        soil.setMatrixAt(i, dummy.matrix);
        tmpColor.set(moistureToColor(node.moisture, isDark));
        soil.setColorAt(i, tmpColor);
      }
    }

    body.instanceMatrix.needsUpdate = true;
    if (soil) {
      soil.instanceMatrix.needsUpdate = true;
      if (soil.instanceColor) soil.instanceColor.needsUpdate = true;
    }
    invalidate();
  }, [
    nodes,
    fieldData.isPotField,
    potScale,
    scaledPotHeight,
    centerX,
    centerZ,
    dummy,
    tmpColor,
    invalidate,
    isDark,
  ]);

  // applySelectionRef guncelleme + disaridan gelen secim uygulama
  // field/scale degisince closure'i yeniler; externalSelectedNodeId degisince secimi uygular
  useEffect(() => {
    applySelectionRef.current = (nodeId: string | null) => {
      selectedNodeIdRef.current = nodeId;
      if (!shaderRef.current) return;
      if (nodeId == null) {
        shaderRef.current.uniforms.uPulseCenter.value.set(-1, -1);
        invalidateRef.current();
        return;
      }
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) {
        shaderRef.current.uniforms.uPulseCenter.value.set(-1, -1);
        invalidateRef.current();
        return;
      }
      const { u, v } = normalizeToUV(node.x, node.z);
      shaderRef.current.uniforms.uPulseCenter.value.set(u, v);
      // Nabiz fazini tiklanma anine senkronize et — hic kaymasi olmaz
      shaderRef.current.uniforms.uPulseStartTime.value =
        shaderRef.current.uniforms.uTime.value;
      invalidateRef.current();
    };

    // Disaridan secili id gelirse hemen uygula
    // Shader henuz mount olmadiysa selectionAppliedRef useFrame'de tekrar dener
    selectionAppliedRef.current = false;
    if (externalSelectedNodeId !== undefined) {
      applySelectionRef.current(externalSelectedNodeId);
      if (shaderRef.current) selectionAppliedRef.current = true;
    } else if (selectedNodeIdRef.current) {
      // Field/scale degistiyse mevcut secimi yeniden uygula
      applySelectionRef.current(selectedNodeIdRef.current);
      if (shaderRef.current) selectionAppliedRef.current = true;
    }
  }, [externalSelectedNodeId, nodes, pinLocalSize, centerX, centerZ, scale]);

  return (
    <group ref={groupRef} position={[0, 0, 0]} scale={[scale, scale, scale]}>
      {!fieldData.isPotField && <mesh
        ref={meshRef}
        position={[0, 0, 0]}
        geometry={geometry}
        onPointerUp={(e: any) => {
          e.stopPropagation();
          // Suruklemeyse zone click degil
          const totalDrag =
            dragDistanceRef.current.x + dragDistanceRef.current.y;
          if (totalDrag > TAP_DISTANCE_THRESHOLD) return;
          // Sadece ust yuz (normal y > 0.5 grup yerel uzayinda)
          if (!e.face || e.face.normal.y < 0.5) return;
          if (nodes.length === 0) return;

          // Dunya uzayindan grup yerel uzayina donusum — rotation'u geri alir
          // e.point dunya uzayinda, ama grup kullanici tarafindan dondurulebilir.
          // worldToLocal(), scale + rotation'i otomatik olarak geri alar.
          const localPoint = e.point.clone();
          groupRef.current.worldToLocal(localPoint);
          // Yerel uzayda: x = fieldX - centerX, z = centerZ - fieldZ
          const fieldX = localPoint.x + centerX;
          const fieldZ = centerZ - localPoint.z;

          const { u: uClick, v: vClick } = normalizeToUV(fieldX, fieldZ);

          // En yakin node = tiklanilan zone
          let minDist = 1e9;
          let nearestNode: NodeInfo | null = null;
          for (const node of nodes) {
            const { u, v } = normalizeToUV(node.x, node.z);
            const du = (uClick - u) * aspectRatio;
            const dv = vClick - v;
            const d2 = du * du + dv * dv;
            if (d2 < minDist) {
              minDist = d2;
              nearestNode = node;
            }
          }
          if (!nearestNode) return;

          if (selectedNodeIdRef.current === nearestNode.id) {
            applySelectionRef.current(null);
            onNodeSelect?.(null);
          } else {
            applySelectionRef.current(nearestNode.id);
            onNodeSelect?.(nearestNode);
          }
        }}
      >
        <shaderMaterial
          ref={shaderRef}
          uniforms={uniforms}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
        />
      </mesh>}

      {/* Saksi tarla: govde + toprak yuzey (nem renkli) */}
      {fieldData.isPotField && nodes.length > 0 && (
        <>
          {/* Saksi govdesi — terracotta */}
          <instancedMesh
            key={`pot-body-${nodes.length}`}
            ref={potBodyInstRef}
            args={[undefined, undefined, nodes.length]}
          >
            <cylinderGeometry args={[3.5, 2.5, POT_HEIGHT_LOCAL, 16]} />
            <meshStandardMaterial color="#C2784E" roughness={0.85} metalness={0.05} />
          </instancedMesh>

          {/* Toprak yuzey — saksi ustunde, nem renkli disk */}
          <instancedMesh
            key={`pot-soil-${nodes.length}`}
            ref={potSoilInstRef}
            args={[undefined, undefined, nodes.length]}
          >
            <cylinderGeometry args={[3.0, 3.0, 0.3, 16]} />
            <meshStandardMaterial color="#ffffff" roughness={0.9} metalness={0.0} />
          </instancedMesh>
        </>
      )}

      <ambientLight intensity={0.8} />
      <directionalLight
        position={[6 / scale, 8 / scale, 6 / scale]}
        intensity={1.4}
      />
      <pointLight
        position={[-4 / scale, 4 / scale, 4 / scale]}
        intensity={0.5}
        color={currentColor}
      />

      {pinPlacements.length > 0 && (
        <>
          {/* Pin basi - tum pinler tek draw call */}
          <instancedMesh
            key={`head-${pinPlacements.length}-${pinLocalSize}`}
            ref={headInstRef}
            args={[undefined, undefined, pinPlacements.length]}
          >
            <sphereGeometry args={[pinLocalSize * 0.36, 8, 6]} />
            <meshStandardMaterial
              color="#ffffff"
              metalness={0.4}
              roughness={0.3}
            />
          </instancedMesh>

          {/* Pin govdesi - tum pinler tek draw call */}
          <instancedMesh
            key={`body-${pinPlacements.length}-${pinLocalSize}`}
            ref={bodyInstRef}
            args={[undefined, undefined, pinPlacements.length]}
          >
            <coneGeometry args={[pinLocalSize * 0.24, pinLocalSize * 1.4, 8]} />
            <meshStandardMaterial
              color="#ffffff"
              metalness={0.3}
              roughness={0.4}
            />
          </instancedMesh>

          {/* Pin ucu - tum pinler tek draw call */}
          <instancedMesh
            key={`tip-${pinPlacements.length}-${pinLocalSize}`}
            ref={tipInstRef}
            args={[undefined, undefined, pinPlacements.length]}
          >
            <coneGeometry args={[pinLocalSize * 0.08, pinLocalSize * 0.8, 6]} />
            <meshStandardMaterial
              color="#ffffff"
              metalness={0.5}
              roughness={0.3}
            />
          </instancedMesh>
        </>
      )}

      {/* Dokunma alanlari - pin basina mesh, neredeyse gorunmez (opacity 0.001).
          Ayni zone'un her pini o zone'u secer (handleNodePointerDown(p.node)). */}
      {pinPlacements.map((p, i) => (
        <mesh
          key={`touch-${p.node.id}-${i}`}
          position={[p.x, NODE_HEIGHT + pinLocalSize * 0.4, p.z]}
          onPointerDown={handleNodePointerDown(p.node)}
        >
          <sphereGeometry args={[pinLocalSize * 1.2, 8, 6]} />
          <meshBasicMaterial transparent opacity={0.001} depthTest={false} />
        </mesh>
      ))}
    </group>
  );
});
