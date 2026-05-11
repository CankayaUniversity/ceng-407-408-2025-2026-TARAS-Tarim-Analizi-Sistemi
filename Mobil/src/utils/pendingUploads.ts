// Backend'e yuklenemeyen goruntuleri yerel diske kuyrukla — kullanici retry edebilir.
// Documents/disease_pending/{pendingId}.jpg + {pendingId}.json (metadata).

import { Directory, File, Paths } from "expo-file-system";
import { compressForLocalCache } from "./diseaseImageProcessing";

const DIR_NAME = "disease_pending";

const getDir = (): Directory => new Directory(Paths.document, DIR_NAME);
const getImageFile = (pendingId: string): File =>
  new File(getDir(), `${pendingId}.jpg`);
const getMetaFile = (pendingId: string): File =>
  new File(getDir(), `${pendingId}.json`);

export interface PendingUpload {
  pendingId: string;
  imageUri: string;
  folderId: string | null;
  /** Demo modu icin live-scan ipucu (uretim akisinda yok) */
  hintedLabel: string | null;
  liveScanResult: unknown | null;
  createdAt: string;
  lastError?: string | null;
}

interface StoredMeta {
  pendingId: string;
  folderId: string | null;
  hintedLabel: string | null;
  liveScanResult: unknown | null;
  createdAt: string;
  lastError?: string | null;
}

const ensureDir = async (): Promise<void> => {
  const dir = getDir();
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
};

const newPendingId = (): string =>
  `pending-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Compress edip yerel kopya yazar; kaynak silinse bile retry calisir. */
export const enqueuePending = async (input: {
  imageUri: string;
  folderId: string | null;
  hintedLabel?: string | null;
  liveScanResult?: unknown | null;
  errorReason?: string | null;
}): Promise<PendingUpload> => {
  await ensureDir();
  const pendingId = newPendingId();
  const targetImg = getImageFile(pendingId);
  const targetMeta = getMetaFile(pendingId);

  const compressedUri = await compressForLocalCache(input.imageUri);
  const src = new File(compressedUri);
  src.copy(targetImg);

  const meta: StoredMeta = {
    pendingId,
    folderId: input.folderId,
    hintedLabel: input.hintedLabel ?? null,
    liveScanResult: input.liveScanResult ?? null,
    createdAt: new Date().toISOString(),
    lastError: input.errorReason ?? null,
  };
  targetMeta.write(JSON.stringify(meta));

  const sizeKB = ((targetImg.size ?? 0) / 1024).toFixed(0);
  console.log(
    "[PENDING] enqueue:", pendingId.slice(0, 18),
    `(${sizeKB}KB)`,
    "folder:", input.folderId?.slice(0, 8) ?? "(general)",
  );
  return { ...meta, imageUri: targetImg.uri };
};

// En yeni en ustte
export const listPending = async (): Promise<PendingUpload[]> => {
  await ensureDir();
  const out: PendingUpload[] = [];
  for (const entry of getDir().list()) {
    if (!(entry instanceof File)) continue;
    if (!entry.name.endsWith(".json")) continue;
    try {
      const text = await entry.text();
      const meta = JSON.parse(text) as StoredMeta;
      const img = getImageFile(meta.pendingId);
      if (!img.exists) continue;
      out.push({ ...meta, imageUri: img.uri });
    } catch (err) {
      console.log("[PENDING] read fail:", entry.name, String(err));
    }
  }
  out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return out;
};

export const updatePendingError = async (
  pendingId: string,
  errorReason: string,
): Promise<void> => {
  await ensureDir();
  const metaFile = getMetaFile(pendingId);
  if (!metaFile.exists) return;
  try {
    const meta = JSON.parse(await metaFile.text()) as StoredMeta;
    meta.lastError = errorReason;
    metaFile.write(JSON.stringify(meta));
  } catch (err) {
    console.log("[PENDING] update fail:", pendingId.slice(0, 18), String(err));
  }
};

export const removePending = async (pendingId: string): Promise<void> => {
  await ensureDir();
  try {
    const img = getImageFile(pendingId);
    const meta = getMetaFile(pendingId);
    if (img.exists) img.delete();
    if (meta.exists) meta.delete();
    console.log("[PENDING] removed:", pendingId.slice(0, 18));
  } catch (err) {
    console.log("[PENDING] delete fail:", pendingId.slice(0, 18), String(err));
  }
};
