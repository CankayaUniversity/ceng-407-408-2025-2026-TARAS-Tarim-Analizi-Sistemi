import { useRef, useState, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber/native';
const THREE: any = require('three');
import { Text as TroikaText } from 'troika-three-text';

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
const LABEL_DISPLAY_MS = 4000;
const MAX_NODES = 5;

interface NodeInfo {
  id: string;
  x: number;
  z: number;
  moisture: number;
}

interface ColorPlaneProps {
  isDark?: boolean;
}

interface Position {
  x: number;
  y: number;
}

export function ColorPlane({ isDark = false }: ColorPlaneProps) {
  const COLORS = isDark ? DARK_COLORS : LIGHT_COLORS;

  const meshRef = useRef<any>(null);
  const groupRef = useRef<any>(null);
  const rotationVelocityRef = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const lastPositionRef = useRef<Position>({ x: 0, y: 0 });
  const dragStartTimeRef = useRef(0);
  const dragDistanceRef = useRef<Position>({ x: 0, y: 0 });
  const initializedRef = useRef(false);
  const targetRotationRef = useRef({ x: 0, y: INITIAL_ROTATION_Y });

  const [colorIndex] = useState(0);

  // Placeholder node generation
  const [nodes] = useState<NodeInfo[]>(() => {
    const rng = () => Math.random();
    const count = 3 + Math.floor(rng() * 3); // 3-5
    const positions: NodeInfo[] = [];

    const tryPlace = (moistureMin: number, moistureMax: number) => {
      for (let attempts = 0; attempts < 50; attempts++) {
        const x = rng() * 6 - 3;
        const z = rng() * 6 - 3;
        const distanceOk = positions.every(
          (p) => Math.hypot(p.x - x, p.z - z) > 1.0,
        );
        if (!distanceOk) continue;
        const moisture = Math.floor(
          moistureMin + rng() * (moistureMax - moistureMin + 1),
        );
        positions.push({ id: `node-${positions.length + 1}`, x, z, moisture });
        return true;
      }
      return false;
    };

    tryPlace(90, 99);
    tryPlace(50, 59);
    tryPlace(0, 9);

    while (positions.length < count) {
      const x = rng() * 6 - 3;
      const z = rng() * 6 - 3;
      const distanceOk = positions.every(
        (p) => Math.hypot(p.x - x, p.z - z) > 1.0,
      );
      if (!distanceOk) continue;
      const moisture = Math.floor(rng() * 100);
      positions.push({ id: `node-${positions.length + 1}`, x, z, moisture });
    }

    return positions;
  });

  useFrame(({ gl }) => {
    if (!groupRef.current) return;
    initializeRotation();
    updateRotation();
    applyMomentum();
    attachPointerListeners(gl);

    Object.keys(labelRefs.current).forEach((k) => {
      const ref = labelRefs.current[k];
      if (ref && camera) {
        ref.lookAt(camera.position);
        const dist = ref.position.distanceTo(camera.position);
        const scale = Math.max(0.6, Math.min(1.6, 0.12 * dist));
        ref.scale.setScalar(scale);
      }
    });
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

  const updateRotation = () => {
    groupRef.current.rotation.x += (targetRotationRef.current.x - groupRef.current.rotation.x) * ROTATION_INTERPOLATION;
    groupRef.current.rotation.y += (targetRotationRef.current.y - groupRef.current.rotation.y) * ROTATION_INTERPOLATION;
  };

  const applyMomentum = () => {
    if (isDraggingRef.current) return;

    targetRotationRef.current.x += rotationVelocityRef.current.x;
    targetRotationRef.current.y += rotationVelocityRef.current.y;

    rotationVelocityRef.current.x *= X_VELOCITY_DAMPING;
    rotationVelocityRef.current.y *= Y_VELOCITY_DAMPING;

    targetRotationRef.current.x = Math.max(MIN_TILT, Math.min(MAX_TILT, targetRotationRef.current.x));
  };

  const handlePointerDown = (e: any) => {
    isDraggingRef.current = true;
    dragStartTimeRef.current = Date.now();
    dragDistanceRef.current = { x: 0, y: 0 };

    const x = e.clientX ?? e.pageX ?? e.screenX ?? e.nativeEvent?.locationX ?? 0;
    const y = e.clientY ?? e.pageY ?? e.screenY ?? e.nativeEvent?.locationY ?? 0;

    lastPositionRef.current = { x, y };
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

    lastPositionRef.current = { x: currentX, y: currentY };
  };

  const handlePointerUp = () => {
    isDraggingRef.current = false;
  };

  const handlePointerLeave = () => {
    isDraggingRef.current = false;
  };

  const attachPointerListeners = (gl: any) => {
    if (gl.domElement._hasGlobalPointerListeners) return;

    const canvas = gl.domElement;
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointerleave', handlePointerLeave);
    gl.domElement._hasGlobalPointerListeners = true;
  };

  const currentColor = COLORS[colorIndex];

  const moistureToColor = (m: number) => {
    //todo improve color mapping
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

    const blue = hexToRgb("#2563eb");
    const green = hexToRgb("#10b981");
    const red = hexToRgb("#ef4444");

    if (clamped <= 50) {
      const t = clamped / 50;
      const r = lerp(blue.r, green.r, t);
      const g = lerp(blue.g, green.g, t);
      const b = lerp(blue.b, green.b, t);
      return rgbToHex(r, g, b);
    } else {
      const t = (clamped - 50) / 50;
      const r = lerp(green.r, red.r, t);
      const g = lerp(green.g, red.g, t);
      const b = lerp(green.b, red.b, t);
      return rgbToHex(r, g, b);
    }
  };

  const shaderRef = useRef<any>(null);

  const uniforms = useMemo(() => {
    const uPos: any[] = [];
    const uCol: any[] = [];
    for (let i = 0; i < MAX_NODES; i++) {
      if (i < nodes.length) {
        const n = nodes[i];
        uPos.push(new THREE.Vector2((n.x + 4) / 8, 1 - (n.z + 4) / 8));
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
      uTime: { value: 0.0 },
      uPulseAmp: { value: 0.08 },
      uSaturationBoost: { value: 1.25 },
      uMaxValue: { value: 0.82 },
      uBase: { value: new THREE.Color("#0b1620") },
      uCount: { value: nodes.length },
    };
  }, [nodes]);

  const vertexShader = `
    varying vec2 vUv;
    varying vec2 vTopUv;
    varying vec3 vNormal;
    varying vec3 vViewDir;

    void main(){
      vUv = uv;
      // compute top-projection UV in local model space so it rotates with the mesh
      vTopUv = vec2((position.x + 4.0) / 8.0, 1.0 - (position.z + 4.0) / 8.0);
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
    uniform float uTime;
    uniform float uPulseAmp;
    uniform float uSaturationBoost;
    uniform float uMaxValue;
    uniform vec3 uBase;

    const float PI = 3.141592653589793;

    // gaussian-like falloff that never becomes exactly zero
    float falloff(float d, float r) {
      float x = d / max(0.0001, r);
      return 1.0 / (1.0 + 2.0 * x * x);
    }

    // RGB <-> HSV (simple) ------------------------------------
    vec3 rgb2hsv(vec3 c){
      float cmax = max(c.r, max(c.g, c.b));
      float cmin = min(c.r, min(c.g, c.b));
      float d = cmax - cmin;
      float h = 0.0;
      if (d > 0.00001) {
        if (cmax == c.r) {
          h = mod((c.g - c.b) / d, 6.0);
        } else if (cmax == c.g) {
          h = (c.b - c.r) / d + 2.0;
        } else {
          h = (c.r - c.g) / d + 4.0;
        }
        h = h / 6.0;
        if (h < 0.0) h += 1.0;
      }
      float s = (cmax <= 0.00001) ? 0.0 : d / cmax;
      return vec3(h, s, cmax);
    }

    vec3 hsv2rgb(vec3 c){
      float h = c.x * 6.0;
      float s = c.y;
      float v = c.z;
      int i = int(floor(h));
      float f = h - float(i);
      float p = v * (1.0 - s);
      float q = v * (1.0 - s * f);
      float t = v * (1.0 - s * (1.0 - f));
      vec3 outCol;
      if (i == 0) outCol = vec3(v, t, p);
      else if (i == 1) outCol = vec3(q, v, p);
      else if (i == 2) outCol = vec3(p, v, t);
      else if (i == 3) outCol = vec3(p, q, v);
      else if (i == 4) outCol = vec3(t, p, v);
      else outCol = vec3(v, p, q);
      return outCol;
    }

    void main(){
      float pulse = max(0.03, uPulseAmp) * (0.8 + 0.6 * sin(uTime * 1.6));
      vec2 topUv = vTopUv;

      float s = 0.0;
      vec2 hueAcc = vec2(0.0);
      float satAcc = 0.0;
      float valAcc = 0.0;
      vec3 glowSatAcc = vec3(0.0);
      float nearestD = 1e9;
      float nearestR = 1.0;
      int nearestIdx = 0;

      for (int i = 0; i < MAX_NODES; i++) {
        if (i >= uCount) break;
        float d = distance(topUv, uNodePos[i]);
        float r = uRadius[i] + pulse * 0.09;
        float dn = d / max(0.0001, r);

        float wCore = exp(- (dn * dn) * 6.0); // tight Gaussian core
        float wSoft = falloff(d, r);
        float blend = smoothstep(0.0, 1.4, dn);
        float w = mix(wCore * 1.8, wSoft, blend);
        float weight = pow(max(w, 0.0), 1.05);

        vec3 hsv = rgb2hsv(uNodeColor[i]);
        float hue = hsv.x; // 0..1
        float sat = hsv.y;
        float val = hsv.z;

        float coreBoost = clamp(wCore * 2.0, 0.0, 1.4);
        float satBoost = sat * (1.0 + coreBoost * 0.85);

        // add to accumulators using stronger weight
        s += weight;
        hueAcc += vec2(cos(hue * 2.0 * PI), sin(hue * 2.0 * PI)) * (weight * satBoost);
        satAcc += weight * satBoost;
        valAcc += weight * val;

        // halo uses a wider Gaussian for a circular halo
        float gw = exp(- (dn * dn) * 2.2) * 0.95;
        glowSatAcc += gw * vec3(sat);

        if (d < nearestD) { nearestD = d; nearestIdx = i; nearestR = r; }
      }

      vec3 col;
      if (s > 1e-5) {
        // reconstruct HSV from accumulated components
        float hueAngle = atan(hueAcc.y, hueAcc.x);
        float hue = hueAngle / (2.0 * PI);
        if (hue < 0.0) hue += 1.0;
        float sat = satAcc / s;
        float val = valAcc / s;

        // boost saturation but cap value to avoid brightness
        sat = clamp(sat * uSaturationBoost + 0.05, 0.0, 1.6);
        val = clamp(val * 0.95, 0.0, uMaxValue);

        col = hsv2rgb(vec3(hue, sat, val));

        // add a subtle desaturated glow by increasing saturation slightly in midrange
        float glowFactor = clamp(length(glowSatAcc) * 0.14, 0.0, 0.28);
        vec3 hsvOut = rgb2hsv(col);
        hsvOut.y = clamp(hsvOut.y + glowFactor, 0.0, 1.6);
        col = hsv2rgb(hsvOut);
      } else {
        // fallback nearest node
        col = uNodeColor[nearestIdx];
      }

      // compute smooth, per-node dominance so equal-distance points blend hues smoothly
      float domSum = 0.0;
      vec3 domColorSum = vec3(0.0);
      for (int i = 0; i < MAX_NODES; i++) {
        if (i >= uCount) break;
        float d = distance(topUv, uNodePos[i]);
        float r = uRadius[i] + pulse * 0.09;
        float dn = d / max(0.0001, r);
        // Gaussian dominance: strong near center, decays smoothly
        float dom = exp(- (dn * dn) * 3.0);
        dom = clamp(dom, 0.0, 1.0);
        // apply slight non-linear emphasis to sharpen the center without hard cuts
        dom = pow(dom, 1.05);

        // compute per-node boosted color in HSV (more saturated, slightly dimmer)
        vec3 nodeHsv = rgb2hsv(uNodeColor[i]);
        nodeHsv.y = clamp(nodeHsv.y * (1.0 + dom * 0.95), 0.0, 1.8);
        nodeHsv.z = clamp(nodeHsv.z * (1.0 - dom * 0.12), 0.0, uMaxValue);
        vec3 nodeBoostCol = hsv2rgb(nodeHsv);

        domSum += dom;
        domColorSum += dom * nodeBoostCol;
      }

      if (domSum > 1e-5) {
        vec3 domCombined = domColorSum / domSum;
        // blend amount depends on total dominance sum (clamped to [0,1]) so multiple nearby cores mix naturally
        float domBlend = clamp(domSum * 0.75, 0.0, 1.0);
        col = mix(col, domCombined, domBlend * 0.92);
      }

      // rim lighting to keep depth but low brightness impact
      float rim = pow(1.0 - max(0.0, dot(normalize(vNormal), normalize(vViewDir))), 1.9) * 0.12;
      col += vec3(rim) * 0.45;

      // gentle tone mapping and clamp
      col = pow(col, vec3(0.96));
      col = clamp(col, 0.0, 1.0);

      // subtle lift in darker areas slightly
      col = mix(col, col + vec3(0.03), 0.28);

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
        uPos[i].set((n.x + 4) / 8, 1 - (n.z + 4) / 8);
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
  }, [nodes]);

  useFrame((_, delta) => {
    if (shaderRef.current) shaderRef.current.uniforms.uTime.value += delta;
  });

  const { camera } = useThree();

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const labelRefs = useRef<Record<string, any>>({});
  const hideTimeoutRef = useRef<any>(null);
  const lastShowTimeRef = useRef(0);

  const TextGeoMesh = ({
    text,
    color = "#fff",
    size = 0.08,
  }: {
    text: string;
    color?: string;
    size?: number;
  }) => {
    const font: any = useMemo(() => {
      try {
        return require("../assets/fonts/helvetiker_regular.typeface.json");
      } catch (e) {
        try {
          return require("three/examples/fonts/helvetiker_regular.typeface.json");
        } catch (err) {
          if (typeof __DEV__ !== "undefined" && __DEV__)
            console.debug("ColorPlane: Font JSON not found for TextGeometry.", err);
          return null;
        }
      }
    }, []);

    const geoms = useMemo(() => {
      if (!font) return null;
      try {
        const { FontLoader } = require("three/examples/jsm/loaders/FontLoader.js");
        const { TextGeometry } = require("three/examples/jsm/geometries/TextGeometry.js");
        const loader = new FontLoader();
        const f = loader.parse(font);

        const lines = (text || "").split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
        const out: any[] = [];
        for (let i = 0; i < lines.length; i++) {
          try {
            const g = new TextGeometry(lines[i], {
              font: f,
              size,
              height: 0.01,
              curveSegments: 6,
            });
            g.computeBoundingBox();
            if (g.boundingBox) {
              const bx = (g.boundingBox.max.x + g.boundingBox.min.x) / 2;
              const by = (g.boundingBox.max.y + g.boundingBox.min.y) / 2;
              g.translate(-bx, -by, 0);
            }
            out.push(g);
          } catch (e) {
            if (typeof __DEV__ !== "undefined" && __DEV__)
              console.debug("ColorPlane: TextGeometry line creation failed.", e);
          }
        }
        return out.length > 0 ? out : null;
      } catch (e) {
        if (typeof __DEV__ !== "undefined" && __DEV__)
          console.debug("ColorPlane: TextGeometry creation failed.", e);
        return null;
      }
    }, [text, font, size]);

    if (!geoms) return null;

    return (
      <group position={[0, 0.06, 0.03]} renderOrder={9999}>
        {geoms.map((g, idx) => (
          <mesh
            key={idx}
            geometry={g}
            position={[0, -idx * (size + 0.02), 0]}
            renderOrder={9999}
          >
            <meshBasicMaterial color={color} depthTest={false} depthWrite={false} />
          </mesh>
        ))}
      </group>
    );
  };

  const TroikaTextMesh = ({
    text,
    color = "#fff",
    fontSize = 0.08,
    maxWidth = 1.3,
  }: {
    text: string;
    color?: string;
    fontSize?: number;
    maxWidth?: number;
  }) => {
    const TextClass: any = useMemo(() => {
      const candidate = (TroikaText as any) || null;
      // troika-three-text relies on DOM APIs (like document) which are not
      // available in React Native. Avoid using Troika when `document` is
      // undefined to prevent runtime ReferenceError crashes on mobile.
      if (typeof document === 'undefined') {
        if (typeof __DEV__ !== 'undefined' && __DEV__)
          console.debug('ColorPlane: troika-three-text disabled (no document present).');
        return null;
      }
      if (typeof candidate !== 'function') {
        if (typeof __DEV__ !== 'undefined' && __DEV__)
          console.debug(
            'ColorPlane: troika-three-text.Text export not available or invalid, falling back.',
          );
        return null;
      }
      return candidate;
    }, []);

    const textObj: any = useMemo(() => {
      if (!TextClass) return null;
      try {
        return new TextClass();
      } catch (e) {
        if (typeof __DEV__ !== "undefined" && __DEV__)
          console.debug("ColorPlane: troika Text instantiation failed.", e);
        return null;
      }
    }, [TextClass]);

    useEffect(() => {
      if (!textObj) return;
      textObj.text = text;
      textObj.fontSize = fontSize;
      textObj.maxWidth = maxWidth;
      textObj.anchorX = "center";
      textObj.anchorY = "middle";
      textObj.color = color;
      (textObj as any).sync && (textObj as any).sync();
      textObj.renderOrder = 9999;
      if ((textObj as any).material) {
        (textObj as any).material.depthTest = false;
        (textObj as any).material.depthWrite = false;
        (textObj as any).material.transparent = true;
      }
      return () => {
        textObj.dispose && (textObj as any).dispose();
      };
    }, [text, color, fontSize, maxWidth, textObj]);

    if (textObj) return <primitive object={textObj} />;

    return <TextGeoMesh text={text} color={color} size={fontSize} />;
  };

  const showLabelForNode = (node: NodeInfo) => {
    const now = Date.now();
    if (selectedNodeId === node.id && now - lastShowTimeRef.current < 1200) {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = setTimeout(() => {
        setSelectedNodeId((cur) => (cur === node.id ? null : cur));
      }, LABEL_DISPLAY_MS);
      lastShowTimeRef.current = now;
      return;
    }

    lastShowTimeRef.current = now;

    setSelectedNodeId(node.id);

    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    hideTimeoutRef.current = setTimeout(() => {
      setSelectedNodeId((cur) => (cur === node.id ? null : cur));
    }, LABEL_DISPLAY_MS);
  };

  const handleNodePointerDown = (node: NodeInfo) => (e: any) => {
    e && e.stopPropagation && e.stopPropagation();
    showLabelForNode(node);
  };

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      <mesh ref={meshRef} position={[0, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[8, 1.5, 8]} />
        <shaderMaterial
          ref={shaderRef}
          uniforms={uniforms}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
        />
      </mesh>

      <ambientLight intensity={0.8} />
      <directionalLight
        position={[6, 8, 6]}
        intensity={1.4}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-far={20}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
      />
      <pointLight position={[-4, 4, 4]} intensity={0.5} color={currentColor} />

      {nodes.map((node) => (
        <group key={node.id} position={[node.x, 0, node.z]}>
          <mesh position={[0, 0.9, 0]}>
            <sphereGeometry args={[0.14, 16, 8]} />
            <meshStandardMaterial
              color={moistureToColor(node.moisture)}
              metalness={0.2}
              roughness={0.6}
            />
          </mesh>

          <mesh
            position={[0, 0.9, 0]}
            onPointerDown={handleNodePointerDown(node)}
          >
            <sphereGeometry args={[0.7, 16, 12]} />
            <meshBasicMaterial transparent opacity={0.001} depthTest={false} />
          </mesh>

          {selectedNodeId === node.id && (
            <group
              position={[0, 1.5, 0]}
              ref={(el: any) => (labelRefs.current[node.id] = el)}
            >
              <mesh position={[0, 0.061, 0]} renderOrder={9998}>
                <planeGeometry args={[1.68, 0.76]} />
                <meshBasicMaterial
                  color={moistureToColor(node.moisture)}
                  transparent
                  opacity={0.14}
                  depthTest={false}
                  depthWrite={false}
                />
              </mesh>

              <mesh position={[0, 0.06, 0]} renderOrder={9998}>
                <planeGeometry args={[1.6, 0.7]} />
                <meshBasicMaterial
                  color={"#132028"}
                  transparent
                  opacity={0.96}
                  depthTest={false}
                  depthWrite={false}
                />
              </mesh>

              <group position={[0, 0.06, 0.03]} renderOrder={9999}>
                <TroikaTextMesh
                  text={`${node.id}\nNem: ${node.moisture}%`}
                  color={"#ffffff"}
                  fontSize={0.095}
                  maxWidth={1.4}
                />
              </group>

              <mesh position={[0, -0.38, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <coneGeometry args={[0.07, 0.12, 4]} />
                <meshBasicMaterial color={"#0b1620"} />
              </mesh>
            </group>
          )}
        </group>
      ))}
    </group>
  );
}
