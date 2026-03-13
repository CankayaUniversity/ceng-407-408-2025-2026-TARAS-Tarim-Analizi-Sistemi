// Use shared Prisma client instance from config
import { prisma } from "@config/database";

// (shared instance initialized in config/database.ts)

/**
 * Belirli bir bölgenin (Zone) güncel durumunu LLM'in anlayacağı basit bir JSON formatına çevirir.
 */
export const getZoneContextForLLM = async (zoneId: string) => {
  try {
    // 1. Veritabanından İlişkisel Veriyi Çekme
    const zoneData = await prisma.zone.findUnique({
      where: { zone_id: zoneId },
      include: {
        details: true, // Hedef nem, kritik nem eşikleri
        sensor_nodes: {
          include: {
            readings: {
              orderBy: { created_at: 'desc' },
              take: 1, // Sadece en son sensör okumasını alıyoruz
            },
          },
        },
        jobs: {
          orderBy: { created_at: 'desc' },
          take: 1, // Kural motorunun verdiği son sulama kararını alıyoruz
        },
      },
    });

    if (!zoneData) {
      throw new Error("Zone bulunamadı.");
    }

    // 2. Veri Temizleme (Data Sanitization)
    // Sensör verilerini güvenli bir şekilde alıyoruz
    const latestNode = zoneData.sensor_nodes[0];
    const latestReading = latestNode?.readings[0];
    const latestJob = zoneData.jobs[0];

    // 3. LLM için Saf JSON Oluşturma
    // Bu obje, LLM prompt'una doğrudan gömülecek olan "TARAS SİSTEM VERİSİ"dir.
    const llmContext = {
      tarla_adi: zoneData.name,
      toprak_turu: zoneData.soil_type || "Bilinmiyor",
      mevcut_durum: {
        toprak_nemi_yuzde: latestReading?.sm_percent || null,
        hava_sicakligi: latestReading?.temperature || null,
        hava_nemi_yuzde: latestReading?.humidity || null,
      },
      sistem_esikleri: {
        hedef_nem_yuzde: zoneData.details?.target_sm_percent || 60.0,
        kritik_nem_yuzde: zoneData.details?.critical_sm_percent || 30.0,
      },
      son_sistem_karari: {
        karar_durumu: latestJob?.status || "KARAR_YOK",
        sistem_aciklamasi: latestJob?.reasoning || "Sistem henüz bir değerlendirme yapmadı.",
        onerilen_sulama_suresi_dk: latestJob?.recommended_duration_min || 0,
      }
    };

    return llmContext;

  } catch (error) {
    console.error("Veri toplama hatası:", error);
    // Hata durumunda modelin halüsinasyon yapmasını önlemek için boş/güvenli bir obje dönüyoruz
    return { error: "Sistem verilerine şu an ulaşılamıyor." };
  }
};