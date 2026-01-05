import { PermissionResponse } from "expo-camera";
import { Theme } from "../../types";

export interface DiseaseScreenProps {
  theme: Theme;
  permission: PermissionResponse | null;
  onRequestPermission: () => void;
  onSendForAnalysis?: (uri: string) => void;
  isActive?: boolean;
}

export interface CameraViewProps {
  theme: Theme;
  cameraRef: React.MutableRefObject<any>;
  flashOn: boolean;
  isActive: boolean;
  onPickFromGallery: () => void;
  onTakePicture: () => void;
  onToggleFlash: () => void;
}

export interface PhotoPreviewProps {
  theme: Theme;
  photoUri: string;
  onCancel: () => void;
  onSend: () => void;
}
