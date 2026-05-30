// Arac yurutme katmani — kapsam kontrolu, denetim loglama, sonuc siniri
import prisma from "../../config/database";
import logger from "../../utils/logger";
import { checkFieldAccess } from "../dashboardService";
import {
  checkFarmReadAccess,
  checkFarmAccess,
  previewCarbonLog,
  getActivityTypes,
} from "../carbonService";
import { getFieldContextForLLM } from "../tarasData.service";
import {
  getSensorNodesForZone,
  getReadingsInTimeRange,
  getZoneWithAdaptiveControl,
  getIrrigationHistory,
  getFieldSensorHistory,
} from "../sensorNodeService";
import { getFarmSummary } from "../carbonService";
import { searchKnowledge } from "./knowledgeBase.service";
import {
  SECTION_TARGETS,
  TIMETABLE_AGGREGATIONS,
  TIMETABLE_METRICS,
  TIMETABLE_VIEWS,
  type TimetableAggregation,
  type TimetableMetric,
  type TimetableView,
} from "./toolDefinitions";

const MAX_RESULT_CHARS = 8000;
const MAX_CALLS = 8;

interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

// set_timetable_filters tool'unun istemciye gonderdigi normalize edilmis yuk.
// Yalnizca degistirilecek alanlar bulunur; eksik alan "degistirme" anlamina gelir.
// zones: [] -> tum bolgeler, [...] -> secili bolgeler, undefined -> degistirme.
// range her zaman now'dan geriye dogru "rolling" — gun veya saat cinsinden.
export interface TimetableFilterPayload {
  range?: { days: number } | { hours: number };
  aggregation?: TimetableAggregation;
  metrics?: TimetableMetric[];
  zones?: string[];
  view?: TimetableView;
}

// Buton ile onaylanan eylemler — istemci mesaj altinda buton cizer, tap'te calisir.
// kind ile ayrilan discriminated union. add_carbon_log YAZMAZ; yalnizca onayli teklif tasir.
export type ChatAction =
  | { kind: "select_field"; field_id: string; field_name: string }
  | { kind: "set_theme"; mode: "light" | "dark" | "system" }
  | { kind: "set_language"; lang: "tr" | "en" }
  | {
      kind: "add_carbon_log";
      farm_id: string;
      activity_type_id: number;
      activity_type_name: string;
      unit: string;
      activity_date: string;
      activity_amount: number;
      estimated_emission: number;
      notes?: string;
    };

// Zone ID'den field ID'ye cozumleme (kapsam kontrolu icin)
async function getFieldIdForZone(zoneId: string): Promise<string | null> {
  const zone = await prisma.zone.findUnique({
    where: { zone_id: zoneId },
    select: { field_id: true },
  });
  return zone?.field_id ?? null;
}

// Node ID'den field ID'ye cozumleme
async function getFieldIdForNode(nodeId: string): Promise<string | null> {
  const node = await prisma.sensorNode.findUnique({
    where: { node_id: nodeId },
    select: { zone: { select: { field_id: true } } },
  });
  return node?.zone?.field_id ?? null;
}

// Field ID'den farm_id + isim cozumleme (carbon kapsam kontrolu + select_field icin).
// farm_id semada nullable — cagiranlar carbon icin null'u reddeder.
async function getFieldInfo(
  fieldId: string,
): Promise<{ farm_id: string | null; name: string } | null> {
  const field = await prisma.field.findUnique({
    where: { field_id: fieldId },
    select: { farm_id: true, name: true },
  });
  return field ?? null;
}

// Sonucu JSON string olarak sinirla
function capResult(data: unknown): string {
  let json = JSON.stringify(data, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value,
  );
  if (json.length > MAX_RESULT_CHARS) {
    json = json.slice(0, MAX_RESULT_CHARS - 50) + '..."(sonuç kısaltıldı)"}';
  }
  return json;
}

// Gecmis verilerini 100 noktaya dusur
function downsampleReadings(
  readings: { sm_percent: number | null; temperature: number | null; humidity: number | null; created_at: Date }[],
  maxPoints: number = 100,
): typeof readings {
  if (readings.length <= maxPoints) return readings;
  const step = readings.length / maxPoints;
  const result: typeof readings = [];
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.min(Math.floor(i * step), readings.length - 1);
    result.push(readings[idx]!);
  }
  return result;
}

