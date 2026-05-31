// Paylasilan demo hesabi icin SUNUCU-tarafi salt-okunur kilit.
//
// Amac: herkesin test ettigi paylasilan hesabin (orn. llm_test) baskalari tarafindan
// degistirilip demo'nun bozulmasini (griefing) onlemek. Mobil tarafta da butonlar gizli
// + authFetch yazmalari engelliyor, ama o yalnizca istemci; bu katman crafted istekleri
// ve LLM/asistan yazmalarini da kapsayan gercek guvenlik dayanagidir.
//
// Eslesme user_id ILE yapilir (kullanici adi degisse bile kilit korunur).
// DEMO_READONLY_USER_ID .env'de TANIMSIZSA kilit tamamen NO-OP'tur — normal uretim
// kurulumlarini ve gercek kullanicilari hicbir sekilde etkilemez.
import { Request, Response } from "express";

// Kilitlenecek demo kullanicisinin user_id'si (.env). Bos => kilit devre disi.
export const DEMO_READONLY_USER_ID = process.env.DEMO_READONLY_USER_ID || "";
export const DEMO_READONLY_ENABLED = DEMO_READONLY_USER_ID.length > 0;

// Yazma yapmayan (her zaman serbest) HTTP metodlari.
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Demo kullanicinin yine de calistirabilecegi mutasyon yollari (suffix eslesme):
//  - /disease/submit              : hastalik taramasi (flagship — kullanici talebi: calismaya devam)
//  - /advisory, /advisory/stream  : LLM yanit verir; ANCAK controller kalici kaydi (session +
//    mesaj) atlar, yani paylasilan hesaba sohbet birikmez (bkz. advisory.controller).
const ALLOWED_MUTATION_SUFFIXES = [
  "/disease/submit",
  "/advisory",
  "/advisory/stream",
];

// Istek (kilitli) demo kullanicisina mi ait? Controller'lar kalici yazmayi atlamak icin kullanir.
export function isDemoReadonlyUser(userId: string | undefined | null): boolean {
  return DEMO_READONLY_ENABLED && !!userId && userId === DEMO_READONLY_USER_ID;
}

// Bu istek bir yazma denemesi olarak engellenmeli mi?
// Kosul: kilit aktif + istek demo user'a ait + guvensiz metod + izin listesinde DEGIL.
export function shouldBlockDemoWrite(req: Request): boolean {
  if (!isDemoReadonlyUser(req.user?.user_id)) return false;
  if (SAFE_METHODS.has((req.method || "GET").toUpperCase())) return false;
  const path = (req.originalUrl || req.url || "").split("?")[0] ?? "";
  if (ALLOWED_MUTATION_SUFFIXES.some((s) => path.endsWith(s))) return false;
  return true;
}

// authMiddleware icinden req.user set edildikten SONRA cagrilir.
// Engellenmesi gerekiyorsa 403 yazip true doner (cagiran next() cagirmamali).
export function enforceDemoReadonly(req: Request, res: Response): boolean {
  if (shouldBlockDemoWrite(req)) {
    res.status(403).json({
      success: false,
      error: "Demo hesabı salt görüntüleme modundadır; bu işlem devre dışı.",
    });
    return true;
  }
  return false;
}
