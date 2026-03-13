import { prisma } from "../config/database";

/**
 * Belirli bir sohbet oturumuna ait geçmiş mesajları getirir.
 * Token maliyetini patlatmamak için sadece son 10 mesajı (5 soru, 5 cevap) çekeriz.
 */
export const getSessionHistory = async (sessionId: string) => {
  try {
    const history = await prisma.chatMessage.findMany({
      where: { session_id: sessionId },
      orderBy: { created_at: 'asc' }, // Eskiden yeniye doğru sırala
      take: 10,
    });
    
    // AWS Bedrock'un (Claude) anlayacağı formata çeviriyoruz
    interface ChatMessageRecord {
        id: string;
        session_id: string;
        sender: 'user' | 'assistant';
        content: string;
        created_at: Date;
    }

    interface BedrockMessage {
        role: 'user' | 'assistant';
        content: Array<{
            type: 'text';
            text: string;
        }>;
    }

    /**
     * Belirli bir sohbet oturumuna ait geçmiş mesajları getirir.
     * Token maliyetini patlatmamak için sadece son 10 mesajı (5 soru, 5 cevap) çekeriz.
     */
    export const getSessionHistory = async (sessionId: string): Promise<BedrockMessage[]> => {
        try {
            const history: ChatMessageRecord[] = await prisma.chatMessage.findMany({
                where: { session_id: sessionId },
                orderBy: { created_at: 'asc' }, // Eskiden yeniye doğru sırala
                take: 10,
            });
            
            // AWS Bedrock'un (Claude) anlayacağı formata çeviriyoruz
            return history.map(msg => ({
                role: msg.sender === 'user' ? 'user' : 'assistant',
                // DİKKAT: Şemana uygun olarak msg.content kullanıldı
                content: [{ type: 'text', text: msg.content || "" }] 
            }));
        } catch (error) {
            console.error("Hafıza çekme hatası:", error);
            return []; // Hata olursa geçmiş yokmuş gibi davranıp sistemi çökertmeyiz
        }
    };

    /**
     * Kullanıcının veya Asistanın (LLM) mesajını veritabanına kaydeder.
     */
    export const saveMessage = async (sessionId: string, sender: 'user' | 'assistant', messageText: string): Promise<void> => {
        try {
            await prisma.chatMessage.create({
                data: {
                    session_id: sessionId,
                    sender: sender,
                    // DİKKAT: Şemana uygun olarak kolon adı "content" olarak değiştirildi
                    content: messageText, 
                }
            });
        } catch (error) {
            console.error("Mesaj kaydetme hatası:", error);
        }
    };
  } catch (error) {
    console.error("Hafıza çekme hatası:", error);
    return []; // Hata olursa geçmiş yokmuş gibi davranıp sistemi çökertmeyiz
  }
};

/**
 * Kullanıcının veya Asistanın (LLM) mesajını veritabanına kaydeder.
 */
export const saveMessage = async (sessionId: string, sender: 'user' | 'assistant', messageText: string) => {
  try {
    await prisma.chatMessage.create({
      data: {
        session_id: sessionId,
        sender: sender,
        // DİKKAT: Şemana uygun olarak kolon adı "content" olarak değiştirildi
        content: messageText, 
      }
    });
  } catch (error) {
    console.error("Mesaj kaydetme hatası:", error);
  }
};