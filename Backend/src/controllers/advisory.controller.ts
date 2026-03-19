import { Request, Response, NextFunction } from "express";
import { getFieldContextForLLM } from "../services/tarasData.service";
import { generateAdvisory, generateAdvisoryStream } from "../services/llm.service";
import { saveMessage, getFieldSession, getSessionMessages } from "../services/chatMemory.service";
import { asyncHandler } from "../middleware/error.middleware";
import prisma from "../config/database";
import logger from "../utils/logger";

// Session olustur veya mevcut olanini kullan
async function resolveSession(
  sessionId: string | undefined,
  userId: string | undefined,
  fieldId: string,
): Promise<string> {
  if (sessionId) {
    logger.debug(`[CHAT] mevcut session: ${sessionId.slice(0, 8)}...`);
    return sessionId;
  }
  const newSession = await prisma.chatSession.create({
    data: { user_id: userId, field_id: fieldId },
  });
  logger.debug(`[CHAT] yeni session: ${newSession.session_id.slice(0, 8)}... field=${fieldId.slice(0, 8)}...`);
  return newSession.session_id;
}

export const getTarasAdvice = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const { field_id, message, session_id } = req.body;

    if (!field_id || !message) {
      res.status(400).json({
        success: false,
        error: "Eksik parametre: 'field_id' ve 'message' zorunludur.",
      });
      return;
    }

    const userId = (req as any).user?.user_id;
    const currentSessionId = await resolveSession(session_id, userId, field_id);

    const [, fieldContext] = await Promise.all([
      saveMessage(currentSessionId, "user", message),
      getFieldContextForLLM(field_id),
    ]);

    if ("error" in fieldContext) {
      res.status(404).json({ success: false, error: fieldContext.error });
      return;
    }

    const llmResponse = await generateAdvisory(fieldContext, message, currentSessionId);
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
    const { field_id, message, session_id } = req.body;

    if (!field_id || !message) {
      res.status(400).json({
        success: false,
        error: "Eksik parametre: 'field_id' ve 'message' zorunludur.",
      });
      return;
    }

    const userId = (req as any).user?.user_id;
    const currentSessionId = await resolveSession(session_id, userId, field_id);

    const [, fieldContext] = await Promise.all([
      saveMessage(currentSessionId, "user", message),
      getFieldContextForLLM(field_id),
    ]);

    if ("error" in fieldContext) {
      res.status(404).json({ success: false, error: fieldContext.error });
      return;
    }

    // SSE basliklari
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    try {
      const fullText = await generateAdvisoryStream(
        fieldContext,
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
      logger.error("[LLM] stream hatasi:", error);
      res.write(`data: ${JSON.stringify({ error: "LLM hatası oluştu." })}\n\n`);
    }

    res.end();
  },
);

// Kullanicinin belirli bir tarla icin mevcut chat session'ini getir
export const getFieldChatSession = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const userId = (req as any).user?.user_id;
    const fieldId = req.query.field_id as string;

    if (!userId || !fieldId) {
      res.status(400).json({ success: false, error: "field_id gerekli." });
      return;
    }

    const session = await getFieldSession(userId, fieldId);

    if (!session) {
      logger.debug(`[CHAT] session yok: field=${fieldId.slice(0, 8)}...`);
      res.status(200).json({
        success: true,
        data: { session_id: null, messages: [] },
      });
      return;
    }

    const messages = await getSessionMessages(session.session_id);
    logger.debug(`[CHAT] session yuklendi: ${session.session_id.slice(0, 8)}... ${messages.length} mesaj`);

    res.status(200).json({
      success: true,
      data: {
        session_id: session.session_id,
        messages: messages.map((m) => ({
          id: m.message_id.toString(),
          text: m.content || "",
          sender: m.sender === "user" ? "user" : "assistant",
          timestamp: m.created_at,
        })),
      },
    });
  },
);
