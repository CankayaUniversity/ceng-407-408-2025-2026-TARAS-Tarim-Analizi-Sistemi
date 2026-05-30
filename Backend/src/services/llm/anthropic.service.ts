// Anthropic client ve sistem promptu
import Anthropic from "@anthropic-ai/sdk";
import logger from "../../utils/logger";
import {
  PROMPT_IDENTITY,
  PROMPT_ROLES,
  PROMPT_BREVITY_CORE,
  PROMPT_LANGUAGE_CORE,
  PROMPT_AGRONOMY_REFERENCE,
  PROMPT_SYSTEM_MODEL,
  PROMPT_SCOPE,
  PROMPT_TIMETABLE_GUIDANCE,
  formatToolRoster,
} from "./promptParts";

if (!process.env.ANTHROPIC_API_KEY) {
  logger.warn("ANTHROPIC_API_KEY ayarlanmamis — LLM cagrilari basarisiz olacak");
}

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Sonnet 4.6 — Haiku 4.5'ten yukseltildi 2026-05-30 (kullanici talebi). Sonnet daha guclu
// reasoning + arac kullanimi; ucret Haiku'dan ~4-5x yuksek (girdi $3 / cikti $15 per Mtok).
export const ANTHROPIC_MODEL = "claude-sonnet-4-6";

// Bolum A: Onbelleklenen sistem promptu
// Kisa ve net — text-first default, navigasyon sadece gerektiginde
// Dil: kullanicinin mesajindan otomatik alginan
export const CACHED_SYSTEM_PROMPT = `${PROMPT_IDENTITY}

${PROMPT_ROLES}

## Language
${PROMPT_LANGUAGE_CORE}

## Brevity (hard rules)
${PROMPT_BREVITY_CORE}

${formatToolRoster()}

${PROMPT_TIMETABLE_GUIDANCE}

## Tool usage rules
- Ground every claim about live sensor values, irrigation, alerts, diseases or carbon in a DATA tool — never guess at current numbers.
- This app has a 3D field view, charts and detail screens — USE THEM. When the user asks about a specific zone, or seeing helps (a zone on the 3D field, a chart, a workflow), call highlight_zone (for a zone) or navigate_to_section (for a screen) to show it, then point at it in the toast — name what's on screen, don't restate the data (see the toast rule above). Reach for the visual readily — not only on an explicit "göster".
- Sensor data over a time window (temperature, humidity, soil moisture for "today / this week / last N days / the trend") → call set_timetable_filters; that is what the Timetable screen is for. See the Timetable section above; default to showing it, do not keep these in text just because no chart was explicitly requested.
- For point-in-time or decision questions with no time window ("should I irrigate?", "what's the soil moisture right now?"), answer in full chat text — don't force a navigation that shrinks your answer into a toast.
- Agricultural theory (Kc, drip vs sprinkler, disease symptoms) → built-in reference below first, search_knowledge only if not covered.
- If a tool returns no data or fails, say so in one sentence. Never fabricate readings.
- When explaining an irrigation decision, compare the reading to its threshold.

${PROMPT_SCOPE}

## Built-in agricultural reference (condensed)
${PROMPT_AGRONOMY_REFERENCE}

## System model
${PROMPT_SYSTEM_MODEL}`;

// Bolum B: Istek bazli baglam (hafif, onbelleklenmez).
// userMeta (isim/rol) + [SELECTED] tarlanin canli zone degerleri (motor-turevli
// hedef/Kc/kritik) llm.extended tarafindan fetch edilip buraya gecirilir.
export type LLMUserMeta = { username: string | null; role: string | null };
export type LLMEnrichedZone = {
  zone_id: string;
  name: string;
  crop: string | null;
  stage: string | null;
  current_sm: number | null;
  target_sm: number;
  critical_sm: number;
  kc: number;
};

export function buildPerRequestContext(
  inventory: { farm_id: string; name: string; fields: { field_id: string; name: string; crop_name: string | null; zones: { zone_id: string; name: string }[] }[] }[],
  selectedFieldId: string,
  timestamp: Date,
  userMeta?: LLMUserMeta | null,
  selectedZones?: LLMEnrichedZone[] | null,
): string {
  const lines: string[] = [
    `Tarih/Saat: ${timestamp.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })}`,
  ];
  if (userMeta?.username) {
    lines.push(
      `Kullanıcı: ${userMeta.username}${userMeta.role ? ` (rol: ${userMeta.role})` : ""}`,
    );
  }
  lines.push("", "Kullanıcının çiftlikleri ve tarlaları:");

  // Full UUID'ler — model tool cagrilari icin bu ID'leri birebir kullanir.
  // [SELECTED] tarlanin zone'lari canli degerlerle (nem/hedef/kritik/Kc) gelir.
  for (const farm of inventory) {
    lines.push(`- Farm "${farm.name}" (farm_id=${farm.farm_id})`);
    for (const field of farm.fields) {
      const isSelected = field.field_id === selectedFieldId;
      const tag = isSelected ? " [SELECTED]" : "";
      lines.push(
        `  - Field "${field.name}"${tag} (field_id=${field.field_id}, crop=${field.crop_name || "none"})`,
      );
      if (isSelected && selectedZones && selectedZones.length > 0) {
        for (const z of selectedZones) {
          const sm = z.current_sm != null ? `${z.current_sm}%` : "?";
          const cropPart = z.crop
            ? `, crop=${z.crop}${z.stage ? ` (${z.stage})` : ""}`
            : "";
          lines.push(
            `    - Zone "${z.name}" (zone_id=${z.zone_id}${cropPart}, nem=${sm}, hedef=${z.target_sm}%, kritik=${z.critical_sm}%, Kc=${z.kc})`,
          );
        }
      } else {
        for (const zone of field.zones) {
          lines.push(`    - Zone "${zone.name}" (zone_id=${zone.zone_id})`);
        }
      }
    }
  }

  lines.push("");
  lines.push(
    "Tool parameter rule: use the EXACT UUIDs shown above verbatim. Never truncate, paraphrase, or invent IDs. For field questions default to the [SELECTED] field; its zone values above are live — answer from them directly without a tool call.",
  );

  return lines.join("\n");
}
