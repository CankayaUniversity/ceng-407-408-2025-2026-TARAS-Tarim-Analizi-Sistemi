// Hastalik tespit resimleri icin kalici disk cache
// Dosyalar document dizininde saklanir, detection_id ile indekslenir
// Downloadlar bir kez yapilir, S3 URL expiry onemsizdir

import { Directory, File, Paths } from "expo-file-system";

const DIR_NAME = "disease";

// Cache dizin referansi (lazy, Paths.document runtime'da cagrilir)
const getDir = (): Directory => new Directory(Paths.document, DIR_NAME);

// detection_id icin yerel File referansi (mevcut olsun olmasin)
const getFile = (detectionId: string): File =>
  new File(getDir(), `${detectionId}.jpg`);

// Dizini garanti et — idempotent
export const ensureDir = async (): Promise<void> => {
  const dir = getDir();
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
};

// detection_id icin yerel dosya var mi
export const hasLocal = async (detectionId: string): Promise<boolean> => {
  await ensureDir();
  return getFile(detectionId).exists;
};

// Bir detection icin kullanilacak URI'yi cozumle:
//   1. Yerel dosya varsa → file:// URI
//   2. remoteUrl verildiyse → indir, kaydet, yerel URI don
//   3. Aksi halde null
export const resolveImage = async (
  detectionId: string,
  remoteUrl?: string | null,
): Promise<string | null> => {
  try {
    await ensureDir();
    const file = getFile(detectionId);

    if (file.exists) return file.uri;

    if (!remoteUrl) return null;

    const downloaded = await File.downloadFileAsync(remoteUrl, file, {
      idempotent: true,
    });
    return downloaded.uri;
  } catch (error) {
    console.log("[IMG] resolve fail:", detectionId, String(error));
    return null;
  }
};

// Tek dosyayi sil — best effort, ENOENT yut
export const deleteLocal = async (detectionId: string): Promise<void> => {
  try {
    await ensureDir();
    const file = getFile(detectionId);
    if (file.exists) file.delete();
  } catch (error) {
    console.log("[IMG] delete fail:", detectionId, String(error));
  }
};

// Cache'deki tum detection_id'leri listele (uzantisiz)
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

// Cross-device sync: keepIds disindaki yerel dosyalari sil
// Sadece backend fetch basarili olduktan sonra cagrilmali
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

// Yerel dosya URI'sini hesapla — cache'den hydration icin (var olup olmadigini kontrol etmez)
export const localPath = (detectionId: string): string =>
  getFile(detectionId).uri;