export class ToolExecutor {
  private readonly userId: string;
  public readonly fieldId: string;
  private callCount = 0;
  public onNavigate?: (
    screen: string,
    section: string | null,
    zoneId?: string,
  ) => void;
  // set_timetable_filters — istemciye normalize edilmis filtre yuku gonderir.
  public onSetFilters?: (filters: TimetableFilterPayload) => void;
  // Buton ile onaylanan eylemler (select_field / set_theme / set_language / add_carbon_log).
  // Istemci mesajin altinda buton cizer; kullanici basinca eylem calisir. kind ile ayrilir.
  public onAction?: (action: ChatAction) => void;

  constructor(userId: string, fieldId: string) {
    this.userId = userId;
    this.fieldId = fieldId;
  }

  async execute(
    toolName: string,
    toolInput: Record<string, unknown>,
  ): Promise<string> {
    this.callCount++;
    if (this.callCount > MAX_CALLS) {
      return JSON.stringify({ error: "Maksimum araç çağrısı limitine ulaşıldı" });
    }

    const start = Date.now();
    let result: ToolResult;

    try {
      result = await this.dispatch(toolName, toolInput);
    } catch (err) {
      logger.error(`[TOOL] hata: ${toolName}`, err);
      result = { success: false, error: "Araç çalıştırılırken hata oluştu" };
    }

    const duration = Date.now() - start;
    const output = result.success ? capResult(result.data) : JSON.stringify(result);

    logger.info(`[TOOL] ${toolName}`, {
      userId: this.userId,
      input: toolInput,
      duration: `${duration}ms`,
      resultSize: output.length,
      success: result.success,
    });

    return output;
  }

  private async dispatch(
    toolName: string,
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    switch (toolName) {
      case "navigate_to_section":
        return this.handleNavigateSection(
          input.target as string,
          input.reason as string,
        );

      case "highlight_zone":
        return this.handleHighlightZone(
          input.zone_id as string,
          input.reason as string,
        );

      case "set_timetable_filters":
        return this.handleSetTimetableFilters(input);

      case "select_field":
        return this.handleSelectField(
          input.field_id as string,
          input.reason as string,
        );

      case "set_theme":
        return this.handleSetTheme(input.mode as string, input.reason as string);

      case "set_language":
        return this.handleSetLanguage(
          input.lang as string,
          input.reason as string,
        );

      case "add_carbon_log":
        return this.handleAddCarbonLog(
          input.activity_type_id as number,
          input.activity_amount as number,
          input.activity_date as string | undefined,
          input.notes as string | undefined,
        );

      case "get_activity_types":
        return this.handleGetActivityTypes();

      case "get_field_overview":
        return this.handleGetFieldOverview(input.field_id as string);

      case "get_zone_latest":
        return this.handleGetZoneLatest(input.zone_id as string);

      case "get_zone_history":
        return this.handleGetZoneHistory(
          input.zone_id as string,
          Math.min((input.hours as number) || 24, 72),
        );

      case "get_field_history":
        return this.handleGetFieldHistory(
          input.field_id as string,
          (input.days as number) || 7,
        );

      case "get_zone_details":
        return this.handleGetZoneDetails(input.zone_id as string);

      case "get_irrigation_history":
        return this.handleGetIrrigationHistory(
          input.zone_id as string,
          Math.min((input.limit as number) || 5, 20),
        );

      case "get_sensor_diagnostics":
        return this.handleGetSensorDiagnostics(input.node_id as string);

      case "get_carbon_summary":
        return this.handleGetCarbonSummary(
          input.farm_id as string,
          input.days as number | undefined,
        );

      case "get_disease_history":
        return this.handleGetDiseaseHistory(
          Math.min((input.limit as number) || 5, 10),
          (input.status as string) || "any",
        );

      case "get_active_alerts":
        return this.handleGetActiveAlerts(
          Math.min((input.limit as number) || 10, 20),
          (input.severity as string) || "any",
        );

      case "search_knowledge":
        return this.handleSearchKnowledge(
          input.query as string,
          Math.min((input.limit as number) || 3, 5),
        );

      default:
        return { success: false, error: `Bilinmeyen araç: ${toolName}` };
    }
  }

  // --- Arac isleyicileri ---

