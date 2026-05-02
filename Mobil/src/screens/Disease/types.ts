import { Theme } from "../../types";
import type { LocalInferenceResult } from "../../utils/diseaseInference";
export type { LocalInferenceResult };

export interface DiseaseScreenProps {
  theme: Theme;
  hasCameraPermission: boolean;
  onRequestPermission: () => Promise<boolean>;
  onSendForAnalysis?: (uri: string) => void;
  isActive?: boolean;
  onClose?: () => void;
}

export interface PhotoPreviewProps {
  theme: Theme;
  photoUri: string;
  onCancel: () => void;
  onSend: () => void;
  localResult?: LocalInferenceResult | null;
}
