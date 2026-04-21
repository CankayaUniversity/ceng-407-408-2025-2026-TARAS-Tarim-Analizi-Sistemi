// Arac yurutme katmani — kapsam kontrolu, denetim loglama, sonuc siniri
import prisma from "../../config/database";
import logger from "../../utils/logger";
import { checkFieldAccess } from "../dashboardService";
import { checkFarmAccess } from "../carbonService";
import { getFieldContextForLLM } from "../tarasData.service";
import {
  getSensorNodesForZone,
  getReadingsInTimeRange,
  getZoneWithAdaptiveControl,
  getIrrigationHistory,
} from "../sensorNodeService";
import { getFarmSummary } from "../carbonService";
import { searchKnowledge } from "./knowledgeBase.service";
import { SECTION_TARGETS } from "./toolDefinitions";

const MAX_RESULT_CHARS = 8000;
const MAX_CALLS = 8;

interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

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
  public onNavigate?: (screen: string, section: string | null) => void;

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

      case "get_field_overview":
        return this.handleGetFieldOverview(input.field_id as string);

      case "get_zone_latest":
        return this.handleGetZoneLatest(input.zone_id as string);

      case "get_zone_history":
        return this.handleGetZoneHistory(
          input.zone_id as string,
          Math.min((input.hours as number) || 24, 72),
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
        return this.handleGetCarbonSummary(input.farm_id as string);

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
      result_sm: j.result_reading?.sm_percent ?? null,
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

  private async handleGetCarbonSummary(farmId: string): Promise<ToolResult> {
    if (!await checkFarmAccess(this.userId, farmId)) {
      return { success: false, error: "Bu çiftliğe erişim yetkiniz yok" };
    }
    const summary = await getFarmSummary(farmId);
    return { success: true, data: summary };
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
        confidence: true,
        status: true,
        uploaded_at: true,
        completed_at: true,
      },
    });

    const summary = rows.map((r) => ({
      id: r.detection_id,
      disease: r.detected_disease ?? "unknown",
      confidence_pct:
        r.confidence != null ? Math.round(r.confidence * 100) : null,
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