  private async handleNavigateSection(
    target: string,
    reason: string,
  ): Promise<ToolResult> {
    // Hedef SECTION_TARGETS icinde olmali
    if (!SECTION_TARGETS.includes(target as (typeof SECTION_TARGETS)[number])) {
      return { success: false, error: `Geçersiz hedef: ${target}` };
    }
    const [screen, section] = target.split(".", 2);
    if (!screen || !section) {
      return { success: false, error: `Geçersiz hedef formatı: ${target}` };
    }
    // Navigasyon eventini SSE uzerinden istemciye gonder
    this.onNavigate?.(screen, section);
    return {
      success: true,
      data: { navigated: target, screen, section, reason },
    };
  }

  // Belirli bir zone'u home 3D gorunumunde vurgula — secip baglanti cizgisi cizdirir
  private async handleHighlightZone(
    zoneId: string,
    reason: string,
  ): Promise<ToolResult> {
    if (!zoneId) {
      return { success: false, error: "zone_id zorunludur" };
    }
    if (!(await this.checkZoneAccess(zoneId))) {
      return { success: false, error: "Bu bölgeye erişim yetkiniz yok" };
    }
    // Zone vurgulama eventini SSE uzerinden istemciye gonder — home.fieldVisualization
    this.onNavigate?.("home", "fieldVisualization", zoneId);
    return {
      success: true,
      data: {
        highlighted: zoneId,
        screen: "home",
        section: "fieldVisualization",
        reason,
      },
    };
  }

  // Cizelge filtrelerini degistir — istemciye normalize yuk gonderir, ekrani Cizelge
  // sekmesine acar. Yalnizca gecerli alanlar uygulanir; gecersizler atlanir.
  private async handleSetTimetableFilters(
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const reason = typeof input.reason === "string" ? input.reason : "";
    const payload: TimetableFilterPayload = {};
    const applied: string[] = [];
    let droppedZones = 0;

    // --- Zaman araligi: gun veya saat (rolling, now'dan geriye) ---
    const range = input.range;
    if (range && typeof range === "object") {
      const r = range as Record<string, unknown>;
      const days = Number(r.days);
      const hours = Number(r.hours);
      if (Number.isFinite(days) && days > 0) {
        const d = Math.min(Math.max(Math.round(days), 1), 90);
        payload.range = { days: d };
        applied.push(`aralık=son ${d} gün`);
      } else if (Number.isFinite(hours) && hours > 0) {
        const h = Math.min(Math.max(Math.round(hours), 1), 2160);
        payload.range = { hours: h };
        applied.push(`aralık=son ${h} saat`);
      }
    }

    // --- Aggregation modu ---
    const agg = input.aggregation;
    if (
      typeof agg === "string" &&
      (TIMETABLE_AGGREGATIONS as readonly string[]).includes(agg)
    ) {
      payload.aggregation = agg as TimetableAggregation;
      applied.push(`mod=${agg}`);
    }

    // --- Metrikler (en az 1; bos/gecersiz gelirse degistirme) ---
    if (Array.isArray(input.metrics)) {
      const valid = input.metrics.filter(
        (m): m is TimetableMetric =>
          typeof m === "string" &&
          (TIMETABLE_METRICS as readonly string[]).includes(m),
      );
      if (valid.length > 0) {
        payload.metrics = valid;
        applied.push(`metrikler=${valid.join("/")}`);
      }
    }

    // --- Gorunum (chart/table) ---
    const view = input.view;
    if (
      typeof view === "string" &&
      (TIMETABLE_VIEWS as readonly string[]).includes(view)
    ) {
      payload.view = view as TimetableView;
      applied.push(`görünüm=${view === "table" ? "tablo" : "grafik"}`);
    }

    // --- Bolgeler: [] -> tumu, [...] -> yalnizca bu field'e ait gecerli zone'lar ---
    if (Array.isArray(input.zones)) {
      const requested = input.zones.filter(
        (z): z is string => typeof z === "string" && z.length > 0,
      );
      if (requested.length === 0) {
        payload.zones = [];
        applied.push("bölgeler=tümü");
      } else {
        const valid: string[] = [];
        for (const zid of requested) {
          // Zone bu executor'in (secili) field'ine ait olmali — field zaten
          // controller'da erisim kontrolunden gecmis durumda.
          const fid = await getFieldIdForZone(zid);
          if (fid && fid === this.fieldId) valid.push(zid);
          else droppedZones++;
        }
        if (valid.length > 0) {
          payload.zones = valid;
          applied.push(`bölgeler=${valid.length} seçili`);
        }
        // valid bos -> zones uygulanmaz (mevcut secim korunur)
      }
    }

    if (Object.keys(payload).length === 0) {
      return {
        success: false,
        error:
          "Geçerli bir filtre parametresi sağlanmadı (range/aggregation/metrics/zones/view).",
      };
    }

    // Eventi SSE uzerinden istemciye gonder — controller buna navigate:"timetable" ekler
    this.onSetFilters?.(payload);

    let summary = `Çizelge filtreleri uygulandı ve Çizelge sekmesi açıldı: ${applied.join(", ")}.`;
    if (droppedZones > 0) {
      summary += ` (${droppedZones} tanınmayan/erişilemeyen bölge atlandı.)`;
    }
    return {
      success: true,
      data: { applied: payload, summary, reason },
    };
  }

