import prisma from "../config/database";
import logger from "../utils/logger";

interface ZoneContext {
  tarla_adi: string;
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

interface ZoneContextError {
  error: string;
}

/**
 * Belirli bir bölgenin güncel durumunu LLM'in anlayacağı JSON formatına çevirir.
 */
export const getZoneContextForLLM = async (
  zoneId: string,
): Promise<ZoneContext | ZoneContextError> => {
  try {
    const zoneData = await prisma.zone.findUnique({
      where: { zone_id: zoneId },
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
    });

    if (!zoneData) {
      return { error: "Zone bulunamadı." };
    }

    const latestNode = zoneData.sensor_nodes[0];
    const latestReading = latestNode?.readings[0];
    const latestJob = zoneData.jobs[0];

    const llmContext: ZoneContext = {
      tarla_adi: zoneData.name,
      toprak_turu: zoneData.soil_type || "Bilinmiyor",
      mevcut_durum: {
        toprak_nemi_yuzde: latestReading?.sm_percent ?? null,
        hava_sicakligi: latestReading?.temperature ?? null,
        hava_nemi_yuzde: latestReading?.humidity ?? null,
      },
      sistem_esikleri: {
        hedef_nem_yuzde: zoneData.details?.target_sm_percent ?? 60.0,
        kritik_nem_yuzde: zoneData.details?.critical_sm_percent ?? 30.0,
      },
      son_sistem_karari: {
        karar_durumu: latestJob?.status || "KARAR_YOK",
        sistem_aciklamasi: latestJob?.reasoning || "Sistem henüz bir değerlendirme yapmadı.",
        onerilen_sulama_suresi_dk: latestJob?.recommended_duration_min || 0,
      },
    };

    return llmContext;
  } catch (error) {
    logger.error("Veri toplama hatası:", error);
    return { error: "Sistem verilerine şu an ulaşılamıyor." };
  }
};
