import prisma from "../config/database";
import logger from "../utils/logger";

interface ZoneSummary {
  bolge_adi: string;
  toprak_turu: string;
  mevcut_durum: {
    toprak_nemi_yuzde: number | null;
    hava_sicakligi: number | null;
    hava_nemi_yuzde: number | null;
  };
  sistem_esikleri: {
    hedef_nem_yuzde: number;
    kritik_nem_yuzde: number;
  };
  son_sistem_karari: {
    karar_durumu: string;
    sistem_aciklamasi: string;
    onerilen_sulama_suresi_dk: number;
  };
}

interface FieldContext {
  tarla_adi: string;
  bolge_sayisi: number;
  bolgeler: ZoneSummary[];
}

interface ContextError {
  error: string;
}

/**
 * Tarla bazli LLM konteksti — tum bolgeleri iceren ozet
 */
export const getFieldContextForLLM = async (
  fieldId: string,
): Promise<FieldContext | ContextError> => {
  try {
    const field = await prisma.field.findUnique({
      where: { field_id: fieldId },
      include: {
        zones: {
          include: {
            details: true,
            sensor_nodes: {
              take: 1,
              include: {
                readings: {
                  orderBy: { created_at: "desc" },
                  take: 1,
                },
              },
            },
            jobs: {
              orderBy: { created_at: "desc" },
              take: 1,
            },
          },
        },
      },
    });

    if (!field) {
      logger.debug(`[CHAT] tarla bulunamadi: ${fieldId}`);
      return { error: "Tarla bulunamadı." };
    }

    logger.debug(`[CHAT] tarla konteksti: "${field.name}" ${field.zones.length} bolge`);

    const bolgeler: ZoneSummary[] = field.zones.map((zone) => {
      const latestReading = zone.sensor_nodes[0]?.readings[0];
      const latestJob = zone.jobs[0];
      return {
        bolge_adi: zone.name,
        toprak_turu: zone.soil_type || "Bilinmiyor",
        mevcut_durum: {
          toprak_nemi_yuzde: latestReading?.sm_percent ?? null,
          hava_sicakligi: latestReading?.temperature ?? null,
          hava_nemi_yuzde: latestReading?.humidity ?? null,
        },
        sistem_esikleri: {
          hedef_nem_yuzde: zone.details?.target_sm_percent ?? 60.0,
          kritik_nem_yuzde: zone.details?.critical_sm_percent ?? 30.0,
        },
        son_sistem_karari: {
          karar_durumu: latestJob?.status || "KARAR_YOK",
          sistem_aciklamasi: latestJob?.reasoning || "Sistem henüz bir değerlendirme yapmadı.",
          onerilen_sulama_suresi_dk: latestJob?.recommended_duration_min || 0,
        },
      };
    });

    return {
      tarla_adi: field.name,
      bolge_sayisi: bolgeler.length,
      bolgeler,
    };
  } catch (error) {
    logger.error("[LLM] tarla verisi toplama hatasi:", error);
    return { error: "Sistem verilerine şu an ulaşılamıyor." };
  }
};