  // Secili field'i degistir — buton ile onaylanir. Field kullaniciya erisilebilir olmali.
  private async handleSelectField(
    fieldId: string,
    reason: string,
  ): Promise<ToolResult> {
    if (!fieldId) {
      return { success: false, error: "field_id zorunludur" };
    }
    if (!(await checkFieldAccess(this.userId, fieldId))) {
      return { success: false, error: "Bu tarlaya erişim yetkiniz yok" };
    }
    const info = await getFieldInfo(fieldId);
    if (!info) {
      return { success: false, error: "Tarla bulunamadı" };
    }
    this.onAction?.({
      kind: "select_field",
      field_id: fieldId,
      field_name: info.name,
    });
    return {
      success: true,
      data: {
        staged: "select_field",
        field_id: fieldId,
        field_name: info.name,
        reason,
        note: "Kullanıcıya 'Geç' butonu gösterildi; tarla butona basınca değişecek.",
      },
    };
  }

  // Tema degistir — buton ile onaylanir
  private async handleSetTheme(
    mode: string,
    reason: string,
  ): Promise<ToolResult> {
    if (mode !== "light" && mode !== "dark" && mode !== "system") {
      return { success: false, error: `Geçersiz tema modu: ${mode}` };
    }
    this.onAction?.({ kind: "set_theme", mode });
    return {
      success: true,
      data: {
        staged: "set_theme",
        mode,
        reason,
        note: "Kullanıcıya 'Uygula' butonu gösterildi.",
      },
    };
  }

  // Dil degistir — buton ile onaylanir
  private async handleSetLanguage(
    lang: string,
    reason: string,
  ): Promise<ToolResult> {
    if (lang !== "tr" && lang !== "en") {
      return { success: false, error: `Geçersiz dil: ${lang}` };
    }
    this.onAction?.({ kind: "set_language", lang });
    return {
      success: true,
      data: {
        staged: "set_language",
        lang,
        reason,
        note: "Kullanıcıya 'Uygula' butonu gösterildi.",
      },
    };
  }

  // Karbon kaydi teklifi — YAZMAZ. Erisim + factor dogrular, tahmini hesaplar, butonu cizdirir.
  // Gercek yazma kullanici "Onayla"ya basinca istemciden POST ile yapilir.
  private async handleAddCarbonLog(
    activityTypeId: number,
    activityAmount: number,
    activityDate: string | undefined,
    notes: string | undefined,
  ): Promise<ToolResult> {
    if (typeof activityTypeId !== "number" || !Number.isFinite(activityTypeId)) {
      return { success: false, error: "Geçerli bir activity_type_id gerekli" };
    }
    if (typeof activityAmount !== "number" || !(activityAmount > 0)) {
      return { success: false, error: "activity_amount pozitif bir sayı olmalı" };
    }

    // Tarih — verilmezse bugun; geçersizse hata
    const date = activityDate ? new Date(activityDate) : new Date();
    if (isNaN(date.getTime())) {
      return { success: false, error: "Geçersiz tarih (YYYY-MM-DD bekleniyor)" };
    }

    // Karbon farm-kapsamli; secili field'in farm'ini coz + YAZMA erisimi dogrula
    const info = await getFieldInfo(this.fieldId);
    if (!info || !info.farm_id) {
      return { success: false, error: "Tarla/çiftlik çözümlenemedi" };
    }
    const farmId = info.farm_id;
    if (!(await checkFarmAccess(this.userId, farmId))) {
      return { success: false, error: "Bu çiftliğe kayıt ekleme yetkiniz yok" };
    }

    const preview = await previewCarbonLog(activityTypeId, date);
    if (!preview) {
      return {
        success: false,
        error:
          "Bu aktivite tipi için bu tarihte geçerli bir emisyon faktörü bulunamadı (activity_type_id'yi get_activity_types ile doğrulayın)",
      };
    }

    const estimated =
      Math.round(activityAmount * preview.emission_factor * 100) / 100;
    const isoDate = date.toISOString().slice(0, 10);

    this.onAction?.({
      kind: "add_carbon_log",
      farm_id: farmId,
      activity_type_id: activityTypeId,
      activity_type_name: preview.activity_type.name,
      unit: preview.activity_type.unit,
      activity_date: isoDate,
      activity_amount: activityAmount,
      estimated_emission: estimated,
      ...(notes ? { notes } : {}),
    });

    return {
      success: true,
      data: {
        staged: "add_carbon_log",
        activity: preview.activity_type.name,
        amount: `${activityAmount} ${preview.activity_type.unit}`,
        date: isoDate,
        estimated_emission_kgco2: estimated,
        note: "Kullanıcıya 'Onayla / İptal' butonları gösterildi. Kayıt henüz OLUŞTURULMADI; kullanıcı onaylayınca eklenecek.",
      },
    };
  }

