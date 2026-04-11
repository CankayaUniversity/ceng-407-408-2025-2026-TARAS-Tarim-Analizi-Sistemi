import prisma from "../config/database";
import logger from "../utils/logger";

interface ChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Belirli bir sohbet oturumuna ait geçmiş mesajları getirir.
 * Token maliyetini patlatmamak için sadece son 10 mesajı çekeriz.
 */
export const getSessionHistory = async (sessionId: string): Promise<ChatHistoryMessage[]> => {
  try {
    // Son 10 mesaji cek (desc) ve kronolojik siraya cevir
    const history = await prisma.chatMessage.findMany({
      where: { session_id: sessionId },
      orderBy: { created_at: "desc" },
      take: 10,
    });

    return history.reverse().map((msg) => ({
      role: (msg.sender === "user" ? "user" : "assistant") as "user" | "assistant",
      content: msg.content || "",
    }));
  } catch (error) {
    logger.error("Hafıza çekme hatası:", error);
    return [];
  }
};

/**
 * Kullanıcının veya asistanın mesajını veritabanına kaydeder.
 */
export const saveMessage = async (
  sessionId: string,
  sender: "user" | "assistant",
  messageText: string,
): Promise<void> => {
  try {
    await prisma.chatMessage.create({
      data: {
        session_id: sessionId,
        sender: sender,
        content: messageText,
      },
    });
  } catch (error) {
    logger.error("Mesaj kaydetme hatası:", error);
  }
};

/**
 * Kullanicinin belirli tarla icin en son chat session'ini bul
 */
export const getFieldSession = async (
  userId: string,
  fieldId: string,
) => {
  return prisma.chatSession.findFirst({
    where: { user_id: userId, field_id: fieldId },
    orderBy: { started_at: "desc" },
  });
};

/**
 * Session'a ait tum mesajlari getir (son 50)
 */
export const getSessionMessages = async (sessionId: string) => {
  return prisma.chatMessage.findMany({
    where: { session_id: sessionId },
    orderBy: { created_at: "asc" },
    take: 50,
  });
};

// Kullanicinin tum sohbet oturumlarini getir
export const getUserSessions = async (userId: string) => {
  return prisma.chatSession.findMany({
    where: { user_id: userId },
    orderBy: { started_at: "desc" },
    take: 20,
    include: {
      field: { select: { name: true } },
      messages: {
        orderBy: { created_at: "desc" },
        take: 1,
        select: { content: true, created_at: true },
      },
    },
  });
};
