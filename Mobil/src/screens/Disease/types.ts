import { Theme } from "../../types";
import type { LocalInferenceResult } from "../../utils/diseaseInference";
import type { LeafBox } from "../../utils/leafDetection";
export type { LocalInferenceResult, LeafBox };

export interface DiseaseScreenProps {
  theme: Theme;
  hasCameraPermission: boolean;
  onRequestPermission: () => Promise<boolean>;
  onSendForAnalysis?: (uri: string, folderId?: string | null) => void;
  isActive?: boolean;
  onClose?: () => void;
  /** Kamera folder modunda acildiysa; null = general detection */
  folderContext?: { folderId: string; folderName: string } | null;
}

export interface PhotoPreviewProps {
  theme: Theme;
  photoUri: string;
  onCancel: () => void;
  onSend: () => void;
  localResult?: LocalInferenceResult | null;
  /** Yaprak cascade aktifken son live frame'de tespit edilen kutu (debug overlay) */
  leafBox?: LeafBox | null;
}
