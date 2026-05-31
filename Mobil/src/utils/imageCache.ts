// Hastalik tespit resimleri icin kalici disk cache.
// Dosyalar document dizininde saklanir, detection_id ile indekslenir.
// Indirme sonrasi compressForLocalCache ile display-quality versiyon kaydedilir.

import { Directory, File, Paths } from "expo-file-system";
import { compressForLocalCache } from "./diseaseImageProcessing";

const DIR_NAME = "disease";

const getDir = (): Directory => new Directory(Paths.document, DIR_NAME);

const getFile = (detectionId: string): File =>
  new File(getDir(), `${detectionId}.jpg`);

const getTempFile = (detectionId: string): File =>
  new File(getDir(), `${detectionId}.tmp.jpg`);

export const ensureDir = async (): Promise<void> => {
  const dir = getDir();
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
};

export const hasLocal = async (detectionId: string): Promise<boolean> => {
  await ensureDir();
  return getFile(detectionId).exists;
};

export const resolveImage = async (
  detectionId: string,
  remoteUrl?: string | null,
): Promise<string | null> => {
  try {
    await ensureDir();
    const file = getFile(detectionId);

    if (file.exists) return file.uri;
    if (!remoteUrl) return null;

    const tempFile = getTempFile(detectionId);
    if (tempFile.exists) tempFile.delete();
    const downloaded = await File.downloadFileAsync(remoteUrl, tempFile, {
      idempotent: true,
    });

    const compressedUri = await compressForLocalCache(downloaded.uri);
    if (compressedUri !== downloaded.uri) {
      new File(compressedUri).copy(file);
    } else {
      tempFile.copy(file);
    }
    tempFile.delete();
    return file.uri;
  } catch (error) {
    console.log("[IMG] resolve fail:", detectionId, String(error));
    try {
      const tempFile = getTempFile(detectionId);
      if (tempFile.exists) tempFile.delete();
    } catch { /* ignore */ }
    return null;
  }
};

// Yerel bir dosyayi (orn. kameradan cekilen gorsel) detection_id ile cache'e KOPYALA —
// indirme YOK. Kilitli demoda submitDetection bunu cagirir; boylece kullanici kendi
// taramasini cekince gorsel hemen yerelde olur ve liste/gorunum S3'e gitmeden calisir.
// Display-quality'ye sikistirir (resolveImage'in indirme sonrasi davranisiyla ayni).
export const saveLocalImage = async (
  detectionId: string,
  sourceUri: string,
): Promise<string | null> => {
  try {
    await ensureDir();
    const dest = getFile(detectionId);
    if (dest.exists) dest.delete();
    let srcUri = sourceUri;
    try {
      srcUri = await compressForLocalCache(sourceUri);
    } catch {
      // sikistirilamazsa orijinali kopyala
    }
    new File(srcUri).copy(dest);
    return dest.exists ? dest.uri : null;
  } catch (error) {
    console.log("[IMG] saveLocal fail:", detectionId, String(error));
    return null;
  }
};

export const deleteLocal = async (detectionId: string): Promise<void> => {
  try {
    await ensureDir();
    const file = getFile(detectionId);
    if (file.exists) file.delete();
  } catch (error) {
    console.log("[IMG] delete fail:", detectionId, String(error));
  }
};

export const listCachedIds = async (): Promise<string[]> => {
  try {
    await ensureDir();
    const entries = getDir().list();
    const ids: string[] = [];
    for (const entry of entries) {
      if (entry instanceof File) {
        const name = entry.name;
        const dot = name.lastIndexOf(".");
        ids.push(dot === -1 ? name : name.slice(0, dot));
      }
    }
    return ids;
  } catch (error) {
    console.log("[IMG] list fail:", String(error));
    return [];
  }
};

// Cross-device sync: keepIds disindaki yerel dosyalari sil.
// Sadece backend fetch basarili olduktan sonra cagrilmali.
export const reconcile = async (keepIds: Set<string>): Promise<number> => {
  const cached = await listCachedIds();
  let deleted = 0;
  for (const id of cached) {
    if (!keepIds.has(id)) {
      await deleteLocal(id);
      deleted++;
    }
  }
  if (deleted > 0) console.log("[IMG] reconcile:", deleted, "removed");
  return deleted;
};

// Yerel dosya URI'sini hesapla (varlik kontrolu yapmaz).
export const localPath = (detectionId: string): string =>
  getFile(detectionId).uri;
