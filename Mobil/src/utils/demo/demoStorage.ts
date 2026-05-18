// Demo modu icin AsyncStorage tabanli yerel CRUD (detection/folder/chat/carbon).
// Shape api.ts tipleriyle birebir; seedIfEmpty bir kere tohumlar, clearAll logout'ta.
// Goruntu dosyalari documentDirectory/disease/{detectionId}.jpg (imageCache ile ayni).

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File, Paths } from "expo-file-system";
import type {
  DiseaseDetection,
  DiseaseTarget,
  DiseaseTrackingFolder,
  DiseaseTrackingFolderDetail,
  FolderDetectionSummary,
  UserFeedback,
  DiseaseCorrection,
  FieldSummary,
  BilingualRecommendations,
} from "../api";
import type { CarbonLog } from "../../screens/CarbonFootprint/types";

const KEY_DETECTIONS = "@taras/demo_detections_v1";
const KEY_FOLDERS = "@taras/demo_folders_v1";
const KEY_CHAT_SESSIONS = "@taras/demo_chat_sessions_v1";
const KEY_CARBON_LOGS = "@taras/demo_carbon_logs_v1";
const KEY_SEEDED = "@taras/demo_seeded_v1";

async function loadJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch (err) {
    console.log("[DEMO_STORE] load err:", key, err);
    return fallback;
  }
}

async function saveJson<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.log("[DEMO_STORE] save err:", key, err);
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function rid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export async function listDetections(): Promise<DiseaseDetection[]> {
  return loadJson<DiseaseDetection[]>(KEY_DETECTIONS, []);
}

export async function getDetection(
  detectionId: string,
): Promise<DiseaseDetection | null> {
  const list = await listDetections();
  return list.find((d) => d.detection_id === detectionId) ?? null;
}

export async function upsertDetection(
  detection: DiseaseDetection,
): Promise<void> {
  const list = await listDetections();
  const idx = list.findIndex((d) => d.detection_id === detection.detection_id);
  if (idx >= 0) {
    list[idx] = detection;
  } else {
    list.unshift(detection);
  }
  await saveJson(KEY_DETECTIONS, list);
}

export async function deleteDetection(detectionId: string): Promise<void> {
  const list = await listDetections();
  const filtered = list.filter((d) => d.detection_id !== detectionId);
  if (filtered.length === list.length) return;
  await saveJson(KEY_DETECTIONS, filtered);

  // Ilgili klasorlerden de sil
  const folders = await listFolders();
  let mutated = false;
  for (const folder of folders) {
    const before = folder.detections.length;
    folder.detections = folder.detections.filter(
      (d) => d.detection_id !== detectionId,
    );
    if (folder.detections.length !== before) mutated = true;
  }
  if (mutated) await saveJson(KEY_FOLDERS, folders);

  // Yerel goruntu dosyasini sil (best-effort)
  try {
    const f = new File(Paths.document, "disease", `${detectionId}.jpg`);
    if (f.exists) f.delete();
  } catch {
    // sessiz
  }
}

// ── Folder CRUD ──────────────────────────────────────────────────────────

export async function listFolders(): Promise<DiseaseTrackingFolder[]> {
  return loadJson<DiseaseTrackingFolder[]>(KEY_FOLDERS, []);
}

export async function getFolder(
  folderId: string,
): Promise<DiseaseTrackingFolder | null> {
  const list = await listFolders();
  return list.find((f) => f.folderId === folderId) ?? null;
}

export async function upsertFolder(
  folder: DiseaseTrackingFolder,
): Promise<void> {
  const list = await listFolders();
  const idx = list.findIndex((f) => f.folderId === folder.folderId);
  if (idx >= 0) {
    list[idx] = folder;
  } else {
    list.unshift(folder);
  }
  await saveJson(KEY_FOLDERS, list);
}

export async function deactivateFolder(folderId: string): Promise<void> {
  const folder = await getFolder(folderId);
  if (!folder) return;
  folder.isActive = false;
  folder.updatedAt = nowIso();
  await upsertFolder(folder);
}