  private async handleGetActivityTypes(): Promise<ToolResult> {
    // Aktivite tipleri herkese acik referans — kapsam kontrolu gerekmez
    const grouped = await getActivityTypes();
    return { success: true, data: grouped };
  }

  private async checkZoneAccess(zoneId: string): Promise<boolean> {
    const fieldId = await getFieldIdForZone(zoneId);
    if (!fieldId) return false;
    return checkFieldAccess(this.userId, fieldId);
  }

  private async checkNodeAccess(nodeId: string): Promise<boolean> {
    const fieldId = await getFieldIdForNode(nodeId);
    if (!fieldId) return false;
    return checkFieldAccess(this.userId, fieldId);
  }

  private async handleGetFieldOverview(fieldId: string): Promise<ToolResult> {
    if (!await checkFieldAccess(this.userId, fieldId)) {
      return { success: false, error: "Bu tarlaya erişim yetkiniz yok" };
    }
    const data = await getFieldContextForLLM(fieldId);
    if ("error" in data) {
      return { success: false, error: data.error };
    }
    return { success: true, data };
  }

  private async handleGetZoneLatest(zoneId: string): Promise<ToolResult> {
    if (!await this.checkZoneAccess(zoneId)) {
      return { success: false, error: "Bu bölgeye erişim yetkiniz yok" };
    }
    const nodes = await getSensorNodesForZone(zoneId, 1);
    const summary = nodes.map((n) => ({
      node_id: n.node_id,
      status: n.status,
      battery: n.battery_level,
      latest: n.readings[0] ? {
        sm_percent: n.readings[0].sm_percent,
        temperature: n.readings[0].temperature,
        humidity: n.readings[0].humidity,
        time: n.readings[0].created_at,
      } : null,
    }));
    return { success: true, data: summary };
  }

  private async handleGetZoneHistory(zoneId: string, hours: number): Promise<ToolResult> {
    if (!await this.checkZoneAccess(zoneId)) {
      return { success: false, error: "Bu bölgeye erişim yetkiniz yok" };
    }
    const nodes = await getSensorNodesForZone(zoneId, 0);
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - hours * 3600000);

    const allReadings: { node_id: string; sm_percent: number | null; temperature: number | null; humidity: number | null; created_at: Date }[] = [];
    for (const node of nodes) {
      const readings = await getReadingsInTimeRange(node.node_id, startTime, endTime);
      for (const r of readings) {
        allReadings.push({
          node_id: node.node_id,
          sm_percent: r.sm_percent,
          temperature: r.temperature,
          humidity: r.humidity,
          created_at: r.created_at!,
        });
      }
    }

    // Kronolojik siraya al ve 100 noktaya dusur
    allReadings.sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
    const downsampled = downsampleReadings(allReadings);

