import { Request, Response, NextFunction } from "express";
import { getZoneContextForLLM } from "../services/tarasData.service";
import { generateAdvisory } from "../services/llm.service";
import { saveMessage } from "../services/chatMemory.service";
import { asyncHandler } from "../middleware/error.middleware";
import prisma from "../config/database";

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
