// Groq client + Groq-tuned sistem promptu + Anthropic→OpenAI tool sema adapteri
//
// Model secimi (2026-05-04 — 25-run/model stability test + 7-prompt multi-turn quality test):
//   ✅ openai/gpt-oss-120b   — VARSAYILAN. Multi-turn quality 93.5%. 25 run boyunca SIFIR
//                              language-drift, SIFIR channel-leak, SIFIR empty response.
//                              Best raw reasoning (90 MMLU-Pro). reasoning_effort:"low" + 4K
//                              max_tokens free-tier'da kararli calisir; default "parsed" reasoning
//                              format research'in uyardigi `<|channel|>` leak'i tetiklemiyor.
//   ⚠ openai/gpt-oss-20b    — Quality 95.7% fakat ayni markdown egilimi; 120b ile esit hata
//                              orani, daha hizli (~4s) ama daha az reasoning gucu. Latency-onceligi
//                              icin GROQ_MODEL ile swap edilebilir.
//   ❌ qwen/qwen3-32b        — Quality 89%. KRITIK BUG: weather refusal'da TR+CN+JP harf karisimi
//                              ("Yarın yağmur预报についてお尋ね") 5 deneydem 3'unde gozlendi.
//                              Empty response thinking-mode'da bir kez. Turkce kullanici icin guvensiz.
//   ❌ meta-llama/llama-4-scout-17b-16e-instruct — Out-of-scope sorularda silently search_knowledge cagiriyor,
//                                                    built-in agronomy referansini gormezden geliyor.
//   ❌ llama-3.3-70b-versatile — Groq deployment'i legacy `<function=...>` text formati donduruyor.
//   ❌ groq/compound, compound-mini — Custom tool'lari KABUL ETMIYOR (Groq docs); built-in tools
//                                      (web_search, code_interpreter) ile cikitili.
//
// TUM open modeller markdown bias gosteriyor (~60% response "1. ..." veya bullet ile basliyor) —
// llm.extended.ts'de `plainifyMarkdown()` post-processor ile temizleniyor.
//
// Varsayilan: openai/gpt-oss-120b. GROQ_MODEL env ile override edilebilir.
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import logger from "../../utils/logger";
import { TOOL_DEFINITIONS } from "./toolDefinitions";
import {
  PROMPT_IDENTITY,
  PROMPT_ROLES,
  PROMPT_BREVITY_CORE,
  PROMPT_LANGUAGE_CORE,
  PROMPT_AGRONOMY_REFERENCE,
  PROMPT_SYSTEM_MODEL,
  PROMPT_SCOPE,
  formatToolRoster,
} from "./promptParts";

if (!process.env.GROQ_API_KEY) {
  logger.warn("GROQ_API_KEY ayarlanmamis — Groq agentic cagrilari basarisiz olacak");
}

export const groqClient = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

export const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

// gpt-oss-120b free-tier'da 8K reddediyor (HTTP 413); 4K guvenli ust sinir
export const GROQ_MAX_TOKENS = 4096;
// Tool-call guvenilirligi icin dusuk temperature
export const GROQ_TEMPERATURE = 0.3;
// gpt-oss-120b reasoning seviyesi — "low" tarim sorgusu icin yeterli, latency dusuk kalir
// Diger modellerde bu param sessizce gozardi edilir
export const GROQ_REASONING_EFFORT = "low";

// ===== SISTEM PROMPTU (Llama-3.3 / Kimi K2 / GPT-OSS friendly) =====
// Yapilanmasi: numarali kurallar, explicit decision tree, anti-preamble,
// agronomy reference, full UUID kurallari (memory §17 — 8-char truncation
// tool-calling'i kiriyor)
export const GROQ_SYSTEM_PROMPT = `${PROMPT_IDENTITY}

${PROMPT_ROLES}

## Brevity (HARD rules)
${PROMPT_BREVITY_CORE}

## Language (CRITICAL — chat is rendered in Latin script)
${PROMPT_LANGUAGE_CORE}
- If the user wrote Turkish, you MUST reply ONLY in Turkish using the Latin alphabet.
- NEVER output Chinese (汉字), Japanese (ひらがな/カタカナ), Korean (한글), Arabic, or any non-Latin script. Even one character of a wrong script is a failure.

${formatToolRoster()}

## Tool-selection decision tree (follow in order)

Step 1 — Can the answer come from chat history alone? Yes → answer in text, no tool. No → Step 2.

Step 2 — Is the question about CURRENT sensor data, irrigation, alerts, diseases, or carbon? Yes → pick ONE data tool, call it, then answer in TEXT with the numbers. No → Step 3.

Step 3 — Is the question pure agronomy (Kc, soil types, irrigation methods, disease names)? Yes → try the built-in reference below FIRST. Only call search_knowledge if the topic is NOT covered there. No → Step 4.

Step 4 — Did the user explicitly say "göster / aç / show / open", or clearly want to SEE something? Yes → call highlight_zone (a specific zone on the 3D field) or navigate_to_section (a screen/chart); the toast then only names what's on screen — do NOT list the data in it (see Brevity). No → answer in text.

## Tool-use HARD rules

- ALWAYS use the EXACT UUIDs shown in the inventory below. NEVER truncate, paraphrase, or invent IDs. For field-level questions default to the [SELECTED] field.
- DEFAULT TO TEXT-ONLY. Numbers from a data tool answer most questions in one sentence — do NOT navigate "for completeness".
- If a data tool returns a number, lead with that number in your reply.
- If a data tool returns no data or fails, say so in one sentence. Do NOT fabricate readings.
- Always compare a reading to its threshold when explaining an irrigation decision.
- ONE tool call per turn unless multiple zones / time ranges are genuinely needed. NEVER repeat the same call with the same args.
- After tool results return, your reply MUST be plain text — do NOT call more tools just to elaborate.
- Never call a tool just to confirm what the user already told you.

${PROMPT_SCOPE}

## Built-in agricultural reference (use FIRST before search_knowledge)

${PROMPT_AGRONOMY_REFERENCE}

## System model
${PROMPT_SYSTEM_MODEL}`;

// ===== TOOL SCHEMA ADAPTER (Anthropic Tool[] → OpenAI ChatCompletionTool[]) =====
// Anthropic Tool: { name, description, input_schema }
// OpenAI Tool:    { type: "function", function: { name, description, parameters } }
function anthropicToolToOpenAI(
  tool: Anthropic.Tool,
): OpenAI.Chat.ChatCompletionTool {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema as Record<string, unknown>,
    },
  };
}

export const GROQ_TOOLS: OpenAI.Chat.ChatCompletionTool[] = TOOL_DEFINITIONS.map(
  anthropicToolToOpenAI,
);
