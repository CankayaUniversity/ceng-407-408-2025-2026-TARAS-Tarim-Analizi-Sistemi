// LLM servisi — Anthropic Haiku 4.5 + arac kullanim dongusu
// Groq fallback: LLM_PROVIDER=groq ile eski davranisa donulebilir
import Anthropic from "@anthropic-ai/sdk";
import { getSessionHistory } from "../chatMemory.service";
import { getFieldContextForLLM } from "../tarasData.service";
import { anthropic, ANTHROPIC_MODEL, CACHED_SYSTEM_PROMPT, buildPerRequestContext } from "./anthropic.service";
import { TOOL_DEFINITIONS } from "./toolDefinitions";
import { ToolExecutor } from "./toolExecutor";
import { getFieldInventory } from "../dashboardService";
import logger from "../../utils/logger";

const MAX_ITERATIONS = 8;
const LOOP_TIMEOUT_MS = 30000;
// Extended thinking — Haiku 4.5 manual mode (type:"enabled").
// Haiku 4.5 interleaved thinking DESTEKLEMEZ — tek turda birden fazla dusunme
// blogu olusturmaz. Her iterasyon basinda (bizim tool loop'umuzda) model bastan
// dusunur, eylemi verir, biz tool_result doneriz, bir sonraki iterasyon yeniden
// dusunur. Loop yapisi sayesinde "tool cagirir, tekrar dusunur" davranisi
// API seviyesinde olmasa da sistem seviyesinde elde edilir.
// budget_tokens < max_tokens kurali zorunlu. Temperature otomatik 1'e kilitlenir.
const HAIKU_MAX_TOKENS = 8000;
const HAIKU_THINKING_BUDGET = 5000;

// ===== ANTHROPIC (HAIKU 4.5) =====

/**
 * Anthropic arac kullanim dongusu ile yanit uretir.
 * Sonucu chunk chunk SSE ile gondermez — tum yaniti dondurur.
 */
export const generateAdvisory = async (
  userId: string,
  fieldId: string,
  userMessage: string,
  sessionId: string,
): Promise<string> => {
  try {
    const start = Date.now();
    const [history, inventory] = await Promise.all([
      getSessionHistory(sessionId),
      getFieldInventory(userId),
    ]);

    logger.debug(`[LLM] gecmis: ${history.length} mesaj, sorgu: ${userMessage.slice(0, 60)}...`);

    const messages: Anthropic.MessageParam[] = [
      ...history.map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      })),
      { role: "user", content: userMessage },
    ];

    const executor = new ToolExecutor(userId, fieldId);
    const result = await runToolLoop(messages, inventory, fieldId, executor);

    const duration = Date.now() - start;
    logger.debug(`[LLM] yanit: ${duration}ms, ${result.length} karakter`);
    return result;
  } catch (error) {
    logger.error("[LLM] hata:", error);
    return "Şu anda TARAS yapay zeka asistanına ulaşılamıyor. Lütfen daha sonra tekrar deneyin.";
  }
};

/**
 * Anthropic arac kullanim dongusu — streaming destekli.
 * Arac cagrilari sirasinda onStatus("analyzing") gonderir.
 * Son yanitı chunk chunk onChunk ile gonderir.
 */