/** Yeni klasor olustur — demo zone listesinden plant bilgisi gerekir. */
export async function createFolder(args: {
  zoneId: string;
  zoneName: string;
  cropName: string;
  name: string;
}): Promise<DiseaseTrackingFolder> {
  const folder: DiseaseTrackingFolder = {
    folderId: rid("demo-fld"),
    name: args.name,
    isActive: true,
    targetDisease: "UNCERTAIN" as DiseaseTarget,
    lastDetectionAt: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    planting: {
      plantingId: `demo-plt-${args.zoneId}`,
      isActive: true,
      plantingDate: nowIso(),
      growthStage: "vegetative",
      cropName: args.cropName,
      zoneId: args.zoneId,
      zoneName: args.zoneName,
    },
    detections: [],
  };
  await upsertFolder(folder);
  return folder;
}

/** Detection bir klasore baglandiginda klasor ozetini guncelle. */
export async function attachDetectionToFolder(
  folderId: string,
  detection: DiseaseDetection,
): Promise<void> {
  const folder = await getFolder(folderId);
  if (!folder) return;

  const summary: FolderDetectionSummary = {
    detection_id: detection.detection_id,
    image_uuid: detection.image_uuid,
    status: detection.status,
    uploaded_at: detection.uploaded_at,
    completed_at: detection.completed_at,
    detected_disease: detection.detected_disease,
    confidence: detection.confidence,
    confidence_score: detection.confidence_score,
    error_message: detection.error_message,
    imageUrl: detection.imageUrl ?? null,
  };

  // Mevcut tespit varsa guncelle, yoksa basa ekle
  const idx = folder.detections.findIndex(
    (d) => d.detection_id === detection.detection_id,
  );
  if (idx >= 0) {
    folder.detections[idx] = summary;
  } else {
    folder.detections.unshift(summary);
  }

  if (detection.status === "COMPLETED") {
    folder.lastDetectionAt = detection.completed_at ?? nowIso();
  }
  folder.updatedAt = nowIso();
  await upsertFolder(folder);
}

/** Feedback kaydet — DEFINITELY_CORRECT olunca klasorun target_disease'i UNCERTAIN'den
 *  detection'in class'ina otomatik geciyor (gercek backend ile ayni davranis). */
export async function applyFeedback(
  detectionId: string,
  feedback: UserFeedback,
  correction?: DiseaseCorrection | null,
): Promise<void> {
  const detection = await getDetection(detectionId);
  if (!detection) return;

  detection.user_feedback = feedback;
  detection.feedback_at = nowIso();
  detection.user_correction = correction ?? null;
  await upsertDetection(detection);

  // Klasore bagli mi? Target disease'i auto-update et
  if (
    feedback === "DEFINITELY_CORRECT" &&
    detection.detected_disease &&
    detection.detected_disease !== "UNCERTAIN" &&
    detection.detected_disease !== "OTHER"
  ) {
    const folders = await listFolders();
    for (const folder of folders) {
      const inFolder = folder.detections.some(
        (d) => d.detection_id === detectionId,
      );
      if (!inFolder) continue;
      if (folder.targetDisease !== "UNCERTAIN") continue;

      folder.targetDisease = detection.detected_disease;
      folder.updatedAt = nowIso();
      await upsertFolder(folder);
      break;
    }
  }
}

/** Disease label (lowercase snake) → DiseaseTarget enum (UPPERCASE_SNAKE). */
export function mapDiseaseLabelToTarget(
  label: string | null | undefined,
): DiseaseTarget | null {
  if (!label) return null;
  const upper = label.toUpperCase().replace(/\s+/g, "_") as DiseaseTarget;
  const known: DiseaseTarget[] = [
    "UNCERTAIN",
    "BACTERIAL_SPOT",
    "CORN_COMMON_RUST",
    "CORN_GRAY_LEAF_SPOT",
    "CORN_NORTHERN_LEAF_BLIGHT",
    "EARLY_BLIGHT",
    "HEALTHY",
    "LATE_BLIGHT",
    "LEAF_MOLD",
    "MOSAIC_VIRUS",
    "POWDERY_MILDEW",
    "SEPTORIA_LEAF_SPOT",
    "SPIDER_MITES",
    "TARGET_SPOT",
    "YELLOW_LEAF_CURL_VIRUS",
    "OTHER",
  ];
  return known.includes(upper) ? upper : null;
}

