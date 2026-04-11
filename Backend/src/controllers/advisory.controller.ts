import { Request, Response, NextFunction } from "express";
import { getFieldContextForLLM } from "../services/tarasData.service";
import { generateAdvisory, generateAdvisoryStream } from "../services/llm.service";
import { saveMessage, getFieldSession, getSessionMessages } from "../services/chatMemory.service";
import { asyncHandler } from "../middleware/error.middleware";
import prisma from "../config/database";
import logger from "../utils/logger";

// Provider gecisi — LLM_PROVIDER env ile kontrol edilir
// "groq" (varsayilan) veya baska bir deger (extended modul gerektirir)
const LLM_MODE = process.env.LLM_PROVIDER || "groq";
let ext: any = null;
if (LLM_MODE !== "groq") {
  try {
    ext = require("../services/llm.extended");
    logger.info(`[LLM] extended provider aktif`);
  } catch { logger.info("[LLM] groq provider aktif"); }
}

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
    await saveMessage(currentSessionId, "user", message);

    let llmResponse: string;

    if (ext) {
      llmResponse = await ext.generateAdvisory(userId, field_id, message, currentSessionId);
    } else {
      const fieldContext = await getFieldContextForLLM(field_id);
      if ("error" in fieldContext) {
        res.status(404).json({ success: false, error: fieldContext.error });
        return;
      }
      llmResponse = await generateAdvisory(fieldContext, message, currentSessionId);
    }

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
    await saveMessage(currentSessionId, "user", message);

    // SSE basliklari
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    try {
      let fullText: string;

      if (ext) {
        fullText = await ext.generateAdvisoryStream(
          userId, field_id, message, currentSessionId,
          (chunk: string) => res.write(`data: ${JSON.stringify({ chunk })}\n\n`),
          (status: string) => res.write(`data: ${JSON.stringify({ status })}\n\n`),
          (screen: string) => res.write(`data: ${JSON.stringify({ navigate: screen })}\n\n`),
        );
      } else {
        const fieldContext = await getFieldContextForLLM(field_id);
        if ("error" in fieldContext) {
          res.write(`data: ${JSON.stringify({ error: fieldContext.error })}\n\n`);
          res.end();
          return;
        }
        fullText = await generateAdvisoryStream(
          fieldContext, message, currentSessionId,
          (chunk) => res.write(`data: ${JSON.stringify({ chunk })}\n\n`),
        );
      }

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

// Belirli bir session veya tarla icin chat session getir
export const getFieldChatSession = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const userId = (req as any).user?.user_id;
    const fieldId = req.query.field_id as string;
    const sessionId = req.query.session_id as string;

    if (!userId || (!fieldId && !sessionId)) {
      res.status(400).json({ success: false, error: "field_id veya session_id gerekli." });
      return;
    }

    let session: any;

    if (sessionId) {
      session = await prisma.chatSession.findFirst({
        where: { session_id: sessionId, user_id: userId },
      });
    } else {
      session = await getFieldSession(userId, fieldId);
    }

    if (!session) {
      logger.debug(`[CHAT] session yok`);
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

// Kullanicinin tum sohbet gecmisini getir
export const getChatHistory = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const userId = (req as any).user?.user_id;
    if (!userId) {
      res.status(401).json({ success: false, error: "Auth required" });
      return;
    }

    try {
      const { getUserSessions } = require("../services/chatMemory.service");
      const sessions = await getUserSessions(userId);

      res.status(200).json({
        success: true,
        data: sessions.map((s: any) => ({
          session_id: s.session_id,
          field_name: s.field?.name ?? "—",
          started_at: s.started_at,
          last_message: s.messages?.[0]?.content?.slice(0, 100) ?? "",
          last_message_at: s.messages?.[0]?.created_at ?? null,
        })),
      });
    } catch {
      res.status(200).json({ success: true, data: [] });
    }
  },
);
