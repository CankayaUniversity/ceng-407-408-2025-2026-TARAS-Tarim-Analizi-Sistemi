import { Request, Response } from "express";
import sensorNodeService from "../services/sensorNodeService";
import dashboardService from "../services/dashboardService";
import { prisma } from "../config/database";
import logger from "../utils/logger";
import { getStringParam, getNumberParam } from "../utils/requestHelpers";
import { emitSensorUpdate } from "../config/socket";

export async function getUserZones(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.user_id;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: "Authentication required",
      });
      return;
    }

    const farms = await prisma.farm.findMany({
      where: { user_id: userId },
      include: {
        fields: {
          include: {
            zones: {
              include: {
                sensor_nodes: {
                  select: {
                    node_id: true,
                    hardware_mac: true,
                    status: true,
                    battery_level: true,
                  },
                },
                details: {
                  select: {
                    current_kc: true,
                    target_sm_percent: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const zones = farms.flatMap((farm) =>
      farm.fields.flatMap((field) =>
        field.zones.map((zone) => ({
          zone_id: zone.zone_id,
          name: zone.name,
          soil_type: zone.soil_type,
          field_name: field.name,
          farm_name: farm.name,
          sensor_count: zone.sensor_nodes.length,
          active_sensors: zone.sensor_nodes.filter((s) => s.status === 'ACTIVE').length,
          sensors: zone.sensor_nodes,
          adaptive_config: zone.details
            ? {
                current_kc: zone.details.current_kc,
                target_sm_percent: zone.details.target_sm_percent,
              }
            : null,
        })),
      ),
    );

    res.status(200).json({
      success: true,
      data: {
        user_id: userId,
        zone_count: zones.length,
        zones,
      },
    });
  } catch (error) {
    logger.error("Get user zones error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
}

// Erisim kontrolu — zone verisini dondurur, basarisizsa response gonderir
async function requireZoneAccess(req: Request, res: Response, zoneId: string | undefined) {
  const userId = (req as any).user?.user_id;

  if (!userId) {
    res.status(401).json({ success: false, error: "Authentication required" });
    return null;
  }

  if (!zoneId) {
    res.status(400).json({ success: false, error: "Zone ID is required" });
    return null;
  }

  const zone = await prisma.zone.findUnique({
    where: { zone_id: zoneId },
    include: {
      field: {
        include: {
          farm: true,
        },
      },
    },
  });

  if (!zone?.field?.farm || zone.field.farm.user_id !== userId) {
    res.status(403).json({ success: false, error: "You do not have access to this zone" });
    return null;
  }

  return zone;
}

export async function getSensorsByZone(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const zoneId = getStringParam(req.params.zoneId);
    const zone = await requireZoneAccess(req, res, zoneId);
    if (!zone) return;

    const limit = req.query.limit;
    const readingLimit = getNumberParam(limit, 10);
    const sensors = await sensorNodeService.getSensorNodesForZone(zone.zone_id, readingLimit);

    res.status(200).json({
      success: true,
      data: {
        zone_id: zone.zone_id,
        sensor_count: sensors.length,
        sensors: sensors.map((sensor) => ({
          node_id: sensor.node_id,
          hardware_mac: sensor.hardware_mac,
          battery_level: sensor.battery_level,
          status: sensor.status,
          gateway_id: sensor.gateway_id,
          latest_reading: sensor.readings[0] || null,
          reading_count: sensor.readings.length,
          readings: sensor.readings,
        })),
      },
    });
  } catch (error) {
    logger.error("Get sensors by zone error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
}

export async function getLatestReadings(req: Request, res: Response): Promise<void> {
  try {
    const zoneId = getStringParam(req.params.zoneId);
    const zone = await requireZoneAccess(req, res, zoneId);
    if (!zone) return;

    const sensors = await sensorNodeService.getSensorNodesForZone(zone.zone_id, 1);

    const latestData = sensors.map((sensor) => {
      const reading = sensor.readings[0];
      return {
        node_id: sensor.node_id,
        hardware_mac: sensor.hardware_mac,
        status: sensor.status,
        battery_level: sensor.battery_level,
        latest_reading: reading
          ? {
              id: reading.id.toString(),
              created_at: reading.created_at,
              sm_percent: reading.sm_percent,
              temperature: reading.temperature,
              humidity: reading.humidity,
              et0_instant: reading.et0_instant,
              battery_voltage: reading.battery_voltage,
            }
          : null,
      };
    });

    res.status(200).json({
      success: true,
      data: {
        zone_id: zone.zone_id,
        timestamp: new Date(),
        sensors: latestData,
      },
    });
  } catch (error) {
    logger.error("Get latest readings error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
}

export async function getZoneHistory(req: Request, res: Response): Promise<void> {
  try {
    const zoneId = getStringParam(req.params.zoneId);
    const zone = await requireZoneAccess(req, res, zoneId);
    if (!zone) return;

    const startTime = getStringParam(req.query.startTime);
    const endTime = getStringParam(req.query.endTime);
    const nodeId = getStringParam(req.query.nodeId);

    const end = endTime ? new Date(endTime) : new Date();
    const start = startTime
      ? new Date(startTime)
      : new Date(end.getTime() - 24 * 60 * 60 * 1000);

    let readings;
    if (nodeId) {
      readings = await sensorNodeService.getReadingsInTimeRange(
        nodeId,
        start,
        end,
      );
    } else {
      // Tek sorgu ile tum zone sensorlerinin okumalarini cek
      readings = await prisma.sensorReading.findMany({
        where: {
          node: { zone_id: zone.zone_id },
          created_at: { gte: start, lte: end },
        },
        orderBy: { created_at: "asc" },
      });
    }

    res.status(200).json({
      success: true,
      data: {
        zone_id: zone.zone_id,
        time_range: {
          start,
          end,
        },
        reading_count: readings.length,
        readings: readings.map((r) => ({
          id: r.id.toString(),
          node_id: r.node_id,
          created_at: r.created_at,
          sm_percent: r.sm_percent,
          temperature: r.temperature,
          humidity: r.humidity,
          et0_instant: r.et0_instant,
        })),
      },
    });
  } catch (error) {
    logger.error("Get zone history error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
}

export async function getZoneDetails(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const zoneId = getStringParam(req.params.zoneId);
    const accessZone = await requireZoneAccess(req, res, zoneId);
    if (!accessZone) return;

    const zone = await sensorNodeService.getZoneWithAdaptiveControl(accessZone.zone_id);

    if (!zone) {
      res.status(404).json({
        success: false,
        error: "Zone not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        zone_id: zone.zone_id,
        name: zone.name,
        soil_type: zone.soil_type,
        created_at: zone.created_at,
        adaptive_config: zone.details
          ? {
              current_kc: zone.details.current_kc,
              current_irrigation_gain: zone.details.current_irrigation_gain,
              target_sm_percent: zone.details.target_sm_percent,
              critical_sm_percent: zone.details.critical_sm_percent,
              updated_at: zone.details.updated_at,
            }
          : null,
        sensor_count: zone.sensor_nodes.length,
        active_sensors: zone.sensor_nodes.filter((s) => s.status === "ACTIVE")
          .length,
        latest_readings: zone.sensor_nodes.map((sensor) => ({
          node_id: sensor.node_id,
          hardware_mac: sensor.hardware_mac,
          status: sensor.status,
          battery_level: sensor.battery_level,
          latest: sensor.readings[0] || null,
        })),
        active_plantings: zone.plantings.map((p) => ({
          planting_id: p.planting_id,
          crop_name: p.crop?.name,
          planted_at: p.planted_at,
          is_active: p.is_active,
        })),
        recent_kc_calibrations: zone.kc_history.slice(0, 5),
      },
    });
  } catch (error) {
    logger.error("Get zone details error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
}

export async function getNodeReadings(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = (req as any).user?.user_id;
    const nodeId = getStringParam(req.params.nodeId);
    const limit = getStringParam(req.query.limit);
    const startTime = getStringParam(req.query.startTime);
    const endTime = getStringParam(req.query.endTime);

    if (!userId) {
      res.status(401).json({
        success: false,
        error: "Authentication required",
      });
      return;
    }

    if (!nodeId) {
      res.status(400).json({
        success: false,
        error: "Node ID is required",
      });
      return;
    }

    const node = await prisma.sensorNode.findUnique({
      where: { node_id: nodeId },
      include: {
        zone: {
          include: {
            field: {
              include: {
                farm: true,
              },
            },
          },
        },
      },
    });

    if (!node) {
      res.status(404).json({
        success: false,
        error: "Sensor node not found",
      });
      return;
    }

    if (node.zone?.field?.farm?.user_id !== userId) {
      res.status(403).json({
        success: false,
        error: "You do not have access to this sensor",
      });
      return;
    }

    let readings;
    if (startTime && endTime) {
      const start = new Date(startTime);
      const end = new Date(endTime);
      readings = await sensorNodeService.getReadingsInTimeRange(
        nodeId,
        start,
        end,
      );
    } else {
      const readingLimit = limit ? parseInt(limit, 10) : 50;
      readings = await prisma.sensorReading.findMany({
        where: { node_id: nodeId },
        orderBy: { created_at: "desc" },
        take: readingLimit,
      });
    }

    res.status(200).json({
      success: true,
      data: {
        node_id: nodeId,
        hardware_mac: node.hardware_mac,
        zone_id: node.zone_id,
        zone_name: node.zone?.name,
        reading_count: readings.length,
        readings: readings.map((r) => ({
          ...r,
          id: r.id.toString(),
        })),
      },
    });
  } catch (error) {
    logger.error("Get node readings error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
}

export async function getFieldSensorHistory(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = (req as any).user?.user_id;
    const fieldId = getStringParam(req.params.fieldId);
    const hours = req.query.hours;

    if (!userId) {
      res
        .status(401)
        .json({ success: false, error: "Authentication required" });
      return;
    }

    if (!fieldId) {
      res.status(400).json({ success: false, error: "Field ID is required" });
      return;
    }

    const hasAccess = await dashboardService.checkFieldAccess(userId, fieldId);
    if (!hasAccess) {
      res.status(403).json({
        success: false,
        error: "You do not have access to this field",
      });
      return;
    }

    const hoursParam = getNumberParam(hours, 72);
    const result = await sensorNodeService.getFieldSensorHistory(
      fieldId,
      hoursParam,
    );

    if (!result) {
      res.status(404).json({ success: false, error: "Field not found" });
      return;
    }

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    logger.error(
      "Get field sensor history error:",
      error instanceof Error
        ? { message: error.message, stack: error.stack }
        : error,
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
}

export async function registerDevice(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.user_id;
    if (!userId) {
      res.status(401).json({ success: false, error: "Authentication required" });
      return;
    }

    const { mac, zone_id } = req.body;
    if (!mac) {
      res.status(400).json({ success: false, error: "Missing mac address" });
      return;
    }

    // Check if MAC already registered
    const existing = await prisma.sensorNode.findUnique({
      where: { hardware_mac: mac },
    });

    if (existing) {
      // Return existing device_key
      res.status(200).json({
        success: true,
        node_id: existing.node_id,
        device_key: existing.device_key,
        message: "Device already registered",
      });
      return;
    }

    // Verify zone belongs to user (if provided)
    if (zone_id) {
      const zone = await prisma.zone.findFirst({
        where: { zone_id },
        include: { field: { include: { farm: true } } },
      });
      if (!zone || zone.field?.farm?.user_id !== userId) {
        res.status(403).json({ success: false, error: "Zone not found or not owned by user" });
        return;
      }
    }

    // Create new sensor node — device_key auto-generated by database
    const node = await prisma.sensorNode.create({
      data: {
        hardware_mac: mac,
        zone_id: zone_id || null,
        status: "ACTIVE",
      },
    });

    logger.info(`[DEVICE] New device registered: MAC=${mac} key=${node.device_key}`);

    res.status(201).json({
      success: true,
      node_id: node.node_id,
      device_key: node.device_key,
    });
  } catch (error) {
    logger.error("[DEVICE] registerDevice error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
}

export async function postDeviceData(req: Request, res: Response): Promise<void> {
  try {
    const deviceKey = req.headers["x-device-key"] as string;
    if (!deviceKey) {
      res.status(401).json({ success: false, error: "Missing X-Device-Key header" });
      return;
    }

    // Find device by its unique key
    const sensorNode = await prisma.sensorNode.findUnique({
      where: { device_key: deviceKey },
      include: { zone: true },
    });

    if (!sensorNode) {
      res.status(401).json({ success: false, error: "Invalid device key" });
      return;
    }

    const { readings } = req.body;
    if (!readings || !Array.isArray(readings) || readings.length === 0) {
      res.status(400).json({ success: false, error: "Missing readings array" });
      return;
    }

    const now = Date.now();
    const calDry = sensorNode.cal_dry_value;
    const calWet = sensorNode.cal_wet_value;
    const hasCalibration = calDry != null && calWet != null && calDry !== calWet;

    const readingsData = readings.map((r: any) => {
      const rawSm = r.raw_sm_value ?? null;
      let smPercent: number | null = null;
      if (hasCalibration && rawSm != null) {
        // (dry - raw) / (dry - wet) * 100, clamped 0-100
        smPercent = Math.max(0, Math.min(100,
          ((calDry! - rawSm) / (calDry! - calWet!)) * 100
        ));
        smPercent = Math.round(smPercent * 10) / 10; // 1 decimal
      }
      return {
        node_id: sensorNode.node_id,
        temperature: r.temperature ?? null,
        humidity: r.humidity ?? null,
        raw_temperature: r.raw_temperature ?? null,
        raw_humidity: r.raw_humidity ?? null,
        raw_sm_value: rawSm,
        sm_percent: smPercent,
        battery_voltage: r.battery_voltage ?? null,
        created_at: new Date(now - (r.minutes_ago || 0) * 60000),
      };
    });

    const result = await prisma.sensorReading.createMany({ data: readingsData });
    const savedCount = result.count;

    logger.info(`[DEVICE] ${savedCount} readings from ${sensorNode.hardware_mac}`);

    // Emit socket update for the latest reading (use calibrated data, not raw)
    const latestCalibrated = readingsData[readingsData.length - 1];
    const latestRaw = readings[readings.length - 1];
    const fieldId = sensorNode.zone?.field_id;
    if (fieldId && latestCalibrated) {
      emitSensorUpdate(fieldId, {
        readingId: null,
        sensorNodeId: sensorNode.node_id,
        macAddress: sensorNode.hardware_mac,
        temperature: latestCalibrated.temperature ?? null,
        humidity: latestCalibrated.humidity ?? null,
        smPercent: latestCalibrated.sm_percent ?? null,
        sensorError: latestRaw?.sensor_error || 0,
        timestamp: new Date(),
      });
    }

    // Check for sensor errors (bitmask: 1=SHT31, 2=soil, 3=both)
    // Rate-limited: 1 alert per node per hour
    const errorCode = readings.reduce((acc: number, r: { sensor_error?: number }) =>
      acc | (r.sensor_error || 0), 0);

    if (errorCode > 0 && fieldId) {
      const oneHourAgo = new Date(Date.now() - 3600000);
      const recentAlert = await prisma.alert.findFirst({
        where: {
          title: "Sensor Failure",
          message: { startsWith: `Sensor ${sensorNode.hardware_mac}:` },
          created_at: { gte: oneHourAgo },
        },
      });

      if (!recentAlert) {
        const errorParts: string[] = [];
        if (errorCode & 1) errorParts.push("SHT31 (temperature/humidity)");
        if (errorCode & 2) errorParts.push("Soil moisture");
        const errorDesc = errorParts.join(" + ");

        const field = await prisma.field.findUnique({
          where: { field_id: fieldId },
          include: { farm: true },
        });
        if (field?.farm?.user_id) {
          await prisma.alert.create({
            data: {
              user_id: field.farm.user_id,
              title: "Sensor Failure",
              message: `Sensor ${sensorNode.hardware_mac}: ${errorDesc} sensor failed. Check wiring.`,
              severity: "CRITICAL",
            },
          });
          emitSensorUpdate(fieldId, {
            type: "sensor-alert",
            sensorNodeId: sensorNode.node_id,
            macAddress: sensorNode.hardware_mac,
            errorCode,
          });
          logger.warn(`[DEVICE] Sensor failure (code=${errorCode}): ${sensorNode.hardware_mac}`);
        }
      }
    }

    res.status(200).json({ success: true, count: savedCount });
  } catch (error) {
    logger.error("[DEVICE] postDeviceData error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
}

export async function postDeviceDiagnostic(req: Request, res: Response): Promise<void> {
  try {
    const deviceKey = req.headers["x-device-key"] as string;
    if (!deviceKey) {
      res.status(401).json({ success: false, error: "Missing X-Device-Key header" });
      return;
    }

    const sensorNode = await prisma.sensorNode.findUnique({
      where: { device_key: deviceKey },
      include: { zone: { include: { field: { include: { farm: true } } } } },
    });

    if (!sensorNode) {
      res.status(401).json({ success: false, error: "Invalid device key" });
      return;
    }

    const d = req.body;

    await prisma.sensorDiagnostic.create({
      data: {
        node_id: sensorNode.node_id,
        reset_reason: d.reset_reason ?? 0,
        boot_count: d.boot_count ?? 0,
        uptime_cycles: d.uptime_cycles ?? 0,
        failures: d.failures && Object.keys(d.failures).length > 0 ? d.failures : undefined,
      },
    });

    await prisma.sensorNode.update({
      where: { node_id: sensorNode.node_id },
      data: {
        last_reset_reason: d.reset_reason ?? null,
        last_boot_count: d.boot_count ?? null,
        last_diag_at: new Date(),
      },
    });

    // Alert on abnormal resets
    const ABNORMAL = [7, 9, 15]; // WDT, BROWNOUT, PANIC
    if (ABNORMAL.includes(d.reset_reason)) {
      const names: Record<number, string> = {
        7: "Watchdog timeout (firmware hang)",
        9: "Brownout (low battery)",
        15: "Panic (firmware crash)",
      };
      const userId = sensorNode.zone?.field?.farm?.user_id;
      if (userId) {
        await prisma.alert.create({
          data: {
            user_id: userId,
            title: "Sensor Reset Detected",
            message: `Sensor ${sensorNode.hardware_mac}: ${names[d.reset_reason] ?? "Unknown"}. Boot count: ${d.boot_count}.`,
            severity: d.reset_reason === 9 ? "CRITICAL" : "WARNING",
          },
        });
      }
    }

    logger.info(`[DIAG] ${sensorNode.hardware_mac} rst=${d.reset_reason} boots=${d.boot_count}`);
    res.status(200).json({ success: true });
  } catch (error) {
    logger.error("[DIAG] postDeviceDiagnostic error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
}

export async function getNodeDiagnostics(req: Request, res: Response): Promise<void> {
  try {
    const nodeId = req.params.nodeId as string;
    const limit = parseInt(req.query.limit as string) || 50;

    const diagnostics = await prisma.sensorDiagnostic.findMany({
      where: { node_id: nodeId as string },
      orderBy: { created_at: "desc" },
      take: limit,
    });

    res.status(200).json({
      success: true,
      data: diagnostics.map((d) => ({
        ...d,
        id: d.id.toString(),
      })),
    });
  } catch (error) {
    logger.error("[DIAG] getNodeDiagnostics error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
}

export default {
  getUserZones,
  getSensorsByZone,
  getLatestReadings,
  getZoneHistory,
  getZoneDetails,
  getNodeReadings,
  getFieldSensorHistory,
  registerDevice,
  postDeviceData,
  postDeviceDiagnostic,
  getNodeDiagnostics,
};
