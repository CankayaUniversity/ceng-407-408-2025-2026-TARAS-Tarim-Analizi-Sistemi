import { GoogleGenAI } from "@google/genai";
import { getSessionHistory } from "./chatMemory.service";
import logger from "../utils/logger";

if (!process.env.GEMINI_API_KEY) {
  logger.warn("GEMINI_API_KEY ayarlanmamis — LLM cagrilari basarisiz olacak");
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_PROMPT = `Sen TARAS (Tarımsal Karar Destek Sistemi) için çalışan uzman bir ziraat asistanısın.

KESİN KURALLAR:
1. Sana verilen [TARAS SİSTEM VERİSİ] dışındaki hiçbir bilgiyi kullanarak sulama, ilaç veya gübre tavsiyesi verme.
2. Çiftçi teknik olmayan bir dilde soru sorabilir, ona her zaman saygılı, net ve profesyonel bir dille (Sen/Siz) hitap et.
3. Kural motorunun aldığı kararın ("son_sistem_karari") NEDENİNİ, sistem eşiklerini ("sistem_esikleri") ve mevcut durumu ("mevcut_durum") karşılaştırarak açıkla.
4. Eğer çiftçinin sorusunun cevabı verilerde yoksa, tahmin yürütme! Sadece "Mevcut sistem verilerinde bu soruya dair bir ölçüm bulunmuyor" de.
5. Cevabın kısa ve doğrudan konuya yönelik olsun.`;

const CHAT_CONFIG = {
  model: "gemini-3-flash-preview",
  config: {
    systemInstruction: SYSTEM_PROMPT,
    maxOutputTokens: 2048,
    temperature: 0.1,
  },
};

const buildPrompt = (tarasContext: object, userMessage: string): string => `
[TARAS SİSTEM VERİSİ]
${JSON.stringify(tarasContext, null, 2)}

[ÇİFTÇİNİN SORUSU]
${userMessage}
`;

const buildGeminiHistory = (
  history: Awaited<ReturnType<typeof getSessionHistory>>,
) =>
  history.map((msg) => ({
    role: msg.role as "user" | "model",
    parts: [{ text: msg.content }],
  }));

/**
 * TARAS verilerini ve çiftçinin sorusunu alıp Gemini'ye gönderir.
 * Sohbet geçmişini de dahil ederek bağlamsal yanıt üretir.
 */
export const generateAdvisory = async (
  tarasContext: object,
  userMessage: string,
  sessionId: string,
): Promise<string> => {
  try {
    const start = Date.now();
    const history = await getSessionHistory(sessionId);
    logger.debug(`[LLM] gecmis: ${history.length} mesaj, sorgu: ${userMessage.slice(0, 60)}...`);

    const chat = ai.chats.create({
      ...CHAT_CONFIG,
      history: buildGeminiHistory(history),
    });
    const response = await chat.sendMessage({
      message: buildPrompt(tarasContext, userMessage),
    });

    const duration = Date.now() - start;
    const text = response.text ?? "Yanıt alınamadı.";
    logger.debug(`[LLM] yanit: ${duration}ms, ${text.length} karakter`);
    return text;
  } catch (error) {
    logger.error("[LLM] hata:", error);
    return "Şu anda TARAS yapay zeka asistanına ulaşılamıyor. Lütfen daha sonra tekrar deneyin.";
  }
};

/**
 * Gemini yanıtını chunk chunk okuyarak onChunk callback'i çağırır.
 * Tam metni döndürür.
 */
export const generateAdvisoryStream = async (
  tarasContext: object,
  userMessage: string,
  sessionId: string,
  onChunk: (text: string) => void,
): Promise<string> => {
  const start = Date.now();
  const history = await getSessionHistory(sessionId);
  logger.debug(`[LLM] "${userMessage.slice(0, 50)}..." (gecmis: ${history.length})`);

  const chat = ai.chats.create({
    ...CHAT_CONFIG,
    history: buildGeminiHistory(history),
  });

  const stream = await chat.sendMessageStream({
    message: buildPrompt(tarasContext, userMessage),
  });

  let fullText = "";
  let chunkCount = 0;
  let firstChunkAt = 0;
  for await (const chunk of stream) {
    const text = chunk.text ?? "";
    if (text) {
      if (!firstChunkAt) {
        firstChunkAt = Date.now() - start;
        logger.debug(`[LLM] ilk token: ${firstChunkAt}ms`);
      }
      fullText += text;
      chunkCount++;
      onChunk(text);
    }
  }

  const total = Date.now() - start;
  logger.debug(`[LLM] bitti: ${total}ms toplam, ${firstChunkAt}ms TTFT, ${chunkCount} chunk, ${fullText.length} chr`);
  return fullText;
};
