// 3D kamera kontrolu - pozisyon ve FOV ayarlar
// Props: config (kamera ayarlari)

import { useEffect } from "react";
import { useThree } from "@react-three/fiber/native";
import { CameraConfig } from "./types";

interface CameraControllerProps {
  config: CameraConfig;
}

export function CameraController({ config }: CameraControllerProps) {
  const { camera, invalidate } = useThree();

  useEffect(() => {
    camera.position.set(...config.position);
    (camera as any).fov = config.fov;
    (camera as any).updateProjectionMatrix();
    invalidate();
  }, [config, camera, invalidate]);

  return null;
}
