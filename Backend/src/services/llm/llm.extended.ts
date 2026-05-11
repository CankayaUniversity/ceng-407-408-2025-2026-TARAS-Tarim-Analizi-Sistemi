// LLM servisi — Anthropic Haiku 4.5 + arac kullanim dongusu (BIRINCIL)
// + Groq agentic (Llama 4 Scout) — LLM_PROVIDER=groq icin ayni tool loop, OpenAI semasi
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { getSessionHistory } from "../chatMemory.service";
import { anthropic, ANTHROPIC_MODEL, CACHED_SYSTEM_PROMPT, buildPerRequestContext } from "./anthropic.service";
import { TOOL_DEFINITIONS } from "./toolDefinitions";
import { ToolExecutor } from "./toolExecutor";
import { getFieldInventory } from "../dashboardService";
import {
  groqClient,
  GROQ_MODEL,
  GROQ_MAX_TOKENS,
  GROQ_TEMPERATURE,
  GROQ_REASONING_EFFORT,
  GROQ_SYSTEM_PROMPT,
  GROQ_TOOLS,
} from "./groq.service";
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
      const finalText = textBlocks.map((b) => b.text).join("");
      if (finalText) {
        // Kucuk parcalar halinde gonder, dogal hiz hissi icin
        const chunkSize = 500;
        for (let i = 0; i < finalText.length; i += chunkSize) {
          onChunk(finalText.slice(i, i + chunkSize));
        }
      }
      const duration = Date.now() - start;
      logger.debug(`[LLM] bitti: ${duration}ms, ${iteration} iterasyon, ${finalText.length} chr`);
      return finalText || "Yanıt alınamadı.";
    }

    messages.push({ role: "assistant", content: response.content });

    // Paralel — her araci istemciye onStatus ile bildir
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

    messages.push({ role: "user", content: toolResults });
    iteration++;
  }

  logger.warn(`[LLM] maks iterasyon (${MAX_ITERATIONS})`);
  const fallback = "Analiz tamamlanamadı. Lütfen tekrar deneyin.";
  onChunk(fallback);
  return fallback;
};

// ===== GROQ AGENTIC (Llama 4 Scout) =====
//
// OpenAI tool-call semasi uzerinden ayni ToolExecutor'i kullanir. Anthropic
// pathindekiyle ayni signature: (userId, fieldId, userMessage, sessionId, ...).
// Tool iterasyonlari non-streaming — her iterasyonun yapisini incelememiz
// gerekiyor (tool_calls vs content). Final text yapay olarak chunk'lanir
// (Anthropic versiyonu da ayni desen — chunkSize=500).

const stripThinkTags = (text: string): string => {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  return cleaned || text;
};

// Llama 3.3'un uretebildigi legacy "<function=name>{...}</function>" text
// formatini icerikten temizle (Llama 4 Scout normalde bunu yapmaz, paranoid).
const stripLegacyToolFormat = (text: string): string =>
  text.replace(/<function=[^>]+>[\s\S]*?<\/function>/g, "").trim();

// gpt-oss reasoning channel leak guvenligi (Groq community forum'da rapor edilen
// `<|channel|>` token'lari hidden modunda 4/10 oraninda sizdiriyor — biz default
// "parsed" kullaniyoruz, leak gozlenmedi ama defansif olarak temizliyoruz).
const stripChannelTokens = (text: string): string =>
  text.replace(/<\|channel\|>[\s\S]*?<\|message\|>/g, "")
      .replace(/<\|(?:channel|message|start|end|return)\|>/g, "")
      .trim();

function buildGroqMessages(
  userMessage: string,
  history: { role: string; content: string }[],
  inventory: Awaited<ReturnType<typeof getFieldInventory>>,
  fieldId: string,
): OpenAI.Chat.ChatCompletionMessageParam[] {
  return [
    { role: "system", content: GROQ_SYSTEM_PROMPT },
    {
      role: "system",
      content: buildPerRequestContext(inventory, fieldId, new Date()),
    },
    ...history.map((msg) => ({
      role: (msg.role === "user" ? "user" : "assistant") as "user" | "assistant",
      content: msg.content,
    })),
    { role: "user", content: userMessage },
  ];
}

