import prisma from "../config/database";
import logger from "../utils/logger";

interface ChatHistoryMessage {
  role: "user" | "model";
  content: string;
}

/**
 * Belirli bir sohbet oturumuna ait geçmiş mesajları getirir.
 * Token maliyetini patlatmamak için sadece son 10 mesajı çekeriz.
 */
export const getSessionHistory = async (sessionId: string): Promise<ChatHistoryMessage[]> => {
  try {
    const history = await prisma.chatMessage.findMany({
      where: { session_id: sessionId },
      orderBy: { created_at: "asc" },
      take: 10,
    });

    return history.map((msg) => ({
      role: (msg.sender === "user" ? "user" : "model") as "user" | "model",
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
