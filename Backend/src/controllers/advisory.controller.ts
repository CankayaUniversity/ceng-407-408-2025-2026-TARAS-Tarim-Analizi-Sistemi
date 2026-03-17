import { Request, Response, NextFunction } from "express";
import { getZoneContextForLLM } from "../services/tarasData.service";
import { generateAdvisory, generateAdvisoryStream } from "../services/llm.service";
import { saveMessage } from "../services/chatMemory.service";
import { asyncHandler } from "../middleware/error.middleware";
import prisma from "../config/database";
import logger from "../utils/logger";

export const getTarasAdvice = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const { zone_id, message, session_id } = req.body;

    if (!zone_id || !message) {
      res.status(400).json({
        success: false,
        error: "Eksik parametre: 'zone_id' ve 'message' zorunludur.",
      });
      return;
    }

    // Session yönetimi
    let currentSessionId = session_id as string | undefined;
    if (!currentSessionId) {
      const newSession = await prisma.chatSession.create({ data: {} });
      currentSessionId = newSession.session_id;
    }

    // Kullanıcı mesajını kaydet + tarla verilerini çek (paralel)
    const [, zoneContext] = await Promise.all([
      saveMessage(currentSessionId, "user", message),
      getZoneContextForLLM(zone_id),
    ]);

    if ("error" in zoneContext) {
      res.status(404).json({ success: false, error: zoneContext.error });
      return;
    }

    // LLM yanıtı üret
    const llmResponse = await generateAdvisory(zoneContext, message, currentSessionId);

    // Asistan yanıtını kaydet
    await saveMessage(currentSessionId, "assistant", llmResponse);

    res.status(200).json({
      success: true,
      session_id: currentSessionId,
      reply: llmResponse,
    });
  },
);

export const getTarasAdviceStream = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const { zone_id, message, session_id } = req.body;

    if (!zone_id || !message) {
      res.status(400).json({
        success: false,
        error: "Eksik parametre: 'zone_id' ve 'message' zorunludur.",
      });
      return;
    }

    // Session yönetimi
    let currentSessionId = session_id as string | undefined;
    if (!currentSessionId) {
      const newSession = await prisma.chatSession.create({ data: {} });
      currentSessionId = newSession.session_id;
    }

    // Kullanıcı mesajını kaydet + tarla verilerini çek (paralel)
    const [, zoneContext] = await Promise.all([
      saveMessage(currentSessionId, "user", message),
      getZoneContextForLLM(zone_id),
    ]);

    if ("error" in zoneContext) {
      res.status(404).json({ success: false, error: zoneContext.error });
      return;
    }

    // SSE başlıkları
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    try {
      const fullText = await generateAdvisoryStream(
        zoneContext,
        message,
        currentSessionId,
        (chunk) => {
          res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
        },
      );

      await saveMessage(currentSessionId, "assistant", fullText);
      res.write(
        `data: ${JSON.stringify({ done: true, session_id: currentSessionId })}\n\n`,
      );
    } catch (error) {
      logger.error("Stream LLM Hatası:", error);
      res.write(`data: ${JSON.stringify({ error: "LLM hatası oluştu." })}\n\n`);
    }

    res.end();
  },
);