    return {
      success: true,
      data: {
        zone_id: zoneId,
        period_hours: hours,
        total_readings: allReadings.length,
        readings: downsampled,
      },
    };
  }

  // Tarla genelinde N gunluk gecmis — tum zone'lar zaman bucket'larinda ortalamayla
  // kompakt bir trend serisine indirilir (Cizelge ekraninin "custom daygap" karsiligi).
  // get_zone_history'nin 72 saat / tek-zone sinirini asar; analiz/trend sorulari icindir.
  private async handleGetFieldHistory(
    fieldId: string,
    days: number,
  ): Promise<ToolResult> {
    if (!(await checkFieldAccess(this.userId, fieldId))) {
      return { success: false, error: "Bu tarlaya erişim yetkiniz yok" };
    }
    const clampedDays = Math.min(Math.max(Math.round(days), 1), 90);
    const data = await getFieldSensorHistory(fieldId, clampedDays * 24);
    if (!data) {
      return { success: false, error: "Tarla bulunamadı" };
    }

    const readings = data.readings;
    if (readings.length === 0) {
      return {
        success: true,
        data: {
          field_id: fieldId,
          field_name: data.field_name,
          period_days: clampedDays,
          total_readings: 0,
          message: "Bu aralıkta sensör verisi yok",
        },
      };
    }

    // Zaman penceresinin min/max'i (spread yok — cok sayida okuma stack'i tasirabilir)
    let minT = Infinity;
    let maxT = -Infinity;
    for (const r of readings) {
      const ts = r.created_at ? new Date(r.created_at).getTime() : NaN;
      if (!isNaN(ts)) {
        if (ts < minT) minT = ts;
        if (ts > maxT) maxT = ts;
      }
    }
    const span = Math.max(1, maxT - minT);

    // Esit zaman bucket'lari — her bucket'ta field_avg (null'lar atlanir)
    const BUCKETS = 60;
    const acc = Array.from({ length: BUCKETS }, () => ({
      temp: [] as number[],
      hum: [] as number[],
      sm: [] as number[],
    }));
    const push = (arr: number[], v: number | null): void => {
      if (v != null && !isNaN(v)) arr.push(v);
    };
    for (const r of readings) {
      const ts = r.created_at ? new Date(r.created_at).getTime() : NaN;
      if (isNaN(ts)) continue;
      const idx = Math.min(
        BUCKETS - 1,
        Math.floor(((ts - minT) / span) * BUCKETS),
      );
      push(acc[idx]!.temp, r.temperature);
      push(acc[idx]!.hum, r.humidity);
      push(acc[idx]!.sm, r.sm_percent);
    }
    const avg = (a: number[]): number | null =>
      a.length
        ? Math.round((a.reduce((s, v) => s + v, 0) / a.length) * 10) / 10
        : null;
    const trend = acc
      .map((b, i) => ({
        t: new Date(minT + ((i + 0.5) / BUCKETS) * span).toISOString(),
        temperature: avg(b.temp),
        humidity: avg(b.hum),
        sm_percent: avg(b.sm),
      }))
      .filter(
        (p) =>
          p.temperature != null || p.humidity != null || p.sm_percent != null,
      );

    // Genel ozet — her metrik icin avg/min/max + okuma sayisi
    const stat = (
      sel: (r: (typeof readings)[number]) => number | null,
    ): { avg: number; min: number; max: number; count: number } | null => {
      const vals: number[] = [];
      for (const r of readings) {
        const v = sel(r);
        if (v != null && !isNaN(v)) vals.push(v);
      }
      if (!vals.length) return null;
      let mn = vals[0]!;
      let mx = vals[0]!;
      let sum = 0;
      for (const v of vals) {
        if (v < mn) mn = v;
        if (v > mx) mx = v;
        sum += v;
      }
      return {
        avg: Math.round((sum / vals.length) * 10) / 10,
        min: mn,
        max: mx,
        count: vals.length,
      };
    };

    return {
      success: true,
      data: {
        field_id: fieldId,
        field_name: data.field_name,
        period_days: clampedDays,
        total_readings: readings.length,
        summary: {
          temperature: stat((r) => r.temperature),
          humidity: stat((r) => r.humidity),
          sm_percent: stat((r) => r.sm_percent),
        },
        trend,
      },
    };
  }

  private async handleGetZoneDetails(zoneId: string): Promise<ToolResult> {
    if (!await this.checkZoneAccess(zoneId)) {
      return { success: false, error: "Bu bölgeye erişim yetkiniz yok" };
    }
    const zone = await getZoneWithAdaptiveControl(zoneId);
    if (!zone) {
      return { success: false, error: "Bölge bulunamadı" };
    }
    return { success: true, data: zone };
  }

  private async handleGetIrrigationHistory(zoneId: string, limit: number): Promise<ToolResult> {
    if (!await this.checkZoneAccess(zoneId)) {
      return { success: false, error: "Bu bölgeye erişim yetkiniz yok" };
    }
    const jobs = await getIrrigationHistory(zoneId, limit);
    const summary = jobs.map((j) => ({
      job_id: j.job_id,
      status: j.status,
      recommended_duration_min: j.recommended_duration_min,
      reasoning: j.reasoning,
      created_at: j.created_at,
      trigger_sm: j.trigger_reading?.sm_percent ?? null,
      result_sm: j.followups[0]?.result_reading?.sm_percent ?? null,
    }));
    return { success: true, data: summary };
  }

  private async handleGetSensorDiagnostics(nodeId: string): Promise<ToolResult> {
    if (!await this.checkNodeAccess(nodeId)) {
      return { success: false, error: "Bu sensöre erişim yetkiniz yok" };
    }
    const diagnostics = await prisma.sensorDiagnostic.findMany({
      where: { node_id: nodeId },
      orderBy: { created_at: "desc" },
      take: 10,
    });
    return { success: true, data: diagnostics };
  }

  private async handleGetCarbonSummary(
    farmId: string,
    days?: number,
  ): Promise<ToolResult> {
    if (!await checkFarmReadAccess(this.userId, farmId)) {
      return { success: false, error: "Bu çiftliğe erişim yetkiniz yok" };
    }
    // Opsiyonel son-N-gun penceresi (trend sorulari icin)
    let startDate: Date | undefined;
    if (typeof days === "number" && Number.isFinite(days) && days > 0) {
      const d = Math.min(Math.round(days), 365);
      startDate = new Date(Date.now() - d * 86400000);
    }
    const summary = await getFarmSummary(farmId, startDate);
    return {
      success: true,
      data: startDate ? { period_days: Math.round(days as number), ...summary } : summary,
    };
  }

  private async handleSearchKnowledge(query: string, limit: number): Promise<ToolResult> {
    // Bilgi tabani herkese acik, kapsam kontrolu gerekmez
    const results = await searchKnowledge(query, limit);
    if (!results || (results as unknown[]).length === 0) {
      return { success: true, data: { message: "Bu konuda bilgi tabanında sonuç bulunamadı", query } };
    }
    return { success: true, data: results };
  }

  private async handleGetDiseaseHistory(
    limit: number,
    status: string,
  ): Promise<ToolResult> {
    // Kullaniciya ait hastalik tespitleri — user_id scope
    const where: { user_id: string; status?: "COMPLETED" | "FAILED" } = {
      user_id: this.userId,
    };
    if (status === "completed") where.status = "COMPLETED";
    if (status === "failed") where.status = "FAILED";

    const rows = await prisma.diseaseDetection.findMany({
      where,
      orderBy: { uploaded_at: "desc" },
      take: limit,
      select: {
        detection_id: true,
        detected_disease: true,
        confidence_score: true,
        status: true,
        uploaded_at: true,
        completed_at: true,
      },
    });

    const summary = rows.map((r) => ({
      id: r.detection_id,
      disease: r.detected_disease ?? "unknown",
      confidence_pct:
        r.confidence_score != null ? Math.round(r.confidence_score * 100) : null,
      status: r.status,
      uploaded_at: r.uploaded_at.toISOString(),
      completed_at: r.completed_at?.toISOString() ?? null,
    }));

    return {
      success: true,
      data: {
        count: summary.length,
        detections: summary,
      },
    };
  }

  private async handleGetActiveAlerts(
    limit: number,
    severity: string,
  ): Promise<ToolResult> {
    // Kullaniciya ait okunmamis uyarilar — is_read=false
    const where: {
      user_id: string;
      is_read: boolean;
      severity?: "INFO" | "WARNING" | "CRITICAL";
    } = {
      user_id: this.userId,
      is_read: false,
    };
    if (severity === "INFO" || severity === "WARNING" || severity === "CRITICAL") {
      where.severity = severity;
    }

    const rows = await prisma.alert.findMany({
      where,
      orderBy: { created_at: "desc" },
      take: limit,
      select: {
        alert_id: true,
        title: true,
        message: true,
        severity: true,
        created_at: true,
      },
    });

    const summary = rows.map((r) => ({
      id: r.alert_id.toString(),
      title: r.title,
      message: r.message,
      severity: r.severity ?? "INFO",
      created_at: r.created_at?.toISOString() ?? null,
    }));

    return {
      success: true,
      data: {
        count: summary.length,
        alerts: summary,
      },
    };
  }
}
