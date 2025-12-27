import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber/native';

const LIGHT_COLORS = ['#531638', '#0891b2', '#0e7490', '#06b6d4', '#0891b2', '#0e7490'];
const DARK_COLORS = ['#06b6d4', '#00d9ff', '#20c997', '#06b6d4', '#00d9ff', '#8c526b'];

const INITIAL_ROTATION_Y = Math.PI / 4;
const MIN_TILT = 0;
const MAX_TILT = Math.PI / 4;
const ROTATION_SCALE = 0.003;
const ROTATION_INTERPOLATION = 0.25;
const X_VELOCITY_DAMPING = 0.85;
const Y_VELOCITY_DAMPING = 0.70;
const X_VELOCITY_MULTIPLIER = 1.0;
const Y_VELOCITY_MULTIPLIER = 1.4;
const TAP_DURATION_MS = 200;
const TAP_DISTANCE_THRESHOLD = 15;

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

  const [colorIndex, setColorIndex] = useState(0);

  useFrame(({ gl }) => {
    if (!groupRef.current) return;
    initializeRotation();
    updateRotation();
    applyMomentum();
    attachPointerListeners(gl);
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
    const dragDuration = Date.now() - dragStartTimeRef.current;
    const totalDragDistance = dragDistanceRef.current.x + dragDistanceRef.current.y;

    if (dragDuration < TAP_DURATION_MS && totalDragDistance < TAP_DISTANCE_THRESHOLD) {
      setColorIndex((prev) => (prev + 1) % COLORS.length);
    }

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

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      <mesh ref={meshRef} position={[0, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[8, 1.5, 8]} />
        <meshStandardMaterial
          color={currentColor}
          metalness={0.4}
          roughness={0.3}
          emissive={currentColor}
          emissiveIntensity={0.2}
          side={2}
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
    </group>
  );
}