/** Detail shape — folder + detection summaries (demo'da summary == detail). */
export async function getFolderDetail(
  folderId: string,
): Promise<DiseaseTrackingFolderDetail | null> {
  const folder = await getFolder(folderId);
  if (!folder) return null;

  // Detail shape detection list'in all_predictions + recommendations icermesi
  // gerekiyor. Tam detection kayitlari demoStorage'da var, oradan alalim
  const allDetections = await listDetections();
  const detectionMap = new Map(
    allDetections.map((d) => [d.detection_id, d]),
  );
  const detections = folder.detections.map((s) => {
    const full = detectionMap.get(s.detection_id);
    return {
      ...s,
      all_predictions: full?.all_predictions ?? null,
      recommendations: full?.recommendations ?? null,
    };
  });

  return { ...folder, detections };
}

// ── Chat session (per fieldId) ───────────────────────────────────────────

export interface DemoChatMessage {
  id: string;
  text: string;
  sender: "user" | "assistant";
  timestamp: string;
}

export interface DemoChatSession {
  session_id: string;
  field_id: string;
  field_name: string;
  started_at: string;
  last_message_at: string | null;
  messages: DemoChatMessage[];
}

interface ChatStore {
  // fieldId → session_id (en son aktif olan)
  activeByField: Record<string, string>;
  // session_id → session
  sessions: Record<string, DemoChatSession>;
}

async function loadChatStore(): Promise<ChatStore> {
  return loadJson<ChatStore>(KEY_CHAT_SESSIONS, {
    activeByField: {},
    sessions: {},
  });
}

async function saveChatStore(store: ChatStore): Promise<void> {
  await saveJson(KEY_CHAT_SESSIONS, store);
}

export async function getActiveSessionForField(
  fieldId: string,
  fieldName: string,
): Promise<DemoChatSession | null> {
  const store = await loadChatStore();
  const sid = store.activeByField[fieldId];
  if (!sid) return null;
  const session = store.sessions[sid];
  if (!session) return null;
  // Field name guncel kalsin
  if (session.field_name !== fieldName) {
    session.field_name = fieldName;
    await saveChatStore(store);
  }
  return session;
}

export async function getSessionById(
  sessionId: string,
): Promise<DemoChatSession | null> {
  const store = await loadChatStore();
  return store.sessions[sessionId] ?? null;
}

export async function appendMessages(
  fieldId: string,
  fieldName: string,
  messages: DemoChatMessage[],
): Promise<DemoChatSession> {
  const store = await loadChatStore();
  let sid = store.activeByField[fieldId];
  let session = sid ? store.sessions[sid] : null;
  if (!session) {
    sid = rid("demo-sess");
    session = {
      session_id: sid,
      field_id: fieldId,
      field_name: fieldName,
      started_at: nowIso(),
      last_message_at: null,
      messages: [],
    };
    store.activeByField[fieldId] = sid;
  }
  session.messages.push(...messages);
  session.last_message_at = nowIso();
  store.sessions[sid] = session;
  await saveChatStore(store);
  return session;
}

export async function listSessionSummaries(): Promise<
  Array<{
    session_id: string;
    field_name: string;
    started_at: string;
    last_message: string;
    last_message_at: string | null;
  }>
> {
  const store = await loadChatStore();
  return Object.values(store.sessions)
    .map((s) => ({
      session_id: s.session_id,
      field_name: s.field_name,
      started_at: s.started_at,
      last_message:
        s.messages[s.messages.length - 1]?.text.slice(0, 80) ?? "",
      last_message_at: s.last_message_at,
    }))
    .sort((a, b) => {
      const ta = a.last_message_at ? Date.parse(a.last_message_at) : 0;
      const tb = b.last_message_at ? Date.parse(b.last_message_at) : 0;
      return tb - ta;
    });
}

export async function startNewSession(
  fieldId: string,
): Promise<void> {
  const store = await loadChatStore();
  delete store.activeByField[fieldId];
  await saveChatStore(store);
}

