import { Theme } from "../../types";
import type { LocalInferenceResult } from "../../utils/diseaseInference";
export type { LocalInferenceResult };

/** Demo modunda submitDetection'a tasinan ipuclari (uretim akisinda yok). */
export interface DiseaseSubmissionExtras {
  hintedLabel?: string | null;
  liveScanResult?: {
    className?: string;
    confidence?: number;
    allProbs?: Record<string, number>;
    timestamp?: number;
  } | null;
}

export interface DiseaseScreenProps {
  theme: Theme;
  hasCameraPermission: boolean;
  onRequestPermission: () => Promise<boolean>;
  onSendForAnalysis?: (
    uri: string,
    folderId?: string | null,
    extras?: DiseaseSubmissionExtras,
  ) => void;
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
  /** Klasor moduna aitse banner gosterilir; null = general */
  folderContext?: { folderId: string; folderName: string } | null;
}
