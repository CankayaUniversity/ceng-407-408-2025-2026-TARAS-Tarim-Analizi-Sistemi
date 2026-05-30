import { Request, Response, NextFunction } from "express";
import { getFieldContextForLLM } from "../services/tarasData.service";
import { generateAdvisory, generateAdvisoryStream } from "../services/llm.service";
import { saveMessage, getFieldSession, getSessionMessages } from "../services/chatMemory.service";
import { asyncHandler } from "../middleware/error.middleware";
import { resolveFieldAccess } from "../services/accessService";
import type { TimetableFilterPayload, ChatAction } from "../services/llm/toolExecutor";
import prisma from "../config/database";
import logger from "../utils/logger";

// Provider gecisi — LLM_PROVIDER env ile kontrol edilir
//   "anthropic" → ext.generateAdvisory (Haiku 4.5 agentic)
//   "groq"      → ext.generateAdvisoryGroq (Llama 4 Scout agentic, ayni tool loop)
//   ext yoksa   → committed llm.service.ts (non-agentic Groq, takim uyelikleri icin fallback)
const LLM_MODE = process.env.LLM_PROVIDER || "groq";
let ext: any = null;
try {
  ext = require("../services/llm/llm.extended");
  logger.info(`[LLM] extended aktif (mode=${LLM_MODE})`);
} catch {
  logger.info(`[LLM] extended bulunamadi, committed groq (non-agentic) kullaniliyor`);
}

const useAgenticGroq = ext && LLM_MODE === "groq";
const useAgenticAnthropic = ext && LLM_MODE !== "groq";

// Kaydedilmis mesaj metadata'sindan ({ events: [...] }) ham SSE event dizisini cikar.
// Gecersiz/yok ise undefined — mobil bunu butonsuz mesaj olarak ele alir.
function extractEvents(metadata: unknown): Record<string, unknown>[] | undefined {
  if (
    metadata &&
    typeof metadata === "object" &&
    Array.isArray((metadata as { events?: unknown }).events)
  ) {
    return (metadata as { events: Record<string, unknown>[] }).events;
  }
  return undefined;
}

