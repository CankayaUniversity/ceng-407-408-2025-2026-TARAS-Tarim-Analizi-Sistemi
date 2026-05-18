// Hastalik sinifina karsilik gelen kullanici tavsiyeleri. Lambda inference'i
// disease class adi dondururken Backend bu maptan ilgili tavsiyeleri alip
// disease_detections.recommendations alanina yazar. Lambda'nin her cagrida
// ayni stringi tekrar tekrar dondurmesi gereksiz — kaynak burada tek yerde.

export const DISEASE_RECOMMENDATIONS: Record<string, string[]> = {
  bacterial_spot: [
    "Hastalikli yaprak ve meyveleri toplayip imha edin (kompost yapmayin).",
    "Bakir bazli bakterisit (Bordo bulamaci) hafta arayla iki kez uygulayin.",
    "Ustten sulamayi birakin, kok bolgesine damla sulama yapin.",
    "Bitki aralarini seyrekleseterip hava sirkulasyonunu artirin.",
  ],
  corn_common_rust: [
    "Yaprak altinda turuncu pustuller goruluyorsa erken mudahale edin.",
    "Triazol grubu fungisit (tebukonazol) uygulayin.",
    "Hasat sonrasi bitki artiklarini tarladan uzaklastirip yakin.",
  ],
  corn_gray_leaf_spot: [
    "Bitki sirklarini havalandirin, sulamada yapraklari islatmayin.",
    "Mancozeb veya azoksistrobin icerikli fungisit uygulayin.",
    "Gelecek sezon misir ekmeyin (en az 2 yil munavebe).",
  ],
  corn_northern_leaf_blight: [
    "Yaprakta 3-15 cm uzunlugunda zeytin yesili lezyonlar gorulurse hizli mudahale edin.",
    "Strobilurin (azoksistrobin) veya triazol grubu fungisit uygulayin.",
    "Sonraki ekiminizde dayanikli cesit secin, munavebe yapin.",
  ],
  early_blight: [
    "Alt yapraklardaki halka sekilli kahverengi lekelere karsi hizli mudahale edin.",
    "Chlorothalonil veya mancozeb bazli fungisit 7-10 gun arayla uygulayin.",
    "Etkilenen yapraklari toplayip imha edin (kompost yapmayin).",
    "Damla sulama kullanin, gece sulamasi yapmayin.",
  ],
  healthy: [
    "Bitki saglikli gorunuyor. Mevcut sulama ve gubreleme programini surdurun.",
  ],
  late_blight: [
    "ACIL: Hizla yayilan agir hastalik. Hastalikli kisimlari derhal toplayip imha edin.",
    "Sistemik fungisit (metalaksil + mancozeb karisimi) uygulayin.",
    "Bitki etrafindaki hava sirkulasyonunu artirin, alt yapraklari budayin.",
    "Komsu bitkileri de kontrol edin, koruyucu sprey atin.",
  ],
  leaf_mold: [
    "Sera kosullarinda nem orani %85'in altinda tutun.",
    "Klorothalonil veya bakir bazli fungisit uygulayin.",
    "Asagidan sulayin, bitki tepesinin nem almasini engelleyin.",
  ],
  mosaic_virus: [
    "Virus hastaligi icin tedavi yoktur. Hastalikli bitkiyi sokup yakin.",
    "Tutun urunu kullanan kisi bitkilere dokunmamali (TMV bulasici).",
    "Aletleri %10'luk camasir suyu ile dezenfekte edin.",
    "Yaprak biti gibi vektor boceklere karsi imidakloprid uygulayin.",
  ],
  powdery_mildew: [
    "Yaprakta beyaz toz benzeri lekeler — erken mudahale sart.",
    "Sulfur (kukurt) bazli fungisit veya potasyum bikarbonat uygulayin.",
    "Bitkileri seyrekleseterin, sabah sulama yapin (aksam degil).",
  ],
  septoria_leaf_spot: [
    "Kucuk gri merkezli yuvarlak lekeler — esik dusuk, hizli mudahale sart.",
    "Mancozeb veya bakir bazli fungisit 10 gun arayla uygulayin.",
    "Alt etkilenmis yapraklari kesip imha edin.",
    "Damla sulama + malch kullanin, ustten sulamayi birakin.",
  ],
  spider_mites: [
    "Yaprak altinda ince ag ve sari noktalar varsa kirmizi orumcek vardir.",
    "Once basincli su ile yapraklari yikayin (mekanik mucadele).",
    "Akarisit (abamektin) uygulayin, 7 gun sonra tekrar edin.",
    "Dogal dusmanlari (avci akarlar) korumak icin genis spektrumlu ilaclardan kacinin.",
  ],
  target_spot: [
    "Yaprak ve meyvelerde konsantrik halkalardan olusan kahverengi lekeler.",
    "Azoksistrobin veya difenokonazol icerikli fungisit uygulayin.",
    "Etkilenen kisimlari budayin, bahce hijyenini koruyun.",
  ],
  yellow_leaf_curl_virus: [
    "Virus hastaligi — tedavi yok. Hastalikli bitkiyi sokerek imha edin.",
    "Vektor beyazsinegi imidakloprid veya sari yapiskan tuzaklarla kontrol edin.",
    "Fide doneminde tulbent gibi koruyucu ortu kullanin.",
    "Sonraki ekimde TYLCV-toleranti cesit secin.",
  ],

  // Lambda 'Uncertain' donerse veya bilinmeyen bir sinif gelirse — bos.
  // Backend folder auto-tag bu durumda zaten atlar.
  Uncertain: [],
};

export function getRecommendationsFor(disease: string): string[] {
  return DISEASE_RECOMMENDATIONS[disease] ?? [];
}