async function runGroqToolLoop(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  executor: ToolExecutor,
  onStatus?: (status: string) => void,
): Promise<string> {
  const deadline = Date.now() + LOOP_TIMEOUT_MS;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    if (Date.now() > deadline) {
      logger.warn("[LLM-GROQ] zaman asimi");
      return "Analiz zaman aşımına uğradı. Lütfen sorunuzu tekrar sorun.";
    }

    const response = await groqClient.chat.completions.create({
      model: GROQ_MODEL,
      max_tokens: GROQ_MAX_TOKENS,
      temperature: GROQ_TEMPERATURE,
      messages,
      tools: GROQ_TOOLS,
      tool_choice: "auto",
      // gpt-oss-* reasoning seviyesini dusur — diger modeller bu parami yoksayar
      reasoning_effort: GROQ_REASONING_EFFORT,
    } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming);

    const choice = response.choices[0];
    if (!choice?.message) {
      return "Yanıt alınamadı.";
    }

    const message = choice.message;
    const toolCalls = message.tool_calls;
    const content = message.content || "";

    // Tool cagrisi yoksa final yanit — defansif temizlik, markdown korunur
    if (!toolCalls || toolCalls.length === 0) {
      const cleaned = stripChannelTokens(
        stripLegacyToolFormat(stripThinkTags(content)),
      );
      return cleaned || "Yanıt alınamadı.";
    }

    // Asistan mesajini gecmise ekle — tool_calls verbatim, content nullable
    messages.push({
      role: "assistant",
      content: content || null,
      tool_calls: toolCalls,
    });

    // Her tool cagrisini sirayla yurut, sonucunu role=tool mesaji olarak ekle
    for (const tc of toolCalls) {
      // OpenAI SDK union: function vs custom — sadece function tipini calistir
      if (tc.type !== "function") continue;
      const fnName = tc.function.name;
      onStatus?.(fnName);
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function.arguments || "{}");
      } catch (e) {
        logger.warn(`[LLM-GROQ] tool arg JSON parse hatasi: ${fnName}`, e);
      }
      const result = await executor.execute(fnName, args);
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: result,
      });
    }
  }

  logger.warn(`[LLM-GROQ] maks iterasyon (${MAX_ITERATIONS})`);
  return "Analiz tamamlanamadı. Lütfen tekrar deneyin.";
}

export const generateAdvisoryGroq = async (
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

    logger.debug(`[LLM-GROQ] gecmis: ${history.length} mesaj, sorgu: ${userMessage.slice(0, 60)}...`);

    const messages = buildGroqMessages(userMessage, history, inventory, fieldId);
    const executor = new ToolExecutor(userId, fieldId);
    const result = await runGroqToolLoop(messages, executor);

    const duration = Date.now() - start;
    logger.debug(`[LLM-GROQ] yanit: ${duration}ms, ${result.length} karakter, model=${GROQ_MODEL}`);
    return result;
  } catch (error) {
    logger.error("[LLM-GROQ] hata:", error);
    return "Şu anda TARAS yapay zeka asistanına ulaşılamıyor. Lütfen daha sonra tekrar deneyin.";
  }
};

export const generateAdvisoryStreamGroq = async (
  userId: string,
  fieldId: string,
  userMessage: string,
  sessionId: string,
  onChunk: (text: string) => void,
  onStatus?: (status: string) => void,
  onNavigate?: (screen: string, section: string | null) => void,
): Promise<string> => {
  try {
    const start = Date.now();
    const [history, inventory] = await Promise.all([
      getSessionHistory(sessionId),
      getFieldInventory(userId),
    ]);

    logger.debug(`[LLM-GROQ] "${userMessage.slice(0, 50)}..." (gecmis: ${history.length})`);

    const messages = buildGroqMessages(userMessage, history, inventory, fieldId);
    const executor = new ToolExecutor(userId, fieldId);
    executor.onNavigate = onNavigate;

    const finalText = await runGroqToolLoop(messages, executor, onStatus);

    // Anthropic deseni — final text'i 500 char chunk'lar halinde gonder
    if (finalText) {
      const chunkSize = 500;
      for (let i = 0; i < finalText.length; i += chunkSize) {
        onChunk(finalText.slice(i, i + chunkSize));
      }
    }

    const duration = Date.now() - start;
    logger.debug(`[LLM-GROQ] bitti: ${duration}ms, ${finalText.length} chr`);
    return finalText || "Yanıt alınamadı.";
  } catch (error) {
    logger.error("[LLM-GROQ] stream hatasi:", error);
    const fallback = "Şu anda TARAS yapay zeka asistanına ulaşılamıyor. Lütfen daha sonra tekrar deneyin.";
    onChunk(fallback);
    return fallback;
  }
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
