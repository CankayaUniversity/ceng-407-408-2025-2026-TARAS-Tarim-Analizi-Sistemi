import { Request, Response } from "express";
import { prisma } from "../config/database";
import logger from "../utils/logger";
import { getStringParam } from "../utils/requestHelpers";
import { emitToGateway } from "../config/socket";
import { uploadToS3, generatePresignedDownloadUrl } from "../services/s3.service";

// Erisim kontrolu — gateway verisini dondurur, basarisizsa null dondurur
async function verifyGatewayAccess(
  userId: string,
  gatewayId: string,
): Promise<ReturnType<typeof prisma.gateway.findUnique> | null> {
  const gateway = await prisma.gateway.findUnique({
    where: { gateway_id: gatewayId },
    include: { farm: true },
  });
  if (!gateway || gateway.farm?.user_id !== userId) return null;
  return gateway;
}

export async function registerGateway(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.user_id;
    if (!userId) {
      res.status(401).json({ success: false, error: "Authentication required" });
      return;
    }

    const { mac, farm_id, name } = req.body;
    if (!mac) {
      res.status(400).json({ success: false, error: "Missing mac address" });
      return;
    }

    // MAC zaten kayitli mi kontrol et
    const existing = await prisma.gateway.findUnique({
      where: { hardware_serial: mac },
    });

    if (existing) {
      res.status(200).json({
        success: true,
        gateway_id: existing.gateway_id,
        api_key: existing.api_key,
        message: "Gateway already registered",
      });
      return;
    }

    // Farm kullaniciya ait mi kontrol et
    if (farm_id) {
      const farm = await prisma.farm.findFirst({
        where: { farm_id },
      });
      if (!farm || farm.user_id !== userId) {
        res.status(403).json({ success: false, error: "Farm not found or not owned by user" });
        return;
      }
    }

    // Yeni gateway olustur — api_key veritabani tarafindan otomatik uretilir
    const gateway = await prisma.gateway.create({
      data: {
        hardware_serial: mac,
        farm_id: farm_id || null,
        name: name || null,
      },
    });

    logger.info(`[GATEWAY] New gateway registered: MAC=${mac} id=${gateway.gateway_id}`);

    res.status(201).json({
      success: true,
      gateway_id: gateway.gateway_id,
      api_key: gateway.api_key,
    });
  } catch (error) {
    logger.error("[GATEWAY] registerGateway error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
}

export async function authenticateGateway(req: Request, res: Response): Promise<void> {
  try {
    const apiKey = req.headers["x-gateway-key"] as string;
    if (!apiKey) {
      res.status(401).json({ success: false, error: "Missing X-Gateway-Key header" });
      return;
    }

    const gateway = await prisma.gateway.findUnique({
      where: { api_key: apiKey },
    });

    if (!gateway) {
      res.status(401).json({ success: false, error: "Invalid gateway key" });
      return;
    }

    // Son gorunme zamanini guncelle
    await prisma.gateway.update({
      where: { gateway_id: gateway.gateway_id },
      data: { last_seen: new Date() },
    });

    logger.info(`[GATEWAY] Gateway authenticated: ${gateway.gateway_id}`);

    res.status(200).json({
      success: true,
      gateway_id: gateway.gateway_id,
    });
  } catch (error) {
    logger.error("[GATEWAY] authenticateGateway error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
}

export async function getGatewayStatus(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.user_id;
    if (!userId) {
      res.status(401).json({ success: false, error: "Authentication required" });
      return;
    }

    const gatewayId = getStringParam(req.params.gatewayId);
    if (!gatewayId) {
      res.status(400).json({ success: false, error: "Gateway ID is required" });
      return;
    }

    const gateway = await prisma.gateway.findUnique({
      where: { gateway_id: gatewayId },
      include: {
        farm: true,
        _count: { select: { sensor_nodes: true } },
      },
    });

    if (!gateway || gateway.farm?.user_id !== userId) {
      res.status(403).json({ success: false, error: "Gateway not found or access denied" });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        gateway_id: gateway.gateway_id,
        hardware_serial: gateway.hardware_serial,
        name: gateway.name,
        status: gateway.status,
        firmware_version: gateway.firmware_version,
        last_heartbeat: gateway.last_heartbeat,
        last_seen: gateway.last_seen,
        farm_id: gateway.farm_id,
        farm_name: gateway.farm?.name,
        sensor_nodes_count: gateway._count.sensor_nodes,
        created_at: gateway.created_at,
        updated_at: gateway.updated_at,
      },
    });
  } catch (error) {
    logger.error("[GATEWAY] getGatewayStatus error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
}

export async function getGatewayNodes(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.user_id;
    if (!userId) {
      res.status(401).json({ success: false, error: "Authentication required" });
      return;
    }

    const gatewayId = getStringParam(req.params.gatewayId);
    if (!gatewayId) {
      res.status(400).json({ success: false, error: "Gateway ID is required" });
      return;
    }

    const gateway = await verifyGatewayAccess(userId, gatewayId);
    if (!gateway) {
      res.status(403).json({ success: false, error: "Gateway not found or access denied" });
      return;
    }

    const nodes = await prisma.sensorNode.findMany({
      where: { gateway_id: gatewayId },
      include: {
        readings: {
          orderBy: { created_at: "desc" },
          take: 1,
        },
        zone: {
          select: { zone_id: true, name: true },
        },
      },
    });

    res.status(200).json({
      success: true,
      data: {
        gateway_id: gatewayId,
        node_count: nodes.length,
        nodes: nodes.map((node) => ({
          node_id: node.node_id,
          hardware_mac: node.hardware_mac,
          status: node.status,
          battery_level: node.battery_level,
          zone: node.zone,
          latest_reading: node.readings[0] || null,
        })),
      },
    });
  } catch (error) {
    logger.error("[GATEWAY] getGatewayNodes error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
}

export async function startPairing(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.user_id;
    if (!userId) {
      res.status(401).json({ success: false, error: "Authentication required" });
      return;
    }

    const gatewayId = getStringParam(req.params.gatewayId);
    if (!gatewayId) {
      res.status(400).json({ success: false, error: "Gateway ID is required" });
      return;
    }

    const gateway = await verifyGatewayAccess(userId, gatewayId);
    if (!gateway) {
      res.status(403).json({ success: false, error: "Gateway not found or access denied" });
      return;
    }

    const { timeout_sec } = req.body;
    const timeout = timeout_sec || 30;

    // Gateway durumunu PAIRING olarak guncelle
    await prisma.gateway.update({
      where: { gateway_id: gatewayId },
      data: { status: "PAIRING" },
    });

    emitToGateway(gatewayId, "gateway:enter_registration", { timeout_sec: timeout });

    logger.info(`[GATEWAY] Pairing started: ${gatewayId} timeout=${timeout}s`);

    res.status(200).json({
      success: true,
      data: { gateway_id: gatewayId, status: "PAIRING", timeout_sec: timeout },
    });
  } catch (error) {
    logger.error("[GATEWAY] startPairing error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
}

export async function approveNode(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.user_id;
    if (!userId) {
      res.status(401).json({ success: false, error: "Authentication required" });
      return;
    }

    const gatewayId = getStringParam(req.params.gatewayId);
    if (!gatewayId) {
      res.status(400).json({ success: false, error: "Gateway ID is required" });
      return;
    }

    const gateway = await verifyGatewayAccess(userId, gatewayId);
    if (!gateway) {
      res.status(403).json({ success: false, error: "Gateway not found or access denied" });
      return;
    }

    const { mac, zone_id } = req.body;
    if (!mac) {
      res.status(400).json({ success: false, error: "Missing mac address" });
      return;
    }

    // MAC zaten kayitli mi kontrol et
    const existing = await prisma.sensorNode.findUnique({
      where: { hardware_mac: mac },
    });

    if (existing) {
      res.status(200).json({
        success: true,
        node_id: existing.node_id,
        device_key: existing.device_key,
        message: "Node already registered",
      });
      return;
    }

    // Zone kullaniciya ait mi kontrol et (zone -> field -> farm -> user_id)
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

    // Yeni sensor node olustur
    const node = await prisma.sensorNode.create({
      data: {
        hardware_mac: mac,
        gateway_id: gatewayId,
        zone_id: zone_id || null,
        status: "ACTIVE",
      },
    });

    // Varsayilan konfigurasyon objesi olustur
    const config = {
      sleep_interval_sec: node.sleep_interval_sec,
      min_buffer_cycles: node.min_buffer_cycles,
      max_buffer_cycles: node.max_buffer_cycles,
      temp_threshold: node.temp_threshold,
      hum_threshold: node.hum_threshold,
      soil_threshold: node.soil_threshold,
    };

    emitToGateway(gatewayId, "gateway:pair_approved", {
      mac,
      device_key: node.device_key,
      config,
    });

    // Gateway durumunu ONLINE'a geri al
    await prisma.gateway.update({
      where: { gateway_id: gatewayId },
      data: { status: "ONLINE" },
    });

    logger.info(`[GATEWAY] Node approved: MAC=${mac} gateway=${gatewayId}`);

    res.status(201).json({
      success: true,
      node_id: node.node_id,
      device_key: node.device_key,
    });
  } catch (error) {
    logger.error("[GATEWAY] approveNode error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
}

export async function rejectNode(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.user_id;
    if (!userId) {
      res.status(401).json({ success: false, error: "Authentication required" });
      return;
    }

    const gatewayId = getStringParam(req.params.gatewayId);
    if (!gatewayId) {
      res.status(400).json({ success: false, error: "Gateway ID is required" });
      return;
    }

    const gateway = await verifyGatewayAccess(userId, gatewayId);
    if (!gateway) {
      res.status(403).json({ success: false, error: "Gateway not found or access denied" });
      return;
    }

    const { mac, reason } = req.body;

    // Gateway'e reddetme bildirimi gonder (sensor node'u kapatacak)
    emitToGateway(gatewayId, "gateway:pair_rejected", { mac, reason });
    // Gateway'i kayit modundan cikar
    emitToGateway(gatewayId, "gateway:exit_registration", {});

    await prisma.gateway.update({
      where: { gateway_id: gatewayId },
      data: { status: "ONLINE" },
    });

    logger.info(`[GATEWAY] Node rejected: MAC=${mac} gateway=${gatewayId} reason=${reason}`);

    res.status(200).json({
      success: true,
      data: { mac, reason },
    });
  } catch (error) {
    logger.error("[GATEWAY] rejectNode error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
}

export async function stopPairing(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.user_id;
    if (!userId) {
      res.status(401).json({ success: false, error: "Authentication required" });
      return;
    }

    const gatewayId = getStringParam(req.params.gatewayId);
    if (!gatewayId) {
      res.status(400).json({ success: false, error: "Gateway ID is required" });
      return;
    }

    const gateway = await verifyGatewayAccess(userId, gatewayId);
    if (!gateway) {
      res.status(403).json({ success: false, error: "Gateway not found or access denied" });
      return;
    }

    emitToGateway(gatewayId, "gateway:exit_registration", {});

    await prisma.gateway.update({
      where: { gateway_id: gatewayId },
      data: { status: "ONLINE" },
    });

    logger.info(`[GATEWAY] Pairing stopped: ${gatewayId}`);
    res.status(200).json({ success: true });
  } catch (error) {
    logger.error("[GATEWAY] stopPairing error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
}

export async function updateNodeConfig(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.user_id;
    if (!userId) {
      res.status(401).json({ success: false, error: "Authentication required" });
      return;
    }

    const nodeId = getStringParam(req.params.nodeId);
    if (!nodeId) {
      res.status(400).json({ success: false, error: "Node ID is required" });
      return;
    }

    // Kullanicinin node'a erisimi var mi kontrol et
    // (node -> zone -> field -> farm -> user_id VEYA node -> gateway -> farm -> user_id)
    const node = await prisma.sensorNode.findUnique({
      where: { node_id: nodeId },
      include: {
        zone: {
          include: {
            field: {
              include: { farm: true },
            },
          },
        },
        gateway: {
          include: { farm: true },
        },
      },
    });

    if (!node) {
      res.status(404).json({ success: false, error: "Sensor node not found" });
      return;
    }

    const ownerViaZone = node.zone?.field?.farm?.user_id === userId;
    const ownerViaGateway = node.gateway?.farm?.user_id === userId;
    if (!ownerViaZone && !ownerViaGateway) {
      res.status(403).json({ success: false, error: "You do not have access to this node" });
      return;
    }

    // Sadece gonderilen alanlari guncelle
    const {
      sleep_interval_sec,
      min_buffer_cycles,
      max_buffer_cycles,
      temp_threshold,
      hum_threshold,
      soil_threshold,
    } = req.body;

    const updateData: Record<string, unknown> = {};
    if (sleep_interval_sec !== undefined) updateData.sleep_interval_sec = sleep_interval_sec;
    if (min_buffer_cycles !== undefined) updateData.min_buffer_cycles = min_buffer_cycles;
    if (max_buffer_cycles !== undefined) updateData.max_buffer_cycles = max_buffer_cycles;
    if (temp_threshold !== undefined) updateData.temp_threshold = temp_threshold;
    if (hum_threshold !== undefined) updateData.hum_threshold = hum_threshold;
    if (soil_threshold !== undefined) updateData.soil_threshold = soil_threshold;

    const updatedNode = await prisma.sensorNode.update({
      where: { node_id: nodeId },
      data: updateData,
    });

    // Gateway'e konfigurasyon push'u gonder
    const gatewayId = updatedNode.gateway_id;
    if (gatewayId) {
      const config = {
        sleep_interval_sec: updatedNode.sleep_interval_sec,
        min_buffer_cycles: updatedNode.min_buffer_cycles,
        max_buffer_cycles: updatedNode.max_buffer_cycles,
        temp_threshold: updatedNode.temp_threshold,
        hum_threshold: updatedNode.hum_threshold,
        soil_threshold: updatedNode.soil_threshold,
      };

      emitToGateway(gatewayId, "gateway:push_config", {
        device_key: updatedNode.device_key,
        config,
      });

      logger.info(`[GATEWAY] Config pushed to node=${nodeId} via gateway=${gatewayId}`);
    }

    res.status(200).json({
      success: true,
      data: {
        node_id: updatedNode.node_id,
        sleep_interval_sec: updatedNode.sleep_interval_sec,
        min_buffer_cycles: updatedNode.min_buffer_cycles,
        max_buffer_cycles: updatedNode.max_buffer_cycles,
        temp_threshold: updatedNode.temp_threshold,
        hum_threshold: updatedNode.hum_threshold,
        soil_threshold: updatedNode.soil_threshold,
      },
    });
  } catch (error) {
    logger.error("[GATEWAY] updateNodeConfig error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
}

export async function listGateways(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.user_id;
    if (!userId) {
      res.status(401).json({ success: false, error: "Authentication required" });
      return;
    }

    const farms = await prisma.farm.findMany({
      where: { user_id: userId },
      select: { farm_id: true, name: true },
    });

    const farmIds = farms.map((f) => f.farm_id);

    const gateways = await prisma.gateway.findMany({
      where: { farm_id: { in: farmIds } },
      include: {
        farm: { select: { name: true } },
        _count: { select: { sensor_nodes: true } },
      },
    });

    res.status(200).json({
      success: true,
      data: gateways.map((gw) => ({
        gateway_id: gw.gateway_id,
        name: gw.name,
        hardware_serial: gw.hardware_serial,
        mac: gw.hardware_serial,
        status: gw.status,
        is_online: gw.status === "ONLINE",
        firmware_version: gw.firmware_version,
        last_heartbeat: gw.last_heartbeat,
        farm_id: gw.farm_id,
        farm_name: gw.farm?.name,
        sensor_count: gw._count.sensor_nodes,
        sensor_nodes_count: gw._count.sensor_nodes,
      })),
    });
  } catch (error) {
    logger.error("[GATEWAY] listGateways error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
}

export async function uploadFirmware(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.user_id;
    if (!userId) {
      res.status(401).json({ success: false, error: "Authentication required" });
      return;
    }

    const file = (req as any).file;
    const { version, changelog } = req.body;

    if (!file || !version) {
      res.status(400).json({ success: false, error: "Missing file or version" });
      return;
    }

    // Versiyon zaten var mi kontrol et
    const existing = await prisma.gatewayFirmware.findUnique({ where: { version } });
    if (existing) {
      res.status(409).json({ success: false, error: "Version already exists" });
      return;
    }

    // S3'e yukle
    const s3Key = `firmware/gateway/${version}.bin`;
    const bucket = process.env.AWS_S3_BUCKET || "taras-pictures";

    await uploadToS3({
      bucket,
      key: s3Key,
      body: file.buffer,
      contentType: "application/octet-stream",
      metadata: { version, uploadedBy: userId },
    });

    // Veritabanina kaydet
    const fw = await prisma.gatewayFirmware.create({
      data: {
        version,
        s3_key: s3Key,
        file_size: file.size,
        changelog: changelog || null,
        uploaded_by: userId,
      },
    });

    logger.info(`[GATEWAY] Firmware uploaded: v${version} (${file.size} bytes)`);
    res.status(201).json({ success: true, data: { id: fw.id, version, file_size: file.size } });
  } catch (error) {
    logger.error("[GATEWAY] uploadFirmware error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
}

export async function getLatestFirmware(_req: Request, res: Response): Promise<void> {
  try {
    const fw = await prisma.gatewayFirmware.findFirst({
      orderBy: { created_at: "desc" },
    });

    if (!fw) {
      res.status(404).json({ success: false, error: "No firmware uploaded yet" });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        version: fw.version,
        file_size: fw.file_size,
        changelog: fw.changelog,
        created_at: fw.created_at,
      },
    });
  } catch (error) {
    logger.error("[GATEWAY] getLatestFirmware error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
}

export async function triggerOtaUpdate(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.user_id;
    if (!userId) {
      res.status(401).json({ success: false, error: "Authentication required" });
      return;
    }

    const gatewayId = getStringParam(req.params.gatewayId);
    if (!gatewayId) {
      res.status(400).json({ success: false, error: "Gateway ID required" });
      return;
    }

    const gateway = await verifyGatewayAccess(userId, gatewayId);
    if (!gateway) {
      res.status(403).json({ success: false, error: "Gateway not found or access denied" });
      return;
    }

    // Hedef versiyon (belirtilmediyse en son)
    const { version } = req.body;
    const fw = version
      ? await prisma.gatewayFirmware.findUnique({ where: { version } })
      : await prisma.gatewayFirmware.findFirst({ orderBy: { created_at: "desc" } });

    if (!fw) {
      res.status(404).json({ success: false, error: "Firmware version not found" });
      return;
    }

    // Presigned download URL olustur (1 saat gecerli)
    const bucket = process.env.AWS_S3_BUCKET || "taras-pictures";
    const url = await generatePresignedDownloadUrl(bucket, fw.s3_key, 3600);

    // Gateway'e OTA komutu gonder
    emitToGateway(gatewayId, "gateway:ota_update", {
      url,
      version: fw.version,
    });

    logger.info(`[GATEWAY] OTA triggered: ${gatewayId} -> v${fw.version}`);
    res.status(200).json({ success: true, data: { version: fw.version } });
  } catch (error) {
    logger.error("[GATEWAY] triggerOtaUpdate error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
}

export async function listFarms(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.user_id;
    if (!userId) {
      res.status(401).json({ success: false, error: "Authentication required" });
      return;
    }

    const farms = await prisma.farm.findMany({
      where: { user_id: userId },
      select: { farm_id: true, name: true },
    });

    res.status(200).json({ success: true, data: farms });
  } catch (error) {
    logger.error("[GATEWAY] listFarms error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
}

export default {
  registerGateway,
  authenticateGateway,
  getGatewayStatus,
  getGatewayNodes,
  startPairing,
  approveNode,
  rejectNode,
  updateNodeConfig,
  stopPairing,
  listGateways,
  listFarms,
  uploadFirmware,
  getLatestFirmware,
  triggerOtaUpdate,
};