export const generateAdvisoryStream = async (
  userId: string,
  fieldId: string,
  userMessage: string,
  sessionId: string,
  onChunk: (text: string) => void,
  onStatus?: (status: string) => void,
  onNavigate?: (screen: string, section: string | null) => void,
): Promise<string> => {
  const start = Date.now();
  const [history, inventory] = await Promise.all([
    getSessionHistory(sessionId),
    getFieldInventory(userId),
  ]);

  logger.debug(`[LLM] "${userMessage.slice(0, 50)}..." (gecmis: ${history.length})`);

  const messages: Anthropic.MessageParam[] = [
    ...history.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    })),
    { role: "user", content: userMessage },
  ];

  const executor = new ToolExecutor(userId, fieldId);
  executor.onNavigate = onNavigate;
  const systemMessages = buildSystemMessages(inventory, fieldId);
  const deadline = Date.now() + LOOP_TIMEOUT_MS;

  let iteration = 0;

  // Arac dongusu — streaming olmayan iterasyonlar
  while (iteration < MAX_ITERATIONS) {
    if (Date.now() > deadline) {
      logger.warn("[LLM] zaman asimi");
      const fallback = "Analiz zaman aşımına uğradı. Lütfen sorunuzu daha kısa tutarak tekrar deneyin.";
      onChunk(fallback);
      return fallback;
    }

    const response = await anthropic.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: HAIKU_MAX_TOKENS,
      thinking: {
        type: "enabled",
        budget_tokens: HAIKU_THINKING_BUDGET,
      },
      system: systemMessages,
      messages,
      tools: TOOL_DEFINITIONS,
    });

    // Yanit metnini topla — thinking bloklarini istemciye akitmiyoruz,
    // sadece text tipini stream ediyoruz (asistanin "ic sesi" sunucuda kalir)
    const textBlocks = response.content.filter(
      (b): b is Anthropic.TextBlock => b.type === "text",
    );
    const toolBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    if (response.stop_reason === "end_turn" || toolBlocks.length === 0) {
      // Son yanit — stream et
      const finalText = textBlocks.map((b) => b.text).join("");
      if (finalText) {
        // Chunk chunk gonder — kucuk parcalar ve gecikme ile dogal hiz
        const chunkSize = 500;
        for (let i = 0; i < finalText.length; i += chunkSize) {
          onChunk(finalText.slice(i, i + chunkSize));
        }
      }
      const duration = Date.now() - start;
      logger.debug(`[LLM] bitti: ${duration}ms, ${iteration} iterasyon, ${finalText.length} chr`);
      return finalText || "Yanıt alınamadı.";
    }

    // Asistan mesajini gecmise ekle
    messages.push({ role: "assistant", content: response.content });

    // Araclari calistir (paralel) — her araci istemciye bildir
    const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
      toolBlocks.map(async (block) => {
        onStatus?.(block.name);
        const result = await executor.execute(
          block.name,
          block.input as Record<string, unknown>,
        );
        return {
          type: "tool_result" as const,
          tool_use_id: block.id,
          content: result,
        };
      }),
    );

    // Arac sonuclarini mesajlara ekle
    messages.push({ role: "user", content: toolResults });
    iteration++;
  }

  // Maksimum iterasyona ulasildi
  logger.warn(`[LLM] maks iterasyon (${MAX_ITERATIONS})`);
  const fallback = "Analiz tamamlanamadı. Lütfen tekrar deneyin.";
  onChunk(fallback);
  return fallback;
};

// ===== GROQ FALLBACK =====

// Groq icin OpenAI SDK — sadece LLM_PROVIDER=groq oldugunda kullanilir
let groqClient: any = null;

function getGroqClient(): any {
  if (!groqClient) {
    const OpenAI = require("openai").default;
    groqClient = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1",
    });
  }
  return groqClient;
}

const GROQ_MODEL = "qwen/qwen3-32b";
const GROQ_SYSTEM_PROMPT = `Sen TARAS (Tarımsal Karar Destek Sistemi) için çalışan uzman bir ziraat asistanısın.

KESİN KURALLAR:
1. Sana verilen [TARAS SİSTEM VERİSİ] dışındaki hiçbir bilgiyi kullanarak sulama, ilaç veya gübre tavsiyesi verme.
2. Çiftçi teknik olmayan bir dilde soru sorabilir, ona her zaman saygılı, net ve profesyonel bir dille (Sen/Siz) hitap et.
3. Kural motorunun aldığı kararın ("son_sistem_karari") NEDENİNİ, sistem eşiklerini ("sistem_esikleri") ve mevcut durumu ("mevcut_durum") karşılaştırarak açıkla.
4. Eğer çiftçinin sorusunun cevabı verilerde yoksa, tahmin yürütme! Sadece "Mevcut sistem verilerinde bu soruya dair bir ölçüm bulunmuyor" de.
5. Cevabın kısa ve doğrudan konuya yönelik olsun.`;

const stripThinkTags = (text: string): string => {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  return cleaned || text;
};

export const generateAdvisoryGroq = async (
  fieldId: string,
  userMessage: string,
  sessionId: string,
): Promise<string> => {
  try {
    const start = Date.now();
    const [history, fieldContext] = await Promise.all([
      getSessionHistory(sessionId),
      getFieldContextForLLM(fieldId),
    ]);

    if ("error" in fieldContext) {
      return `Tarla verisi alınamadı: ${fieldContext.error}`;
    }

    const groq = getGroqClient();
    const response = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: GROQ_SYSTEM_PROMPT },
        { role: "system", content: `[TARAS SİSTEM VERİSİ]\n${JSON.stringify(fieldContext, null, 2)}` },
        ...history.map((msg) => ({
          role: (msg.role === "user" ? "user" : "assistant") as "user" | "assistant",
          content: msg.content,
        })),
        { role: "user", content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 2048,
    });

    const raw = response.choices[0]?.message?.content ?? "Yanıt alınamadı.";
    const text = stripThinkTags(raw);
    const duration = Date.now() - start;
    logger.debug(`[LLM-GROQ] yanit: ${duration}ms, ${text.length} karakter`);
    return text;
  } catch (error) {
    logger.error("[LLM-GROQ] hata:", error);
    return "Şu anda TARAS yapay zeka asistanına ulaşılamıyor. Lütfen daha sonra tekrar deneyin.";
  }
};

