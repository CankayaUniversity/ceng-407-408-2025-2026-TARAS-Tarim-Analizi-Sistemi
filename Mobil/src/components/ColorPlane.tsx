import { useRef, useState, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber/native';
import { FieldData, FieldPolygon, SensorNode, calculatePolygonCentroid } from '../utils/fieldPlaceholder';
const THREE: any = require('three');

const LIGHT_COLORS = ['#677c98', '#536379', '#3e4b5b', '#988367', '#5b4e3e', '#ac9c86'];
const DARK_COLORS = ['#8696ac', '#8599ad', '#667f99', '#c1b4a4', '#dbc18a', '#cfad63'];

const INITIAL_ROTATION_Y = Math.PI / 4;
const MIN_TILT = 0;
const MAX_TILT = Math.PI / 4;
const ROTATION_SCALE = 0.005;
const ROTATION_INTERPOLATION = 0.4;
const X_VELOCITY_DAMPING = 0.85;
const Y_VELOCITY_DAMPING = 0.8;
const X_VELOCITY_MULTIPLIER = 1.2;
const Y_VELOCITY_MULTIPLIER = 1.4;
const MAX_NODES = 5;
const TARGET_SIZE = 8;

const TAP_DISTANCE_THRESHOLD = 10;
const TAP_TIME_THRESHOLD = 300;
const PIN_WORLD_SIZE = 0.5;

export type NodeInfo = SensorNode;

export interface CameraConfig {
  position: [number, number, number];
  fov: number;
}

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

  return {
    position: [0, cameraY, baseDistance],
    fov,
  };
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

function getPolygonBounds(exterior: [number, number][]): Bounds {
  const xs = exterior.map(p => p[0]);
  const zs = exterior.map(p => p[1]);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  };
}

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
    polygon.holes.forEach(hole => {
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

export function ColorPlane({ fieldData, isDark = false, isActive = true, onNodeSelect, selectedNodeId: externalSelectedNodeId, onCameraConfigChange }: ColorPlaneProps) {
  const COLORS = isDark ? DARK_COLORS : LIGHT_COLORS;
  const nodes = fieldData.nodes;

  // Create a unique key for this field to force remount when field changes
  const fieldKey = useMemo(() => {
    const nodeIds = nodes.map(n => n.id).join(',');
    const polygonHash = fieldData.polygon.exterior.slice(0, 3).flat().join(',');
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
  const nodePointerStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

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
    const extrudeSettings = {
      depth: 1.5 / scale,
      bevelEnabled: false,
    };
    const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);

    geo.rotateX(-Math.PI / 2);
    geo.translate(-centerX, 0, centerZ);

    return geo;
  }, [fieldData.polygon, scale, centerX, centerZ]);

  useEffect(() => {
    const config = calculateCameraConfig(scale);
    onCameraConfigChange?.(config);

    console.group('[Field3D] Configuration');
    console.log('Polygon:', {
      vertices: fieldData.polygon.exterior.length,
      bounds: {
        minX: bounds.minX.toFixed(2),
        maxX: bounds.maxX.toFixed(2),
        minZ: bounds.minZ.toFixed(2),
        maxZ: bounds.maxZ.toFixed(2),
      },
      dimensions: {
        width: (bounds.maxX - bounds.minX).toFixed(2),
        depth: (bounds.maxZ - bounds.minZ).toFixed(2),
      },
      centroid: {
        x: centerX.toFixed(2),
        z: centerZ.toFixed(2),
      },
    });
    console.log('Scaling:', {
      rawScale: (TARGET_SIZE / Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ)).toFixed(4),
      clampedScale: scale.toFixed(4),
      targetSize: TARGET_SIZE,
      pinLocalSize: (PIN_WORLD_SIZE / scale).toFixed(4),
    });
    console.log('Camera:', config);
    console.log('Nodes:', nodes.map(n => ({
      id: n.id,
      position: { x: n.x.toFixed(2), z: n.z.toFixed(2) },
      moisture: n.moisture,
    })));
    console.groupEnd();
  }, [fieldData, bounds, scale, centerX, centerZ, nodes, onCameraConfigChange]);

  const { invalidate, gl } = useThree();

  useEffect(() => {
    attachPointerListeners(gl);
  }, [gl]);

  useFrame(() => {
    if (!isActive) return;
    if (!groupRef.current) return;
    initializeRotation();

    const needsUpdate = updateRotation();
    const hasMomentum = applyMomentum();

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

    targetRotationRef.current.x = Math.max(MIN_TILT, Math.min(MAX_TILT, targetRotationRef.current.x));

    return Math.abs(rotationVelocityRef.current.x) > 0.0001 || Math.abs(rotationVelocityRef.current.y) > 0.0001;
  };

  const invalidateRef = useRef(invalidate);
  invalidateRef.current = invalidate;

  const handlePointerDown = (e: any) => {
    isDraggingRef.current = true;
    dragStartTimeRef.current = Date.now();
    dragDistanceRef.current = { x: 0, y: 0 };

    const x = e.clientX ?? e.pageX ?? e.screenX ?? e.nativeEvent?.locationX ?? 0;
    const y = e.clientY ?? e.pageY ?? e.screenY ?? e.nativeEvent?.locationY ?? 0;

    lastPositionRef.current = { x, y };
    invalidateRef.current();
  };

  const handlePointerMove = (e: any) => {
    if (!isDraggingRef.current || !groupRef.current) return;

    const currentX = e.clientX ?? e.pageX ?? e.screenX ?? e.nativeEvent?.locationX ?? 0;
    const currentY = e.clientY ?? e.pageY ?? e.screenY ?? e.nativeEvent?.locationY ?? 0;

    const deltaX = currentX - lastPositionRef.current.x;
    const deltaY = currentY - lastPositionRef.current.y;

    const rotationY = deltaX * ROTATION_SCALE;
    const rotationX = deltaY * ROTATION_SCALE;

    targetRotationRef.current.x += rotationX;
    targetRotationRef.current.y += rotationY;
    targetRotationRef.current.x = Math.max(MIN_TILT, Math.min(MAX_TILT, targetRotationRef.current.x));

    rotationVelocityRef.current.y = rotationY * Y_VELOCITY_MULTIPLIER;
    rotationVelocityRef.current.x = rotationX * X_VELOCITY_MULTIPLIER;

    dragDistanceRef.current.x += Math.abs(deltaX);
    dragDistanceRef.current.y += Math.abs(deltaY);

    if (pendingNodeRef.current && nodePointerStartRef.current) {
      const totalDist = Math.hypot(
        currentX - nodePointerStartRef.current.x,
        currentY - nodePointerStartRef.current.y
      );
      if (totalDist > TAP_DISTANCE_THRESHOLD) {
        pendingNodeRef.current = null;
        nodePointerStartRef.current = null;
      }
    }

    lastPositionRef.current = { x: currentX, y: currentY };
    invalidateRef.current();
  };

  const handlePointerUp = (e: any) => {
    isDraggingRef.current = false;

    if (pendingNodeRef.current && nodePointerStartRef.current) {
      const currentX = e.clientX ?? e.pageX ?? e.screenX ?? e.nativeEvent?.locationX ?? 0;
      const currentY = e.clientY ?? e.pageY ?? e.screenY ?? e.nativeEvent?.locationY ?? 0;
      const elapsed = Date.now() - nodePointerStartRef.current.time;
      const distance = Math.hypot(
        currentX - nodePointerStartRef.current.x,
        currentY - nodePointerStartRef.current.y
      );

      if (distance <= TAP_DISTANCE_THRESHOLD && elapsed <= TAP_TIME_THRESHOLD) {
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
  };

  const handlePointerLeave = () => {
    isDraggingRef.current = false;
    pendingNodeRef.current = null;
    nodePointerStartRef.current = null;
  };

  const attachPointerListeners = (glRenderer: any) => {
    if (!glRenderer?.domElement) return;
    if (glRenderer.domElement._hasGlobalPointerListeners) return;

    const canvas = glRenderer.domElement;
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointerleave', handlePointerLeave);
    glRenderer.domElement._hasGlobalPointerListeners = true;
  };

  const currentColor = COLORS[colorIndex];

  // Color mapping: yale-blue gradient based on soil moisture
  // 0-20%: lightest blue (50-100), 20-80%: mid tones (200-700), 80-100%: darkest blue (800-950)
  const moistureToColor = (m: number) => {
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
      [r, g, b]
        .map((v) => Math.round(v).toString(16).padStart(2, "0"))
        .join("");

    // Yale Blue color palette
    const blue50 = hexToRgb("#e8f6fd");   // Very dry soil (0-20%)
    const blue200 = hexToRgb("#a1dcf7");  // Low moisture (20-40%)
    const blue400 = hexToRgb("#43b8ef");  // Medium moisture (40-60%)
    const blue700 = hexToRgb("#0c648d");  // Good moisture (60-80%)
    const blue900 = hexToRgb("#04212f");  // High moisture (80-100%)
// ilerde %10 artarak olcak
    if (clamped <= 20) {
      // 0-20%
      const t = clamped / 20;
      const r = lerp(blue50.r, blue200.r, t);
      const g = lerp(blue50.g, blue200.g, t);
      const b = lerp(blue50.b, blue200.b, t);
      return rgbToHex(r, g, b);
    } else if (clamped <= 40) {
      // 20-40%
      const t = (clamped - 20) / 20;
      const r = lerp(blue200.r, blue400.r, t);
      const g = lerp(blue200.g, blue400.g, t);
      const b = lerp(blue200.b, blue400.b, t);
      return rgbToHex(r, g, b);
    } else if (clamped <= 60) {
      // 40-60%
      const t = (clamped - 40) / 20;
      const r = lerp(blue400.r, blue700.r, t);
      const g = lerp(blue400.g, blue700.g, t);
      const b = lerp(blue400.b, blue700.b, t);
      return rgbToHex(r, g, b);
    } else if (clamped <= 80) {
      // 60-80%
      const t = (clamped - 60) / 20;
      const r = lerp(blue700.r, blue900.r, t);
      const g = lerp(blue700.g, blue900.g, t);
      const b = lerp(blue700.b, blue900.b, t);
      return rgbToHex(r, g, b);
    } else {
      // 80-100%
      const t = (clamped - 80) / 20;
      const blue950 = hexToRgb("#031721");
      const r = lerp(blue900.r, blue950.r, t);
      const g = lerp(blue900.g, blue950.g, t);
      const b = lerp(blue900.b, blue950.b, t);
      return rgbToHex(r, g, b);
    }
  };

  const shaderRef = useRef<any>(null);

  const normalizeToUV = (x: number, z: number) => ({
    u: (x - bounds.minX) / (bounds.maxX - bounds.minX),
    v: 1 - (z - bounds.minZ) / (bounds.maxZ - bounds.minZ),
  });

  const uniforms = useMemo(() => {
    const uPos: any[] = [];
    const uCol: any[] = [];

    for (let i = 0; i < MAX_NODES; i++) {
      if (i < nodes.length) {
        const n = nodes[i];
        const { u, v } = normalizeToUV(n.x, n.z);
        uPos.push(new THREE.Vector2(u, v));
        uCol.push(new THREE.Color(moistureToColor(n.moisture)));
      } else {
        uPos.push(new THREE.Vector2(-10, -10));
        uCol.push(new THREE.Color("#0b1620"));
      }
    }

    let maxSep = 0;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const d = uPos[i].distanceTo(uPos[j]);
        if (d > maxSep) maxSep = d;
      }
    }

    const sepNorm = Math.min(1, maxSep / Math.SQRT2);
    const baseRadius = 0.45;
    const maxRadius = 2.0;
    const r = Math.max(
      baseRadius,
      Math.min(maxRadius, baseRadius + sepNorm * (maxRadius - baseRadius)),
    );

    const radii = new Array(MAX_NODES).fill(r);

    return {
      uNodePos: { value: uPos },
      uNodeColor: { value: uCol },
      uRadius: { value: radii },
      uBase: { value: new THREE.Color("#0b1620") },
      uCount: { value: nodes.length },
      uBounds: { value: new THREE.Vector4(centeredBounds.minX, centeredBounds.maxX, centeredBounds.minZ, centeredBounds.maxZ) },
    };
  }, [nodes, bounds, centeredBounds]);

  const vertexShader = `
    varying vec2 vUv;
    varying vec2 vTopUv;
    varying vec3 vNormal;
    varying vec3 vViewDir;
    uniform vec4 uBounds;

    void main(){
      vUv = uv;
      float u = (position.x - uBounds.x) / (uBounds.y - uBounds.x);
      float v = (position.z - uBounds.z) / (uBounds.w - uBounds.z);
      vTopUv = vec2(u, v);
      vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
      vNormal = normalize(normalMatrix * normal);
      vViewDir = normalize(cameraPosition - worldPos);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const fragmentShader = `
    precision mediump float;
    const int MAX_NODES = 5;
    varying vec2 vUv;
    varying vec2 vTopUv;
    varying vec3 vNormal;
    varying vec3 vViewDir;
    uniform vec2 uNodePos[MAX_NODES];
    uniform vec3 uNodeColor[MAX_NODES];
    uniform float uRadius[MAX_NODES];
    uniform int uCount;
    uniform vec3 uBase;

    void main(){
      vec2 topUv = vTopUv;

      float distances[MAX_NODES];
      float minDist = 1e9;
      float secondMinDist = 1e9;
      int nearestIdx = 0;
      int secondNearestIdx = 0;

      for (int i = 0; i < MAX_NODES; i++) {
        if (i >= uCount) {
          distances[i] = 1e9;
        } else {
          float d = distance(topUv, uNodePos[i]);
          distances[i] = d;
          if (d < minDist) {
            secondMinDist = minDist;
            secondNearestIdx = nearestIdx;
            minDist = d;
            nearestIdx = i;
          } else if (d < secondMinDist) {
            secondMinDist = d;
            secondNearestIdx = i;
          }
        }
      }

      vec3 col = uNodeColor[nearestIdx];

      if (uCount > 1 && secondMinDist < 1e8) {
        float edgeDist = secondMinDist - minDist;
        float blurWidth = 0.08;
        float blendFactor = 1.0 - smoothstep(0.0, blurWidth, edgeDist);

        if (blendFactor > 0.0) {
          vec3 secondColor = uNodeColor[secondNearestIdx];
          float ratio = minDist / (minDist + secondMinDist);
          col = mix(col, secondColor, blendFactor * ratio);
        }
      }

      float rim = pow(1.0 - max(0.0, dot(normalize(vNormal), normalize(vViewDir))), 2.0) * 0.1;
      col += vec3(rim) * 0.4;
      col = clamp(col, 0.0, 1.0);

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  useEffect(() => {
    if (!shaderRef.current) return;
    const uPos = shaderRef.current.uniforms.uNodePos.value;
    const uCol = shaderRef.current.uniforms.uNodeColor.value;

    for (let i = 0; i < MAX_NODES; i++) {
      if (i < nodes.length) {
        const n = nodes[i];
        const { u, v } = normalizeToUV(n.x, n.z);
        uPos[i].set(u, v);
        uCol[i].set(new THREE.Color(moistureToColor(n.moisture)));
      } else {
        uPos[i].set(-10, -10);
        uCol[i].set(new THREE.Color("#0b1620"));
      }
    }

    let maxSep = 0;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const d = uPos[i].distanceTo(uPos[j]);
        if (d > maxSep) maxSep = d;
      }
    }
    const sepNorm = Math.min(1.0, maxSep / 1.414213562);
    const baseRadius = 0.45;
    const maxRadius = 2.0;
    const r = Math.max(
      baseRadius,
      Math.min(maxRadius, baseRadius + sepNorm * (maxRadius - baseRadius)),
    );

    for (let i = 0; i < MAX_NODES; i++) {
      shaderRef.current.uniforms.uRadius.value[i] = r;
    }

    shaderRef.current.uniforms.uCount.value = nodes.length;
    shaderRef.current.uniforms.uBounds.value.set(centeredBounds.minX, centeredBounds.maxX, centeredBounds.minZ, centeredBounds.maxZ);

    // Force re-render after updating uniforms
    invalidate();
  }, [nodes, bounds, centeredBounds, invalidate]);

  useEffect(() => {
    if (externalSelectedNodeId !== undefined) {
      setSelectedNodeId(externalSelectedNodeId);
    }
  }, [externalSelectedNodeId]);

  const handleNodePointerDown = (node: NodeInfo) => (e: any) => {
    pendingNodeRef.current = node;

    const x = e.clientX ?? e.pageX ?? e.screenX ?? e.nativeEvent?.locationX ?? 0;
    const y = e.clientY ?? e.pageY ?? e.screenY ?? e.nativeEvent?.locationY ?? 0;
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
      <mesh key={fieldKey} ref={meshRef} position={[0, 0, 0]} castShadow receiveShadow geometry={geometry}>
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
      <pointLight position={[-4 / scale, 4 / scale, 4 / scale]} intensity={0.5} color={currentColor} />

      {nodes.map((node) => {
        const pos = getNodeLocalPosition(node);
        const nodeColor = moistureToColor(node.moisture);
        // Include moisture in key to force re-render when values change
        const nodeKey = `${node.id}-${node.moisture}`;
        return (
          <group key={nodeKey} position={[pos.x, pos.y, pos.z]}>
            {/* Pin head */}
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

            {/* Pin body */}
            <mesh position={[0, pinLocalSize * 0.2, 0]} rotation={[Math.PI, 0, 0]}>
              <coneGeometry args={[pinLocalSize * 0.24, pinLocalSize * 1.4, 12]} />
              <meshStandardMaterial
                color={nodeColor}
                metalness={0.3}
                roughness={0.4}
              />
            </mesh>

            {/* Pin tip */}
            <mesh position={[0, pinLocalSize * -0.7, 0]} rotation={[Math.PI, 0, 0]}>
              <coneGeometry args={[pinLocalSize * 0.08, pinLocalSize * 0.8, 8]} />
              <meshStandardMaterial
                color={nodeColor}
                metalness={0.5}
                roughness={0.3}
              />
            </mesh>

            {/* Hitbox */}
            <mesh
              position={[0, pinLocalSize * 0.4, 0]}
              onPointerDown={handleNodePointerDown(node)}
            >
              <sphereGeometry args={[pinLocalSize * 1.2, 12, 8]} />
              <meshBasicMaterial transparent opacity={0.001} depthTest={false} />
            </mesh>

            {/* Selection ring */}
            {selectedNodeId === node.id && (
              <mesh position={[0, pinLocalSize * 1.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[pinLocalSize * 0.56, pinLocalSize * 0.72, 32]} />
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
