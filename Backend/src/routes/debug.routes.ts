import { Router, Request, Response } from "express";
import { isDatabaseConnected } from "../config/database";
import { getDebugConfig } from "../config/debug";
import prisma from "../config/database";
import logger from "../utils/logger";

const router = Router();

/**
 * GET /api/debug/status
 * Sistem durumu: DB, uptime, config, bellek kullanimi
 */
router.get("/status", async (_req: Request, res: Response): Promise<void> => {
  const memUsage = process.memoryUsage();

  let dbLatency: number | null = null;
  let dbStatus = "disconnected";
  try {
    const dbStart = Date.now();
    await prisma.role.findFirst();
    dbLatency = Date.now() - dbStart;
    dbStatus = "connected";
  } catch {
    dbStatus = "error";
  }

  res.json({
    success: true,
    data: {
      uptime_seconds: Math.floor(process.uptime()),
      node_version: process.version,
      database: {
        status: dbStatus,
        connected: isDatabaseConnected(),
        latency_ms: dbLatency,
      },
      memory: {
        rss_mb: Math.round(memUsage.rss / 1024 / 1024),
        heap_used_mb: Math.round(memUsage.heapUsed / 1024 / 1024),
        heap_total_mb: Math.round(memUsage.heapTotal / 1024 / 1024),
      },
      config: getDebugConfig(),
    },
  });
});

/**
 * GET /api/debug/zone/:zoneId
 * Belirli bir zone'un ham verilerini goster (LLM context dahil)
 */
router.get("/zone/:zoneId", async (req: Request, res: Response): Promise<void> => {
  const zoneId = req.params.zoneId as string | undefined;
  if (!zoneId) {
    res.status(400).json({ success: false, error: "zoneId gerekli" });
    return;
  }

  try {
    const zone = await prisma.zone.findUnique({
      where: { zone_id: zoneId },
      include: {
        details: true,
        sensor_nodes: {
          include: {
            readings: {
              orderBy: { created_at: "desc" },
              take: 3,
            },
          },
        },
        jobs: {
          orderBy: { created_at: "desc" },
          take: 3,
        },
      },
    });

    if (!zone) {
      res.status(404).json({ success: false, error: "Zone bulunamadi" });
      return;
    }

    res.json({ success: true, data: zone });
  } catch (error) {
    logger.error("Debug zone hatasi:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Bilinmeyen hata",
    });
  }
});

/**
 * GET /api/debug/sessions
 * Son sohbet oturumlarini listele
 */
router.get("/sessions", async (_req: Request, res: Response): Promise<void> => {
  try {
    const sessions = await prisma.chatSession.findMany({
      orderBy: { started_at: "desc" },
      take: 10,
      include: {
        messages: {
          orderBy: { created_at: "desc" },
          take: 5,
        },
      },
    });

    res.json({ success: true, data: sessions });
  } catch (error) {
    logger.error("Debug sessions hatasi:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Bilinmeyen hata",
    });
  }
});

export default router;
