import prisma from "../config/database";
import logger from "../utils/logger";
import { getStageAgronomy } from "./irrigation.service";

interface ZoneSummary {
  zone_id: string;
  bolge_adi: string;
  toprak_turu: string;
  ekin: string | null;
  buyume_evresi: string | null;
  mevcut_durum: {
    toprak_nemi_yuzde: number | null;
    hava_sicakligi: number | null;
    hava_nemi_yuzde: number | null;
  };
  sistem_esikleri: {
    hedef_nem_yuzde: number;
    kritik_nem_yuzde: number;
    kc: number;
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
            plantings: {
              where: { is_active: true },
              include: { crop: true },
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
      const planting = zone.plantings[0];
      const cropName = planting?.crop?.name ?? null;
      const stage = planting?.growth_stage ?? null;
      // Motorun GERCEKTEN kullandigi esikler: evre (yoksa planting_date'ten turetilir) →
      // domates kurallari. Motor crop branch'i olmadigi icin ekine bakmaz. Cozulemezse ZoneDetail.
      const agro = getStageAgronomy(stage, planting?.planting_date ?? null, new Date());
      return {
        zone_id: zone.zone_id,
        bolge_adi: zone.name,
        toprak_turu: zone.soil_type || "Bilinmiyor",
        ekin: cropName,
        buyume_evresi: stage,
        mevcut_durum: {
          toprak_nemi_yuzde: latestReading?.sm_percent ?? null,
          hava_sicakligi: latestReading?.temperature ?? null,
          hava_nemi_yuzde: latestReading?.humidity ?? null,
        },
        sistem_esikleri: {
          hedef_nem_yuzde: agro?.target_sm ?? zone.details?.target_sm_percent ?? 60.0,
          kritik_nem_yuzde: agro?.critical_sm ?? zone.details?.critical_sm_percent ?? 30.0,
          kc: agro?.kc ?? zone.details?.current_kc ?? 1.0,
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
