// Tarimsal bilgi tabani — PostgreSQL full-text search
import prisma from "../../config/database";
import logger from "../../utils/logger";

interface KnowledgeResult {
  title: string;
  content: string;
  category: string;
  rank: number;
}

/**
 * Bilgi tabaninda full-text arama yapar.
 * Tablo yoksa bos dizi dondurur (Phase 2'de olusturulacak).
 */
export async function searchKnowledge(
  query: string,
  limit: number = 3,
): Promise<KnowledgeResult[]> {
  try {
    const results = await prisma.$queryRawUnsafe<KnowledgeResult[]>(
      `SELECT title, content, category,
              ts_rank(search_vector, plainto_tsquery('simple', $1)) AS rank
       FROM knowledge_chunks
       WHERE search_vector @@ plainto_tsquery('simple', $1)
       ORDER BY rank DESC
       LIMIT $2`,
      query,
      limit,
    );
    return results;
  } catch (error) {
    // Tablo henuz olusturulmamissa hata verme
    logger.debug("[KNOWLEDGE] arama hatasi (tablo henuz olusturulmamis olabilir):", error);
    return [];
  }
}
