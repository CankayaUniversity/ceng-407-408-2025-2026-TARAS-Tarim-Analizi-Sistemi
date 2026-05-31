// Disease care recommendations — loaded once from disease_recommendation and
// cached in memory (small set, ~120 rows). Returned bilingually so the mobile
// client can pick the user's language without round-tripping back to the API.
//
// Reseed via: npx ts-node prisma/seed-disease-recommendations.ts
// After reseeding, restart the backend (or call reloadRecommendations()).

import { prisma } from "../config/database";
import { DiseaseTarget } from "../generated/prisma";
import logger from "../utils/logger";

export interface BilingualRecommendations {
  tr: string[];
  en: string[];
}

const EMPTY: BilingualRecommendations = { tr: [], en: [] };

let cache: Partial<Record<DiseaseTarget, BilingualRecommendations>> | null = null;
let loadPromise: Promise<void> | null = null;

async function load(): Promise<void> {
  const rows = await prisma.diseaseRecommendation.findMany({
    orderBy: [{ disease_target: "asc" }, { language: "asc" }, { order_index: "asc" }],
    select: { disease_target: true, language: true, text: true },
  });
  const next: Partial<Record<DiseaseTarget, BilingualRecommendations>> = {};
  for (const r of rows) {
    const slot = next[r.disease_target] ?? { tr: [], en: [] };
    if (r.language === "tr") slot.tr.push(r.text);
    else if (r.language === "en") slot.en.push(r.text);
    next[r.disease_target] = slot;
  }
  cache = next;
  logger.info(
    `[RECOMMEND] cache rebuilt — ${rows.length} rows, ${Object.keys(next).length} diseases`,
  );
}

// Kicked off at module import so the first API request doesn't wait.
loadPromise = load().catch((err) => {
  logger.error("[RECOMMEND] initial load failed:", err);
});

export async function reloadRecommendations(): Promise<void> {
  loadPromise = load();
  await loadPromise;
}

export function getRecommendationsFor(
  disease: DiseaseTarget | null | undefined,
): BilingualRecommendations {
  if (!disease) return EMPTY;
  if (!cache) return EMPTY; // first request before load resolves — safe fallback
  return cache[disease] ?? EMPTY;
}
