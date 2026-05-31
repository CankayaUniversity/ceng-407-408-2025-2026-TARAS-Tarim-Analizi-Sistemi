import { DiseaseTarget } from "../generated/prisma";

const RAW_TO_TARGET: Record<string, DiseaseTarget> = {
  bacterial_spot: "BACTERIAL_SPOT",
  corn_common_rust: "CORN_COMMON_RUST",
  corn_gray_leaf_spot: "CORN_GRAY_LEAF_SPOT",
  corn_northern_leaf_blight: "CORN_NORTHERN_LEAF_BLIGHT",
  early_blight: "EARLY_BLIGHT",
  healthy: "HEALTHY",
  late_blight: "LATE_BLIGHT",
  leaf_mold: "LEAF_MOLD",
  mosaic_virus: "MOSAIC_VIRUS",
  powdery_mildew: "POWDERY_MILDEW",
  septoria_leaf_spot: "SEPTORIA_LEAF_SPOT",
  spider_mites: "SPIDER_MITES",
  target_spot: "TARGET_SPOT",
  yellow_leaf_curl_virus: "YELLOW_LEAF_CURL_VIRUS",
  uncertain: "UNCERTAIN",
};

export function detectedDiseaseToTarget(s: string | null | undefined): DiseaseTarget | null {
  if (!s) return null;
  return RAW_TO_TARGET[s] ?? "OTHER";
}

export function diseaseTargetToKey(target: DiseaseTarget): string {
  return target.toLowerCase();
}