async function resolveSession(
  sessionId: string | undefined,
  userId: string | undefined,
  fieldId: string,
): Promise<string> {
  if (sessionId && userId) {
    // Session sahibini dogrula — baska kullanicinin session'ina yazmayi engelle
    const owned = await prisma.chatSession.findFirst({
      where: { session_id: sessionId, user_id: userId },
      select: { session_id: true },
    });
    if (owned) {
      logger.debug(`[CHAT] mevcut session: ${sessionId.slice(0, 8)}...`);
      return owned.session_id;
    }
    logger.debug(`[CHAT] session sahibi dogrulanamadi, yeni session aciliyor`);
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
    if (!userId) {
      res.status(401).json({ success: false, error: "Auth required" });
      return;
    }
    // Tarla erisim kontrolu — sahip VEYA paydas. Paydas sohbeti buradan gecer; ayni zamanda
    // eskiden hic kontrol olmayan IDOR'u kapatir.
    if (!(await resolveFieldAccess(userId, field_id))) {
      res.status(403).json({ success: false, error: "Bu tarlaya erişiminiz yok." });
      return;
    }

    const currentSessionId = await resolveSession(session_id, userId, field_id);
    await saveMessage(currentSessionId, "user", message);

    let llmResponse: string;

    if (useAgenticAnthropic) {
      llmResponse = await ext.generateAdvisory(userId, field_id, message, currentSessionId);
    } else if (useAgenticGroq) {
      llmResponse = await ext.generateAdvisoryGroq(userId, field_id, message, currentSessionId);
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
    if (!userId) {
      res.status(401).json({ success: false, error: "Auth required" });
      return;
    }
    if (!(await resolveFieldAccess(userId, field_id))) {
      res.status(403).json({ success: false, error: "Bu tarlaya erişiminiz yok." });
      return;
    }

    const currentSessionId = await resolveSession(session_id, userId, field_id);
    await saveMessage(currentSessionId, "user", message);

    // SSE basliklari
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    try {
      let fullText: string;

      // Mesaj-alti buton ureten event'ler — SSE ile gonderirken AYRICA topla; asistan
      // mesajinin metadata'sina kaydedilir, boylece sohbet yeniden acildiginda butonlar
      // geri gelir. Saklanan sekil ham SSE yuku (mobil canli stream'le ayni parser'i kullanir).
      const collectedActions: Record<string, unknown>[] = [];
      const emit = (event: Record<string, unknown>): void => {
        collectedActions.push(event);
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      };

      // navigate / highlight — ekran/zone vurgusu
      const emitNavigate = (
        screen: string,
        section: string | null,
        zoneId?: string,
      ): void => {
        emit({ navigate: screen, section, ...(zoneId ? { zone_id: zoneId } : {}) });
      };

      // set_timetable_filters → ekrani Cizelge sekmesine acar (navigate) + filtre yukunu tasir.
      const emitSetFilters = (filters: TimetableFilterPayload): void => {
        emit({ navigate: "timetable", section: null, set_filters: filters });
      };

      // Buton ile onaylanan eylemler (select_field / set_theme / set_language / add_carbon_log).
      const emitAction = (action: ChatAction): void => {
        emit({ action });
      };

      if (useAgenticAnthropic) {
        fullText = await ext.generateAdvisoryStream(
          userId, field_id, message, currentSessionId,
          (chunk: string) => res.write(`data: ${JSON.stringify({ chunk })}\n\n`),
          (status: string) => res.write(`data: ${JSON.stringify({ status })}\n\n`),
          emitNavigate,
          emitSetFilters,
          emitAction,
        );
      } else if (useAgenticGroq) {
        fullText = await ext.generateAdvisoryStreamGroq(
          userId, field_id, message, currentSessionId,
          (chunk: string) => res.write(`data: ${JSON.stringify({ chunk })}\n\n`),
          (status: string) => res.write(`data: ${JSON.stringify({ status })}\n\n`),
          emitNavigate,
          emitSetFilters,
          emitAction,
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

      await saveMessage(
        currentSessionId,
        "assistant",
        fullText,
        collectedActions.length > 0 ? { events: collectedActions } : undefined,
      );
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

    // fieldId ile cagriliyorsa erisim dogrula (sahip VEYA paydas). sessionId yolu zaten
    // user_id ile filtreli oldugu icin izolasyon korunur.
    if (fieldId && !(await resolveFieldAccess(userId, fieldId))) {
      res.status(403).json({ success: false, error: "Bu tarlaya erişiminiz yok." });
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
          // Kaydedilmis aksiyon butonlari (ham SSE event'leri) — mobil canli stream'le
          // ayni parser'la butona cevirir; yoksa undefined.
          events: extractEvents((m as { metadata?: unknown }).metadata),
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

// Bir sohbet oturumunu sil — kullanici yalnizca KENDI oturumlarini silebilir.
// Mesajlar + oturum atomik silinir (FK cascade tanimli olmasa bile guvenli).
export const deleteChatSession = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const userId = (req as any).user?.user_id;
    const sessionId = req.params.sessionId as string;

    if (!userId) {
      res.status(401).json({ success: false, error: "Auth required" });
      return;
    }
    if (!sessionId) {
      res.status(400).json({ success: false, error: "session_id gerekli." });
      return;
    }

    const owned = await prisma.chatSession.findFirst({
      where: { session_id: sessionId, user_id: userId },
      select: { session_id: true },
    });
    if (!owned) {
      res.status(404).json({ success: false, error: "Sohbet bulunamadı." });
      return;
    }

    await prisma.$transaction([
      prisma.chatMessage.deleteMany({ where: { session_id: sessionId } }),
      prisma.chatSession.deleteMany({ where: { session_id: sessionId, user_id: userId } }),
    ]);

    logger.debug(`[CHAT] session silindi: ${sessionId.slice(0, 8)}... user=${userId.slice(0, 8)}...`);
    res.status(200).json({ success: true });
  },
);
