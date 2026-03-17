// 3D tarla gorsellestirme - nem bazli renk haritalama ve sensor nodelari
// Props: fieldData, isDark, isActive, onNodeSelect, selectedNodeId, onCameraConfigChange
import { useRef, useState, useMemo, useEffect, useCallback } from "react";
import { useFrame, useThree } from "@react-three/fiber/native";
import {
  FieldData,
  FieldPolygon,
  SensorNode,
  calculatePolygonCentroid,
} from "../utils/fieldPlaceholder";
const THREE: any = require("three");

const LIGHT_COLORS = [
  "#677c98",
  "#536379",
  "#3e4b5b",
  "#988367",
  "#5b4e3e",
  "#ac9c86",
];
const DARK_COLORS = [
  "#8696ac",
  "#8599ad",
  "#667f99",
  "#c1b4a4",
  "#dbc18a",
  "#cfad63",
];

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

// Nem degerini renge donustur (mavi gradyan)
const moistureToColor = (m: number): string => {
  const clamped = Math.max(0, Math.min(100, m));
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const hexToRgb = (hex: string) => {
    const c = hex.replace("#", "");
    return {
      r: parseInt(c.substring(0, 2), 16),
      g: parseInt(c.substring(2, 4), 16),
      b: parseInt(c.substring(4, 6), 16),
    };
  };
  const rgbToHex = (r: number, g: number, b: number) =>
    "#" +
    [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

  const blue50 = hexToRgb("#e8f6fd");
  const blue200 = hexToRgb("#a1dcf7");
  const blue400 = hexToRgb("#43b8ef");
  const blue700 = hexToRgb("#2b87b8");
  const blue900 = hexToRgb("#1a5a7a");

  if (clamped <= 20) {
    const t = clamped / 20;
    return rgbToHex(
      lerp(blue50.r, blue200.r, t),
      lerp(blue50.g, blue200.g, t),
      lerp(blue50.b, blue200.b, t),
    );
  } else if (clamped <= 40) {
    const t = (clamped - 20) / 20;
    return rgbToHex(
      lerp(blue200.r, blue400.r, t),
      lerp(blue200.g, blue400.g, t),
      lerp(blue400.b, blue400.b, t),
    );
  } else if (clamped <= 60) {
    const t = (clamped - 40) / 20;
    return rgbToHex(
      lerp(blue400.r, blue700.r, t),
      lerp(blue400.g, blue700.g, t),
      lerp(blue400.b, blue700.b, t),
    );
  } else if (clamped <= 80) {
    const t = (clamped - 60) / 20;
    return rgbToHex(
      lerp(blue700.r, blue900.r, t),
      lerp(blue700.g, blue900.g, t),
      lerp(blue700.b, blue900.b, t),
    );
  } else {
    const t = (clamped - 80) / 20;
    const blue950 = hexToRgb("#0d3f5c");
    return rgbToHex(
      lerp(blue900.r, blue950.r, t),
      lerp(blue900.g, blue950.g, t),
      lerp(blue900.b, blue950.b, t),
    );
  }
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

export function ColorPlane({
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

  const [colorIndex] = useState(0);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

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
          if (selectedNodeId === node.id) {
            setSelectedNodeId(null);
            onNodeSelect?.(null);
          } else {
            setSelectedNodeId(node.id);
            onNodeSelect?.(node);
          }
        }
      }

      pendingNodeRef.current = null;
      nodePointerStartRef.current = null;
      invalidateRef.current();
    },
    [selectedNodeId, onNodeSelect],
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

  const currentColor = COLORS[colorIndex];
  const shaderRef = useRef<any>(null);

  const normalizeToUV = (x: number, z: number) => ({
    u: (x - bounds.minX) / (bounds.maxX - bounds.minX),
    v: 1 - (z - bounds.minZ) / (bounds.maxZ - bounds.minZ),
  });

  // Alan en-boy oranini hesapla (UV stretching icin)
  const fieldWidth = bounds.maxX - bounds.minX;
  const fieldDepth = bounds.maxZ - bounds.minZ;
  const aspectRatio = fieldWidth / Math.max(fieldDepth, 0.001);

  const uniforms = useMemo(() => {
    // En az 1 node olmali (shader array bos olamaz)
    const uPos: any[] = [];
    const uCol: any[] = [];
    const uMoist: number[] = [];

    if (nodes.length === 0) {
      // Placeholder - ekran disinda, gorunmez
      uPos.push(new THREE.Vector2(0.5, 0.5));
      uCol.push(new THREE.Color("#2b87b8"));
      uMoist.push(0.5);
    } else {
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const { u, v } = normalizeToUV(n.x, n.z);
        uPos.push(new THREE.Vector2(u, v));
        uCol.push(new THREE.Color(moistureToColor(n.moisture)));
        uMoist.push(n.moisture);
      }
    }

    return {
      uNodePos: { value: uPos },
      uNodeColor: { value: uCol },
      uNodeMoisture: { value: uMoist },
      uTime: { value: 0.0 },
      uPulseAmp: { value: 0.6 },
      uCount: { value: parseFloat(nodes.length.toString()) }, // Float olarak gonder
      uAspect: { value: aspectRatio },
      uBounds: {
        value: new THREE.Vector4(
          centeredBounds.minX,
          centeredBounds.maxX,
          centeredBounds.minZ,
          centeredBounds.maxZ,
        ),
      },
    };
  }, [nodes, bounds, centeredBounds, aspectRatio]);

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

  // Fragment shader - dinamik node sayisi ile IDW interpolasyon
  // Array boyutu en az 1 olmali (GLSL bos array desteklemiyor)
  const shaderNodeCount = Math.max(nodes.length, 1);
  const fragmentShader = `
    precision highp float;

    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vViewDir;
    varying vec3 vLocalNormal;

    uniform vec2 uNodePos[${shaderNodeCount}];
    uniform vec3 uNodeColor[${shaderNodeCount}];
    uniform float uNodeMoisture[${shaderNodeCount}];
    uniform float uCount;
    uniform float uTime;
    uniform float uPulseAmp;
    uniform float uAspect;
    uniform vec4 uBounds;

    void main(){
      vec2 uv = vUv;
      int nodeCount = int(uCount);

      // Sensor yoksa varsayilan renk
      if (nodeCount <= 0) {
        gl_FragColor = vec4(0.2, 0.4, 0.5, 1.0);
        return;
      }

      // Aspect ratio duzeltmesi icin UV'yi olcekle (dairesel mesafe icin)
      vec2 uvCorrected = vec2(uv.x * uAspect, uv.y);

      // Tum sensorlerin mesafelerini hesapla ve en kucuk iki mesafeyi bul
      float minDist = 999999.0;
      float secondMinDist = 999999.0;

      for (int i = 0; i < ${shaderNodeCount}; i++) {
        if (i >= nodeCount) break;
        vec2 nodePosCorrected = vec2(uNodePos[i].x * uAspect, uNodePos[i].y);
        float d = length(uvCorrected - nodePosCorrected);
        if (d < minDist) {
          secondMinDist = minDist;
          minDist = d;
        } else if (d < secondMinDist) {
          secondMinDist = d;
        }
      }

      // Blend radius - renk gecis mesafesi
      float blendRadius = 0.12;

      // Kesisim bolgesinde miyiz? (iki sensor birbirine cok yakinsa)
      float edgeProximity = secondMinDist - minDist;
      bool nearEdge = edgeProximity < blendRadius;

      // Tum sensorlerden agirlikli renk toplama
      vec3 blendedCol = vec3(0.0);
      float totalWeight = 0.0;
      float maxMoist = 0.0;

      for (int i = 0; i < ${shaderNodeCount}; i++) {
        if (i >= nodeCount) break;

        vec2 nodePosCorrected = vec2(uNodePos[i].x * uAspect, uNodePos[i].y);
        float nodeDist = length(uvCorrected - nodePosCorrected);
        float nodeMoist = uNodeMoisture[i];

        // Maksimum nemi takip et
        if (nodeMoist > maxMoist) {
          maxMoist = nodeMoist;
        }

        // Mesafe bazli agirlik (yakin sensorler daha etkili)
        float distWeight = 1.0 / (nodeDist * nodeDist + 0.001);

        // Nem bazli agirlik (yuksek nem daha etkili yayilir)
        float moistWeight = nodeMoist * nodeMoist;

        // Kesisim bolgesinde: mesafe + nem birlikte etkili
        // Kesisim disinda: sadece en yakin sensor
        float weight;
        if (nearEdge) {
          // Kesisim bolgesinde yumusak gecis
          weight = distWeight * moistWeight;
        } else {
          // Kesisim disinda: sadece cok yakin sensorler etkili
          float falloff = 1.0 - smoothstep(0.0, minDist + 0.01, nodeDist);
          weight = falloff * moistWeight;
        }

        blendedCol = blendedCol + uNodeColor[i] * weight;
        totalWeight = totalWeight + weight;
      }

      // Final renk hesapla
      vec3 col = vec3(0.3, 0.5, 0.6);
      if (totalWeight > 0.001) {
        col = blendedCol / totalWeight;
      }

      // Yavas ve belirgin darbe efekti
      float pulse = sin(uTime * 0.5 - minDist * 2.5) * 0.5 + 0.5;
      float fade = exp(-minDist * minDist * 2.0);
      col = col * (1.0 + pulse * fade * uPulseAmp);

      // Hafif kenar isigi
      float rim = pow(1.0 - max(0.0, dot(normalize(vNormal), normalize(vViewDir))), 2.5) * 0.08;
      col = col + vec3(rim) * 0.15;

      col = clamp(col, 0.0, 1.0);

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  useEffect(() => {
    if (!shaderRef.current) return;

    const nodeCount = nodes.length;
    if (nodeCount === 0) return;

    const uPos = shaderRef.current.uniforms.uNodePos.value;
    const uCol = shaderRef.current.uniforms.uNodeColor.value;
    const uMoist = shaderRef.current.uniforms.uNodeMoisture.value;

    // Sadece gercek sensorleri guncelle
    for (let i = 0; i < nodeCount; i++) {
      const n = nodes[i];
      const { u, v } = normalizeToUV(n.x, n.z);
      if (uPos[i]) uPos[i].set(u, v);
      if (uCol[i]) uCol[i].set(moistureToColor(n.moisture));
      if (uMoist) uMoist[i] = n.moisture;
    }

    shaderRef.current.uniforms.uCount.value = parseFloat(nodeCount.toString());
    shaderRef.current.uniforms.uAspect.value = aspectRatio;
    shaderRef.current.uniforms.uBounds.value.set(
      centeredBounds.minX,
      centeredBounds.maxX,
      centeredBounds.minZ,
      centeredBounds.maxZ,
    );
    invalidate();
  }, [nodes, bounds, centeredBounds, invalidate, aspectRatio]);

  useEffect(() => {
    if (externalSelectedNodeId !== undefined) {
      setSelectedNodeId(externalSelectedNodeId);
    }
  }, [externalSelectedNodeId]);

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

  return (
    <group ref={groupRef} position={[0, 0, 0]} scale={[scale, scale, scale]}>
      <mesh
        key={fieldKey}
        ref={meshRef}
        position={[0, 0, 0]}
        castShadow
        receiveShadow
        geometry={geometry}
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
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-far={20 / scale}
        shadow-camera-left={-8 / scale}
        shadow-camera-right={8 / scale}
        shadow-camera-top={8 / scale}
        shadow-camera-bottom={-8 / scale}
      />
      <pointLight
        position={[-4 / scale, 4 / scale, 4 / scale]}
        intensity={0.5}
        color={currentColor}
      />

      {nodes.map((node) => {
        const pos = getNodeLocalPosition(node);
        const nodeColor = moistureToColor(node.moisture);
        const nodeKey = `${node.id}-${node.moisture}`;
        return (
          <group key={nodeKey} position={[pos.x, pos.y, pos.z]}>
            {/* Pin basi */}
            <mesh position={[0, pinLocalSize * 1.1, 0]}>
              <sphereGeometry args={[pinLocalSize * 0.36, 16, 12]} />
              <meshStandardMaterial
                color={nodeColor}
                metalness={0.4}
                roughness={0.3}
                emissive={nodeColor}
                emissiveIntensity={selectedNodeId === node.id ? 0.3 : 0.1}
              />
            </mesh>

            {/* Pin govdesi */}
            <mesh
              position={[0, pinLocalSize * 0.2, 0]}
              rotation={[Math.PI, 0, 0]}
            >
              <coneGeometry
                args={[pinLocalSize * 0.24, pinLocalSize * 1.4, 12]}
              />
              <meshStandardMaterial
                color={nodeColor}
                metalness={0.3}
                roughness={0.4}
              />
            </mesh>

            {/* Pin ucu */}
            <mesh
              position={[0, pinLocalSize * -0.7, 0]}
              rotation={[Math.PI, 0, 0]}
            >
              <coneGeometry
                args={[pinLocalSize * 0.08, pinLocalSize * 0.8, 8]}
              />
              <meshStandardMaterial
                color={nodeColor}
                metalness={0.5}
                roughness={0.3}
              />
            </mesh>

            {/* Dokunma alani */}
            <mesh
              position={[0, pinLocalSize * 0.4, 0]}
              onPointerDown={handleNodePointerDown(node)}
            >
              <sphereGeometry args={[pinLocalSize * 1.2, 12, 8]} />
              <meshBasicMaterial
                transparent
                opacity={0.001}
                depthTest={false}
              />
            </mesh>

            {/* Secim halkasi */}
            {selectedNodeId === node.id && (
              <mesh
                position={[0, pinLocalSize * 1.5, 0]}
                rotation={[-Math.PI / 2, 0, 0]}
              >
                <ringGeometry
                  args={[pinLocalSize * 0.56, pinLocalSize * 0.72, 32]}
                />
                <meshBasicMaterial
                  color={nodeColor}
                  transparent
                  opacity={0.9}
                  depthTest={false}
                />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}
