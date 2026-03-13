import { Request, Response } from 'express';
import { getZoneContextForLLM } from '../services/tarasData.service';
import { generateAdvisory } from '../services/llm.service';
import prisma from '../config/database'; // Prisma instance'ını doğru import ettiğinden emin ol

export const getTarasAdvice = async (req: Request, res: Response) => {
  try {
    const { zone_id, message, session_id } = req.body;

    // 1. Validasyon
    if (!zone_id || !message) {
      return res.status(400).json({ 
        success: false, 
        error: "Eksik parametre: 'zone_id' ve 'message' zorunludur." 
      });
    }

    // 2. Session Yönetimi
    let currentSessionId = session_id;
    if (!currentSessionId) {
      // Dünkü Prisma hatasını almamak için model isminin doğruluğunu kontrol et (chatSession mı ChatSession mı?)
      const newSession = await prisma.chatSession.create({ 
        data: {
          // Gerekirse buraya userId gibi alanlar eklenebilir
        } 
      });
      currentSessionId = newSession.id; // Veritabanındaki PK ismine göre 'id' veya 'session_id' yap
    }

    // 3. Veri Çekme (Tarla verileri: nem, sıcaklık vb.)
    const zoneContext = await getZoneContextForLLM(zone_id);

    if (zoneContext && 'error' in zoneContext) {
      return res.status(404).json({ success: false, error: zoneContext.error });
    }

    // 4. LLM Üretimi (AWS Bedrock veya diğer servis)
    const llmResponse = await generateAdvisory(zoneContext, message, currentSessionId);

    // 5. Başarılı Yanıt
    return res.status(200).json({
      success: true,
      session_id: currentSessionId,
      reply: llmResponse
    });

  } catch (error) {
    console.error("Advisory Controller Hatası:", error);
    return res.status(500).json({ 
      success: false, 
      error: "Asistan şu an cevap veremiyor, lütfen teknik ekiple iletişime geçin." 
    });
  }
};