// ── Carbon logs (in-memory backed) ───────────────────────────────────────

export async function listCarbonLogs(): Promise<CarbonLog[]> {
  return loadJson<CarbonLog[]>(KEY_CARBON_LOGS, []);
}

export async function addCarbonLog(log: CarbonLog): Promise<void> {
  const list = await listCarbonLogs();
  list.unshift(log);
  await saveJson(KEY_CARBON_LOGS, list);
}

export async function deleteCarbonLog(logId: string): Promise<void> {
  const list = await listCarbonLogs();
  const filtered = list.filter((l) => l.carbon_log_id !== logId);
  await saveJson(KEY_CARBON_LOGS, filtered);
}

// ── Seeder ────────────────────────────────────────────────────────────────

/** Ilk demo girisinde bir kez calisir — en az 1 klasor + 2-3 tespit ile baslat. */
export async function seedIfEmpty(fields: FieldSummary[]): Promise<void> {
  const seeded = await AsyncStorage.getItem(KEY_SEEDED);
  if (seeded === "1") return;

  console.log("[DEMO_STORE] seeding initial data");

  // Goruntu dizinini olustur
  try {
    const dir = new Directory(Paths.document, "disease");
    if (!dir.exists) dir.create({ intermediates: true });
  } catch {
    // sessiz
  }

  // Ilk demo field icin bir klasor + 3 tespit
  const primary = fields[0];
  if (primary) {
    const folder = await createFolder({
      zoneId: `demo-zone-${primary.id}`,
      zoneName: "Bölge 1",
      cropName: "Domates",
      name: `${primary.name} — Hastalık Takibi`,
    });

    const samples: Array<{
      label: string;
      conf: number;
      hours_ago: number;
    }> = [
      { label: "early_blight", conf: 0.84, hours_ago: 36 },
      { label: "early_blight", conf: 0.79, hours_ago: 24 },
      { label: "healthy", conf: 0.91, hours_ago: 6 },
    ];

    for (const sample of samples) {
      const uploadedAt = new Date(
        Date.now() - sample.hours_ago * 3600 * 1000,
      ).toISOString();
      const det: DiseaseDetection = {
        detection_id: rid("demo-det"),
        user_id: "0",
        image_uuid: rid("demo-img"),
        image_s3_key: "demo://seeded",
        status: "COMPLETED",
        uploaded_at: uploadedAt,
        processing_started_at: uploadedAt,
        completed_at: uploadedAt,
        detected_disease: mapDiseaseLabelToTarget(sample.label) ?? "OTHER",
        confidence: sample.conf,
        confidence_score: sample.conf,
        all_predictions: buildSyntheticAllPreds(sample.label, sample.conf),
        recommendations: recommendationsFor(sample.label),
        error_message: null,
        imageUrl: null,
        confidence_status: sample.conf >= 0.7 ? "confident" : "uncertain",
        top_guess: sample.label,
      };
      await upsertDetection(det);
      await attachDetectionToFolder(folder.folderId, det);
    }

    // Ilk klasorun target_disease'ini auto-set — attachDetectionToFolder
    // disk'teki kayidi guncelledigi icin local `folder` referansi stale;
    // tekrar oku yoksa attachDetection ekledigimiz tespitler kaybolur
    const fresh = await getFolder(folder.folderId);
    if (fresh) {
      fresh.targetDisease = "EARLY_BLIGHT";
      fresh.updatedAt = nowIso();
      await upsertFolder(fresh);
    }
  }

  await AsyncStorage.setItem(KEY_SEEDED, "1");
}

