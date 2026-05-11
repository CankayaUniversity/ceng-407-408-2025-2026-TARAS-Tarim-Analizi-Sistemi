import OpenAI from "openai";
import { getSessionHistory } from "./chatMemory.service";
import logger from "../utils/logger";

if (!process.env.GROQ_API_KEY) {
  logger.warn("GROQ_API_KEY ayarlanmamis — LLM cagrilari basarisiz olacak");
}

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

const SYSTEM_PROMPT = `Sen TARAS (Tarımsal Karar Destek Sistemi) için çalışan uzman bir ziraat asistanısın.

KESİN KURALLAR:
1. Sana verilen [TARAS SİSTEM VERİSİ] dışındaki hiçbir bilgiyi kullanarak sulama, ilaç veya gübre tavsiyesi verme.
2. Çiftçi teknik olmayan bir dilde soru sorabilir, ona her zaman saygılı, net ve profesyonel bir dille (Sen/Siz) hitap et.
3. Kural motorunun aldığı kararın ("son_sistem_karari") NEDENİNİ, sistem eşiklerini ("sistem_esikleri") ve mevcut durumu ("mevcut_durum") karşılaştırarak açıkla.
4. Eğer çiftçinin sorusunun cevabı verilerde yoksa, tahmin yürütme! Sadece "Mevcut sistem verilerinde bu soruya dair bir ölçüm bulunmuyor" de.
5. Cevabın kısa ve doğrudan konuya yönelik olsun.`;

const MODEL = "qwen/qwen3-32b";

/** Qwen3 <think>...</think> bloklarini temizle */
const stripThinkTags = (text: string): string => {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  return cleaned || text;
};

const buildMessages = (
  tarasContext: object,
  userMessage: string,
  history: { role: string; content: string }[],
): OpenAI.Chat.ChatCompletionMessageParam[] => [
  { role: "system", content: SYSTEM_PROMPT },
  { role: "system", content: `[TARAS SİSTEM VERİSİ]\n${JSON.stringify(tarasContext, null, 2)}` },
  ...history.map((msg) => ({
    role: (msg.role === "user" ? "user" : "assistant") as "user" | "assistant",
    content: msg.content,
  })),
  { role: "user", content: userMessage },
];

/**
 * TARAS verilerini ve çiftçinin sorusunu alıp Groq'a gönderir.
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

    const response = await groq.chat.completions.create({
      model: MODEL,
      messages: buildMessages(tarasContext, userMessage, history),
      temperature: 0.7,
      max_tokens: 2048,
    });

    const raw = response.choices[0]?.message?.content ?? "Yanıt alınamadı.";
    const text = stripThinkTags(raw);

    const duration = Date.now() - start;
    logger.debug(`[LLM] yanit: ${duration}ms, ${text.length} karakter`);
    return text;
  } catch (error) {
    logger.error("[LLM] hata:", error);
    return "Şu anda TARAS yapay zeka asistanına ulaşılamıyor. Lütfen daha sonra tekrar deneyin.";
  }
};

/**
 * Groq yanitini chunk chunk okuyarak onChunk callback'i cagirir.
 * Tam metni dondurur. Qwen3 <think> bloklari istemciye gonderilmez.
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

  const stream = await groq.chat.completions.create({
    model: MODEL,
    messages: buildMessages(tarasContext, userMessage, history),
    temperature: 0.7,
    max_tokens: 2048,
    stream: true,
  });

  let fullText = "";
  let chunkCount = 0;
  let firstChunkAt = 0;
  // Buffer chunks until we determine whether a <think> block is present
  let buffer = "";
  let streaming = false;

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content ?? "";
    if (!delta) continue;

    if (!firstChunkAt) {
      firstChunkAt = Date.now() - start;
      logger.debug(`[LLM] ilk token: ${firstChunkAt}ms`);
    }
    fullText += delta;
    chunkCount++;

    // Once past any think block, stream directly
    if (streaming) {
      onChunk(delta);
      continue;
    }

    // Buffer until we know if there's a think block
    buffer += delta;

    const thinkEnd = buffer.indexOf("</think>");
    if (thinkEnd !== -1) {
      // Think block ended — emit content after it
      const afterThink = buffer.substring(thinkEnd + 8).trimStart();
      streaming = true;
      if (afterThink) onChunk(afterThink);
      continue;
    }

    // If buffer clearly doesn't start with <think>, no think block — flush
    const trimmed = buffer.trimStart();
    if (trimmed.length >= 7 && !trimmed.startsWith("<think")) {
      streaming = true;
      onChunk(buffer);
      continue;
    }
    // Not starting with '<' at all — flush immediately
    if (trimmed.length > 0 && !trimmed.startsWith("<")) {
      streaming = true;
      onChunk(buffer);
    }
  }

  // If entire response was buffered (e.g. only a think block, or very short)
  if (!streaming && buffer) {
    const cleaned = stripThinkTags(buffer);
    if (cleaned) onChunk(cleaned);
  }

  const total = Date.now() - start;
  logger.debug(`[LLM] bitti: ${total}ms toplam, ${firstChunkAt}ms TTFT, ${chunkCount} chunk, ${fullText.length} chr`);

  return stripThinkTags(fullText);
};
