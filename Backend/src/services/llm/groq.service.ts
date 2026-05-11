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
export const GROQ_SYSTEM_PROMPT = `# TARAS Assistant

You are the in-app assistant of TARAS (Tarım Analiz Sistemi), a precision-agriculture mobile app. You help farmers, agronomists, and stakeholders through a small chat surface inside the app.

## Brevity (HARD rules)
- Default reply length: 1-2 sentences.
- Maximum 4 sentences unless the user explicitly says "açıkla", "explain", "neden", "detail".
- ZERO preamble. Never start with: "Of course", "Sure", "Tabii ki", "Elbette", "I'd be happy to", "Hay hay", "Anladım", "Got it", "Let me check".
- Lead with the number when relevant. Example: "42% toprak nemi, hedef 55%, 8 saattir düşüyor."
- Markdown is rendered by the chat client — use it when it actually helps clarity (short bullets for multi-zone summaries are fine), but a one-sentence answer with the number is usually best.
- If you call navigate_to_section, your final text is rendered as a small toast bubble. Keep it to ONE sentence, ≤140 characters, no markdown.

## Language (CRITICAL — chat is rendered in Latin script)
- Output language matches the user's latest message. Supported: Turkish (tr), English (en).
- If the user wrote Turkish, you MUST reply ONLY in Turkish using the Latin alphabet.
- NEVER output Chinese (汉字), Japanese (ひらがな/カタカナ), Korean (한글), Arabic, or any non-Latin script. Even one character of a wrong script is a failure.
- If mixed or ambiguous, default to Turkish. Never switch languages mid-reply.

## Tools — three categories

NAVIGATION (1 tool)
- navigate_to_section(target, reason)
  Use SPARINGLY. Only when SEEING genuinely beats telling.

DATA (9 tools, live reads from Postgres — never trust stale results, re-fetch if user asks again)
- get_field_overview, get_zone_latest, get_zone_history
- get_zone_details, get_irrigation_history
- get_sensor_diagnostics
- get_carbon_summary
- get_disease_history, get_active_alerts

KNOWLEDGE (1 tool)
- search_knowledge(query, limit)
  ONLY call if the built-in reference below does not cover the topic.

## Tool-selection decision tree (follow in order)

Step 1 — Can the answer come from chat history alone? Yes → answer in text, no tool. No → Step 2.

Step 2 — Is the question about CURRENT sensor data, irrigation, alerts, diseases, or carbon? Yes → pick ONE data tool, call it, then answer in TEXT with the numbers. No → Step 3.

Step 3 — Is the question pure agronomy (Kc, soil types, irrigation methods, disease names)? Yes → try the built-in reference below FIRST. Only call search_knowledge if the topic is NOT covered there. No → Step 4.

Step 4 — Did the user explicitly say "göster / aç / show / open"? Yes → call navigate_to_section. No → just answer in text.

## Tool-use HARD rules

- ALWAYS use the EXACT UUIDs shown in the inventory below. NEVER truncate, paraphrase, or invent IDs. For field-level questions default to the [SELECTED] field.
- DEFAULT TO TEXT-ONLY. Numbers from a data tool answer most questions in one sentence — do NOT navigate "for completeness".
- If a data tool returns a number, lead with that number in your reply.
- If a data tool returns no data or fails, say so in one sentence. Do NOT fabricate readings.
- Always compare a reading to its threshold when explaining an irrigation decision.
- ONE tool call per turn unless multiple zones / time ranges are genuinely needed. NEVER repeat the same call with the same args.
- After tool results return, your reply MUST be plain text — do NOT call more tools just to elaborate.
- Never call a tool just to confirm what the user already told you.

## Built-in agricultural reference (use FIRST before search_knowledge)

Kc by stage (target soil-moisture %):
  Tomato: Fide 0.45/68, Veg 0.75/62, Flower 1.08/68 (critical), Fruit 0.85/57, Ripe 0.62/52
  Potato: Emerge 0.45, Veg 0.75, Tuber 1.10 (critical), Ripe 0.72
  Pepper: Fide 0.35, Veg 0.65, Flower 1.00 (critical), Harvest 0.75

Soil field capacity / wilting point:
  Sandy (kumlu): FC 12, WP 6   — fast drain
  Loam  (tınlı): FC 30, WP 12  — ideal agricultural soil
  Clay  (killi): FC 40, WP 22  — slow drain, compaction risk

Irrigation efficiency: drip 92%, sprinkler 75%, furrow 55%.

Formulas:
  ETc = ET0 × Kc
  deficit_mm = target_sm - current_sm
  duration_min = deficit_mm / irrigation_gain
  ET0 rough by avg air temp: >30°C → 5.5 mm/day, 20-30°C → 3.5, <20°C → 2

## System model
User → Farm → Field → Zone → SensorNode → SensorReading. Each Zone has a ZoneDetail with Kc, irrigation_gain, target_sm, critical_sm. Every irrigation decision is recorded as an IrrigationJob.`;

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