export const generateAdvisoryStreamGroq = async (
  fieldId: string,
  userMessage: string,
  sessionId: string,
  onChunk: (text: string) => void,
): Promise<string> => {
  const start = Date.now();
  const [history, fieldContext] = await Promise.all([
    getSessionHistory(sessionId),
    getFieldContextForLLM(fieldId),
  ]);

  if ("error" in fieldContext) {
    const errorText = `Tarla verisi alınamadı: ${fieldContext.error}`;
    onChunk(errorText);
    return errorText;
  }

  const groq = getGroqClient();
  const stream = await groq.chat.completions.create({
    model: GROQ_MODEL,
    messages: [
      { role: "system", content: GROQ_SYSTEM_PROMPT },
      { role: "system", content: `[TARAS SİSTEM VERİSİ]\n${JSON.stringify(fieldContext, null, 2)}` },
      ...history.map((msg) => ({
        role: (msg.role === "user" ? "user" : "assistant") as "user" | "assistant",
        content: msg.content,
      })),
      { role: "user", content: userMessage },
    ],
    temperature: 0.7,
    max_tokens: 2048,
    stream: true,
  });

  let fullText = "";
  let buffer = "";
  let streaming = false;

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content ?? "";
    if (!delta) continue;
    fullText += delta;

    if (streaming) {
      onChunk(delta);
      continue;
    }

    buffer += delta;
    const thinkEnd = buffer.indexOf("</think>");
    if (thinkEnd !== -1) {
      const afterThink = buffer.substring(thinkEnd + 8).trimStart();
      streaming = true;
      if (afterThink) onChunk(afterThink);
      continue;
    }
    const trimmed = buffer.trimStart();
    if (trimmed.length >= 7 && !trimmed.startsWith("<think")) {
      streaming = true;
      onChunk(buffer);
      continue;
    }
    if (trimmed.length > 0 && !trimmed.startsWith("<")) {
      streaming = true;
      onChunk(buffer);
    }
  }

  if (!streaming && buffer) {
    const cleaned = stripThinkTags(buffer);
    if (cleaned) onChunk(cleaned);
  }

  const duration = Date.now() - start;
  logger.debug(`[LLM-GROQ] bitti: ${duration}ms, ${fullText.length} chr`);
  return stripThinkTags(fullText);
};

// ===== YARDIMCI =====

function buildSystemMessages(
  inventory: Awaited<ReturnType<typeof getFieldInventory>>,
  fieldId: string,
): Anthropic.MessageCreateParams["system"] {
  return [
    {
      type: "text",
      text: CACHED_SYSTEM_PROMPT,
      cache_control: { type: "ephemeral" },
    },
    {
      type: "text",
      text: buildPerRequestContext(inventory, fieldId, new Date()),
    },
  ];
}

async function runToolLoop(
  messages: Anthropic.MessageParam[],
  inventory: Awaited<ReturnType<typeof getFieldInventory>>,
  fieldId: string,
  executor: ToolExecutor,
): Promise<string> {
  const systemMessages = buildSystemMessages(inventory, fieldId);
  const deadline = Date.now() + LOOP_TIMEOUT_MS;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    if (Date.now() > deadline) {
      return "Analiz zaman aşımına uğradı. Lütfen sorunuzu tekrar sorun.";
    }

    const response = await anthropic.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: HAIKU_MAX_TOKENS,
      thinking: {
        type: "enabled",
        budget_tokens: HAIKU_THINKING_BUDGET,
      },
      system: systemMessages,
      messages,
      tools: TOOL_DEFINITIONS,
    });

    // Thinking + tool_use + text bloklarini birlikte geri dondururuz — asistan
    // turn'u tarafina tum icerigi (signature dahil) oldugu gibi push ederiz,
    // bir sonraki iterasyon tool_result ile birlikte cagrildiginda API
    // thinking bloklarinin korunmasini zorunlu kilar.
    const textBlocks = response.content.filter(
      (b): b is Anthropic.TextBlock => b.type === "text",
    );
    const toolBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    if (response.stop_reason === "end_turn" || toolBlocks.length === 0) {
      return textBlocks.map((b) => b.text).join("") || "Yanıt alınamadı.";
    }

    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
      toolBlocks.map(async (block) => ({
        type: "tool_result" as const,
        tool_use_id: block.id,
        content: await executor.execute(
          block.name,
          block.input as Record<string, unknown>,
        ),
      })),
    );

    messages.push({ role: "user", content: toolResults });
  }

  return "Analiz tamamlanamadı. Lütfen tekrar deneyin.";
}
