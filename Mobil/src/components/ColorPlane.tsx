// 3D tarla gorsellestirme - nem bazli renk haritalama ve sensor nodelari
// Props: fieldData, isDark, isActive, onNodeSelect, selectedNodeId, onCameraConfigChange
import { useRef, useMemo, useEffect, useCallback, memo } from "react";
import { useFrame, useThree } from "@react-three/fiber/native";
import {
  FieldData,
  FieldPolygon,
  SensorNode,
  calculatePolygonCentroid,
} from "../utils/fieldPlaceholder";
import { palette } from "../styles/colors";
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

// Nem → renk: kuru toprak (altin/kum) → yasil zeytinlik (olive)
const moistureToColor = (m: number): string => {
  const clamped = Math.max(0, Math.min(100, m));
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const rgbToHex = (r: number, g: number, b: number) =>
    "#" +
    [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

  // Kuru: gold[300] → Hafif: olive[400] → Optimal: olive[700] → Doygun: olive[900]
  const stops = [
    hexToRgb(palette.gold[300]), // 0%  — kuru, kum renkli
    hexToRgb(palette.olive[400]), // 33% — hafif nem, acik yesil
    hexToRgb(palette.olive[700]), // 67% — optimal nem, koyu zeytin
    hexToRgb(palette.olive[900]), // 100% — doygun, derin zeytin
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

interface ColorPlaneProps {
  fieldData: FieldData;
  isDark?: boolean;
  isActive?: boolean;
  onNodeSelect?: (node: NodeInfo | null) => void;
  selectedNodeId?: string | null;
  onCameraConfigChange?: (config: CameraConfig) => void;
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
}: ColorPlaneProps) {
  const COLORS = isDark ? DARK_COLORS : LIGHT_COLORS;
  const nodes = fieldData.nodes;

  const fieldKey = useMemo(() => {
    const nodeIds = nodes.map((n) => n.id).join(",");
    const polygonHash = fieldData.polygon.exterior.slice(0, 3).flat().join(",");
    return `${polygonHash}-${nodeIds}`;
  }, [fieldData.polygon.exterior, nodes]);

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

  const { invalidate, gl } = useThree();

  const invalidateRef = useRef(invalidate);
  invalidateRef.current = invalidate;

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

  useFrame((_, delta) => {
    if (!isActive) {
      isDraggingRef.current = false;
      return;
    }
    if (!groupRef.current) return;
    initializeRotation();

    const needsUpdate = updateRotation();
    const hasMomentum = applyMomentum();

    if (shaderRef.current) {
      shaderRef.current.uniforms.uTime.value += delta;
    }

    if (needsUpdate || hasMomentum) {
      invalidate();
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

  // LUT bake — nodes degistiginde 64x64 texture'i CPU'da doldur
  // Fragment shader eski per-pixel N-node dongusu yerine bu texture'i sample eder
  // Debounce: cok sık tetiklenmeyi onler (ornegin field secimi sirasinda)
  useEffect(() => {
    if (lutDebounceRef.current) clearTimeout(lutDebounceRef.current);

    lutDebounceRef.current = setTimeout(() => {
      lutDebounceRef.current = null;

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
            : hexToRgb(moistureToColor(n.moisture)),
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
      if (shaderRef.current) {
        shaderRef.current.uniforms.uBounds.value.set(
          centeredBounds.minX,
          centeredBounds.maxX,
          centeredBounds.minZ,
          centeredBounds.maxZ,
        );
        // Node UV'lerini shader'a aktar — GPU sinir hesabi icin
        // Kullanilmayan slot'lar (-100,-100): loop her zaman MAX_NODES iter,
        // uzak degerler hicbir zaman kazanamaz (GLSL ES break sorunundan kacinis)
        const uvArr = shaderRef.current.uniforms.uNodeUVs.value;
        const count = Math.min(N, 32);
        for (let i = 0; i < 32; i++) {
          if (i < count) uvArr[i].set(nodeUVs[i].u, nodeUVs[i].v);
          else uvArr[i].set(-100.0, -100.0);
        }
        shaderRef.current.uniforms.uNodeCount.value = count;
        shaderRef.current.uniforms.uFieldAspect.value = aspectRatio;
      }
      invalidate();
    }, 200);

    return () => {
      if (lutDebounceRef.current) clearTimeout(lutDebounceRef.current);
    };
  }, [nodes, bounds, centeredBounds, aspectRatio, fieldTexture, invalidate]);

  const handleNodePointerDown = (node: NodeInfo) => (e: any) => {
    pendingNodeRef.current = node;
    const x =
      e.clientX ?? e.pageX ?? e.screenX ?? e.nativeEvent?.locationX ?? 0;
    const y =
      e.clientY ?? e.pageY ?? e.screenY ?? e.nativeEvent?.locationY ?? 0;
    nodePointerStartRef.current = { x, y, time: Date.now() };
  };

  const GEOMETRY_DEPTH = 1.5;
  const geometrySurfaceY = GEOMETRY_DEPTH / scale;
  const NODE_HEIGHT = geometrySurfaceY + 0.05;

  const getNodeLocalPosition = (node: NodeInfo) => ({
    x: node.x - centerX,
    y: NODE_HEIGHT,
    z: centerZ - node.z,
  });

  const pinLocalSize = PIN_WORLD_SIZE / scale;

  // InstancedMesh refs — head/body/tip pin parcalari
  // 22+ ayri mesh yerine 3 draw call'da render edilir
  const headInstRef = useRef<any>(null);
  const bodyInstRef = useRef<any>(null);
  const tipInstRef = useRef<any>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tmpColor = useMemo(() => new THREE.Color(), []);

  // Node konum/renk degisiminde matrix + instanceColor guncelle
  useEffect(() => {
    const head = headInstRef.current;
    const body = bodyInstRef.current;
    const tip = tipInstRef.current;
    if (!head || !body || !tip || nodes.length === 0) return;

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const pos = getNodeLocalPosition(node);
      tmpColor.set(moistureToColor(node.moisture));

      // Pin basi (sphere, rotasyon yok)
      dummy.position.set(pos.x, pos.y + pinLocalSize * 1.1, pos.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      head.setMatrixAt(i, dummy.matrix);
      head.setColorAt(i, tmpColor);

      // Pin govdesi (cone, ters cevrilmis)
      dummy.position.set(pos.x, pos.y + pinLocalSize * 0.2, pos.z);
      dummy.rotation.set(Math.PI, 0, 0);
      dummy.updateMatrix();
      body.setMatrixAt(i, dummy.matrix);
      body.setColorAt(i, tmpColor);

      // Pin ucu (cone, ters cevrilmis)
      dummy.position.set(pos.x, pos.y - pinLocalSize * 0.7, pos.z);
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
    nodes,
    pinLocalSize,
    centerX,
    centerZ,
    scale,
    dummy,
    tmpColor,
    invalidate,
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
    if (externalSelectedNodeId !== undefined) {
      applySelectionRef.current(externalSelectedNodeId);
    } else if (selectedNodeIdRef.current) {
      // Field/scale degistiyse mevcut secimi yeniden uygula
      applySelectionRef.current(selectedNodeIdRef.current);
    }
  }, [externalSelectedNodeId, nodes, pinLocalSize, centerX, centerZ, scale]);

  return (
    <group ref={groupRef} position={[0, 0, 0]} scale={[scale, scale, scale]}>
      <mesh
        key={fieldKey}
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
      </mesh>

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

      {nodes.length > 0 && (
        <>
          {/* Pin basi - tum nodelar tek draw call */}
          <instancedMesh
            key={`head-${nodes.length}-${pinLocalSize}`}
            ref={headInstRef}
            args={[undefined, undefined, nodes.length]}
          >
            <sphereGeometry args={[pinLocalSize * 0.36, 8, 6]} />
            <meshStandardMaterial
              color="#ffffff"
              metalness={0.4}
              roughness={0.3}
            />
          </instancedMesh>

          {/* Pin govdesi - tum nodelar tek draw call */}
          <instancedMesh
            key={`body-${nodes.length}-${pinLocalSize}`}
            ref={bodyInstRef}
            args={[undefined, undefined, nodes.length]}
          >
            <coneGeometry args={[pinLocalSize * 0.24, pinLocalSize * 1.4, 8]} />
            <meshStandardMaterial
              color="#ffffff"
              metalness={0.3}
              roughness={0.4}
            />
          </instancedMesh>

          {/* Pin ucu - tum nodelar tek draw call */}
          <instancedMesh
            key={`tip-${nodes.length}-${pinLocalSize}`}
            ref={tipInstRef}
            args={[undefined, undefined, nodes.length]}
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

      {/* Dokunma alanlari - per-node mesh, neredeyse gorunmez (opacity 0.001) */}
      {nodes.map((node) => {
        const pos = getNodeLocalPosition(node);
        return (
          <mesh
            key={`touch-${node.id}`}
            position={[pos.x, pos.y + pinLocalSize * 0.4, pos.z]}
            onPointerDown={handleNodePointerDown(node)}
          >
            <sphereGeometry args={[pinLocalSize * 1.2, 8, 6]} />
            <meshBasicMaterial transparent opacity={0.001} depthTest={false} />
          </mesh>
        );
      })}
    </group>
  );
});