// 14 sinifi normalize edilmis sahte logits — top class'a ana confidence,
// kalan 0.5'lik bir kismi healthy ve diger 2-3 sinif arasinda dagit
function buildSyntheticAllPreds(
  topLabel: string,
  topConf: number,
): Record<string, number> {
  const classes = [
    "bacterial_spot",
    "corn_common_rust",
    "corn_gray_leaf_spot",
    "corn_northern_leaf_blight",
    "early_blight",
    "healthy",
    "late_blight",
    "leaf_mold",
    "mosaic_virus",
    "powdery_mildew",
    "septoria_leaf_spot",
    "spider_mites",
    "target_spot",
    "yellow_leaf_curl_virus",
  ];
  const result: Record<string, number> = {};
  const remainder = Math.max(0, 1 - topConf);
  let restSum = 0;
  for (const c of classes) {
    if (c === topLabel) continue;
    // Class hash'inden seedlenmis pseudorandom (tutarli olsun diye)
    const r = (c.charCodeAt(0) * 31 + c.length * 7) % 100;
    result[c] = r / 100;
    restSum += result[c];
  }
  // Normalize ki sum == remainder olsun
  if (restSum > 0) {
    for (const c of classes) {
      if (c === topLabel) continue;
      result[c] = (result[c] / restSum) * remainder;
    }
  }
  result[topLabel] = topConf;
  return result;
}

export function recommendationsFor(label: string | null): BilingualRecommendations {
  switch (label) {
    case "healthy":
      return {
        tr: ["Yapraklar saglikli görünüyor.", "Sulama programını koruyun."],
        en: ["The leaves look healthy.", "Keep your watering schedule."],
      };
    case "early_blight":
      return {
        tr: [
          "Etkilenen yaprakları toplayıp imha edin.",
          "Bakır esaslı fungisit uygulamasını değerlendirin.",
          "Bitkilerin altından sulayın, yaprakları ıslatmayın.",
        ],
        en: [
          "Collect and destroy affected leaves.",
          "Consider applying a copper-based fungicide.",
          "Water from below; do not wet the leaves.",
        ],
      };
    case "late_blight":
      return {
        tr: [
          "Yayılım hızlı — etkilenen bitkileri hemen izole edin.",
          "Mancozeb veya bakır oksiklorür uygulayın.",
          "Hava akımını arttırmak için bitkileri seyreltin.",
        ],
        en: [
          "Spread is fast — isolate affected plants immediately.",
          "Apply mancozeb or copper oxychloride.",
          "Thin plants out to improve air circulation.",
        ],
      };
    case "bacterial_spot":
      return {
        tr: [
          "Bakır spreyi ile bakteriyel yayılımı yavaşlatın.",
          "Sulama sırasında yapraklara su değdirmeyin.",
        ],
        en: [
          "Use a copper spray to slow bacterial spread.",
          "Avoid wetting leaves when watering.",
        ],
      };
    case "powdery_mildew":
      return {
        tr: [
          "Sulu sodyum bikarbonat (1 L su + 1 yk) uygulaması yardımcı olur.",
          "Bitkiler arasında 30+ cm boşluk bırakın.",
        ],
        en: [
          "A diluted sodium bicarbonate spray (1 L water + 1 tbsp) can help.",
          "Leave 30+ cm of space between plants.",
        ],
      };
    case "leaf_mold":
      return {
        tr: [
          "Sera havalandırmasını artırın, nemi %75 altına indirin.",
          "Tutulmus hava cepleri olusmasin diye seyreltme yapin.",
        ],
        en: [
          "Increase greenhouse ventilation; keep humidity below 75%.",
          "Thin plants out so stagnant air pockets don't form.",
        ],
      };
    default:
      return {
        tr: [
          "Bir tarım uzmanına başvurun.",
          "Yayılımı takip etmek için 2-3 günde bir yeni fotoğraf çekin.",
        ],
        en: [
          "Consult an agriculture specialist.",
          "Take a new photo every 2–3 days to track progression.",
        ],
      };
  }
}

// ── Clear all (logout temizligi) ─────────────────────────────────────────

export async function clearAll(): Promise<void> {
  await AsyncStorage.multiRemove([
    KEY_DETECTIONS,
    KEY_FOLDERS,
    KEY_CHAT_SESSIONS,
    KEY_CARBON_LOGS,
    KEY_SEEDED,
  ]);

  // Yerel goruntu dosyalarini da temizle
  try {
    const dir = new Directory(Paths.document, "disease");
    if (dir.exists) dir.delete();
  } catch {
    // sessiz
  }
  console.log("[DEMO_STORE] cleared");
}
