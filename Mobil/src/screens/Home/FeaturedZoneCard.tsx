// Secili zone karti — hucre tabanli tasarim (MetricCard dili).
// Baslik + 1. satir: hava sicakligi + nem hucreleri. 2. satir: toprak nemi hucresi —
// hava hucreleriyle AYNI yapi/yukseklik ama tam genislik; zone modunda dokunulabilir +
// sagda BELIRGIN sulama oneri (su miktari + zaman) + aciliyet rozeti + ok (chevron).
// Zaman gecmisse "Şimdi", gelecekteyse goreli ("30 dk sonra"). Degerler ZONE ORTALAMASI.
import type { ReactNode } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Theme } from "../../utils/theme";
import { NodeInfo } from "../../components/ColorPlane";
import { IrrigationSuggestion } from "./types";
import { useLanguage } from "../../context/LanguageContext";
import { ms, s, spacing } from "../../utils/responsive";
import { getUrgencyColor, getUrgencyLabel } from "../../utils/labels";

// hex'i beyaza dogru harmanla (pastel) — cevreleyen balon gorunumu icin
function pastel(hex: string, t: number): string {
  const c = hex.replace("#", "");
  if (c.length < 6) return hex;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const mix = (v: number) => Math.round(v + (255 - v) * t);
  const hx = (v: number) => mix(v).toString(16).padStart(2, "0");
  return `#${hx(r)}${hx(g)}${hx(b)}`;
}

// Kisa tarih/saat (gecmis sulama icin)
const formatCardTime = (iso: string | null, language: string): string => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(language === "tr" ? "tr-TR" : "en-US", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

// Kucuk renkli aciliyet rozeti — HIGH / MEDIUM / LOW (belirgin renk)
const UrgencyBadge = ({
  level,
  label,
  theme,
}: {
  level: IrrigationSuggestion["urgency_level"];
  label: string;
  theme: Theme;
}) => {
  const color = theme[getUrgencyColor(level)];
  return (
    <View
      style={{
        paddingHorizontal: s(7),
        paddingVertical: 1,
        borderRadius: 20,
        backgroundColor: color + "26",
        borderWidth: 1,
        borderColor: color + "80",
      }}
    >
      <Text
        style={{
          fontSize: ms(10, 0.3),
          fontWeight: "800",
          color,
          textTransform: "uppercase",
          letterSpacing: 0.4,
        }}
      >
        {label}
      </Text>
    </View>
  );
};

// Zone (veya tarla) sensor ortalamasi — HomeScreen hesaplar
export interface SensorAvg {
  moisture: number;
  airTemp: number;
  airHumidity: number;
  count: number;
}

interface FeaturedZoneCardProps {
  theme: Theme;
  node: NodeInfo | null;
  nodeIndex: number;
  /** Gosterilecek sensor ortalamasi — zone secili ise zone, degilse tarla geneli. */
  sensor: SensorAvg | null;
  pendingSuggestion?: IrrigationSuggestion | null;
  noActionEvaluation?: { reasoning: string | null; created_at: string } | null;
  lastIrrigationTime?: string | null;
  /** Zone secili oldugunda karti cevreleyen vurgu tonu. null = vurgu yok. */
  highlightColor?: string | null;
  /** Veri cekilme zamani + yenile — balonun ICINDE, hucrelerin altinda gosterilir. */
  fetchedAt?: Date | null;
  onRefreshData?: () => void;
  /** Toprak hucresine dokununca sulama detay ekranini acar (zone modunda). */
  onPress: () => void;
}

// Hucre olculeri — SABIT satir yukseklikleri + ACIK lineHeight → icerik determinist, KAYMAZ.
// (Eski minHeight/space-between yaklasimi platform varsayilan satir-yuksekligi farki yuzunden hala
//  oynuyordu: satirlar icerige gore buyuyup label+sayiyi kaydiriyordu. Artik satirlar SABIT.)
const TITLE_FS = ms(13, 0.3); // hucre basligi (buyutuldu 11→13)
const VALUE_FS = ms(28, 0.4); // buyuk deger sayisi (buyutuldu 22→28)
const VALUE_LH = ms(34); // sayinin SABIT satir yuksekligi (platform varsayilanini ezer → determinist)
const UNIT_FS = ms(13, 0.3); // birim (% / °C)
const TITLE_ROW_H = ms(22); // baslik satiri SABIT yukseklik (label + ikon/badge/chevron sigar)
const VALUE_ROW_H = ms(34); // deger satiri SABIT yukseklik (= buyuk sayi satir yuksekligi)
const CELL_MIN_H = ms(80); // tum hucreler ayni yukseklik (icerik 74+kenar < 80 → daima 80)

// Ortak hucre govdesi — hava + toprak hucreleri AYNI stil + SABIT yukseklik paylasir. Icerik USTTEN
// hizali (flex-start); satir yukseklikleri sabit oldugundan label/deger her durumda sabit ofsette durur.
const cellBox = (theme: Theme) =>
  ({
    flex: 1,
    minHeight: CELL_MIN_H,
    overflow: "hidden",
    backgroundColor: theme.surface,
    borderRadius: 12,
    // 1.5 = toprak hucresinin kenarligiyla AYNI → border-box ici-cekme farki olmaz, icerik hizali kalir
    borderWidth: 1.5,
    borderColor: theme.primary + "20",
    paddingVertical: s(7),
    paddingHorizontal: s(9),
  }) as const;

// Tek (dokunulmayan) sensor hucresi — hava sicakligi/nem
const SensorCell = ({
  icon,
  label,
  value,
  unit,
  theme,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  unit: string;
  theme: Theme;
}) => (
  <View style={cellBox(theme)}>
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        height: TITLE_ROW_H,
      }}
    >
      <Text
        numberOfLines={1}
        style={{
          flexShrink: 1,
          fontSize: TITLE_FS,
          fontWeight: "600",
          color: theme.textSecondary,
        }}
      >
        {label}
      </Text>
      {icon}
    </View>
    <View
      style={{ flexDirection: "row", alignItems: "flex-end", marginTop: s(4), height: VALUE_ROW_H }}
    >
      <Text
        numberOfLines={1}
        style={{
          fontSize: VALUE_FS,
          lineHeight: VALUE_LH,
          fontWeight: "700",
          color: theme.textMain,
          includeFontPadding: false,
          textAlignVertical: "bottom",
        }}
      >
        {value}
      </Text>
      <Text
        style={{
          fontSize: UNIT_FS,
          lineHeight: VALUE_LH,
          color: theme.textSecondary,
          marginLeft: s(2),
          includeFontPadding: false,
          textAlignVertical: "bottom",
        }}
      >
        {unit}
      </Text>
    </View>
  </View>
);

export const FeaturedZoneCard = ({
  theme,
  node,
  nodeIndex,
  sensor,
  pendingSuggestion = null,
  noActionEvaluation = null,
  lastIrrigationTime = null,
  highlightColor = null,
  fetchedAt = null,
  onRefreshData,
  onPress,
}: FeaturedZoneCardProps) => {
  const { t, language } = useLanguage();

  if (!sensor) return null;

  const isZone = node !== null;
  const soil = Math.round(sensor.moisture);
  const accentCol = pendingSuggestion
    ? theme[getUrgencyColor(pendingSuggestion.urgency_level)]
    : theme.primary;

  const urgencyLabel = pendingSuggestion
    ? getUrgencyLabel(pendingSuggestion.urgency_level, t.irrigation)
    : null;

  // Oneri zamani: gecmisse "Şimdi", gelecekteyse goreli (TR: "30 dk sonra", EN: "in 30m")
  const recommendationTime = (() => {
    if (!pendingSuggestion?.start_time) return null;
    const diffMin = Math.round(
      (new Date(pendingSuggestion.start_time).getTime() - Date.now()) / 60000,
    );
    if (diffMin <= 0) return t.home.now;
    const rel = (n: number, unit: string) =>
      language === "tr" ? `${n} ${unit} sonra` : `in ${n}${unit}`;
    if (diffMin < 60) return rel(diffMin, t.home.unitMin);
    const diffHr = Math.round(diffMin / 60);
    if (diffHr < 24) return rel(diffHr, t.home.unitHr);
    return rel(Math.round(diffHr / 24), t.home.unitDay);
  })();

  const waterAmount =
    pendingSuggestion?.water_amount_ml != null
      ? `${Math.round(pendingSuggestion.water_amount_ml)} ${t.irrigation.ml}`
      : null;

  // Pending yoksa sag tarafta sade (soluk) durum metni
  const mutedSummary = noActionEvaluation
    ? t.irrigation.noIrrigationNeeded
    : lastIrrigationTime
    ? `${t.irrigation.lastIrrigation}: ${formatCardTime(lastIrrigationTime, language)}`
    : t.irrigation.noSuggestion;

  return (
    <View
      style={{
        // Cevreleyen balon — SADECE zone vurgulandiginda. Kenarlik sabit 3 (cizgiyle AYNI; renk degisir).
        borderRadius: 18,
        borderWidth: 3,
        borderColor: highlightColor ? highlightColor + "C0" : "transparent",
        // Alan rengi ~%10 opaklik ("1A") → arka plani cok hafif boyar (neredeyse seffaf)
        backgroundColor: highlightColor ? pastel(highlightColor, 0.55) + "1A" : "transparent",
        overflow: "hidden",
        padding: spacing.sm,
      }}
    >
      {/* Baslik (sol) + veri tazeligi metadata (sag) — ayni satir */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: s(6),
          gap: s(8),
        }}
      >
        <Text
          numberOfLines={1}
          style={{ flexShrink: 1, fontSize: ms(15, 0.3), fontWeight: "700", color: theme.textMain }}
        >
          {isZone ? `${t.irrigation.zone} ${nodeIndex + 1}` : t.home.fieldOverview}
        </Text>
        <DataFreshnessMeta theme={theme} fetchedAt={fetchedAt} onRefresh={onRefreshData} />
      </View>

      {/* 1. satir — hava sicakligi + nem */}
      <View style={{ flexDirection: "row", gap: s(6) }}>
        <SensorCell
          theme={theme}
          label={t.home.airTemperature}
          value={sensor.airTemp.toFixed(1)}
          unit="°C"
          icon={<Ionicons name="thermometer-outline" size={ms(16, 0.3)} color={theme.primary} />}
        />
        <SensorCell
          theme={theme}
          label={t.home.airHumidity}
          value={String(Math.round(sensor.airHumidity))}
          unit="%"
          icon={<Ionicons name="water-outline" size={ms(16, 0.3)} color={theme.primary} />}
        />
      </View>

      {/* 2. satir — toprak nemi (zone: dokunulabilir, belirgin oneri) */}
      <View style={{ flexDirection: "row", marginTop: s(6) }}>
        {isZone ? (
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={onPress}
            style={{
              ...cellBox(theme),
              borderColor: accentCol + (pendingSuggestion ? "80" : "33"),
              // Sabit kenarlik genisligi — oneri gelince/gidince hucre kaymasin (sadece renk degisir)
              borderWidth: 1.5,
            }}
          >
            {/* Ust: label (sol) + aciliyet rozeti + ok (sag) → tiklanabilir */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                height: TITLE_ROW_H,
              }}
            >
              <Text
                numberOfLines={1}
                style={{
                  flexShrink: 1,
                  fontSize: TITLE_FS,
                  fontWeight: "600",
                  color: theme.textSecondary,
                }}
              >
                {t.home.soilMoisture}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: s(5) }}>
                {urgencyLabel && (
                  <UrgencyBadge
                    level={pendingSuggestion!.urgency_level}
                    label={urgencyLabel}
                    theme={theme}
                  />
                )}
                <Ionicons name="chevron-forward" size={ms(18, 0.3)} color={theme.textSecondary} />
              </View>
            </View>

            {/* Alt: buyuk toprak nemi (sol) + BELIRGIN oneri: su miktari + zaman (sag) */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "flex-end",
                marginTop: s(4),
                height: VALUE_ROW_H,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: VALUE_FS,
                    lineHeight: VALUE_LH,
                    fontWeight: "700",
                    color: theme.textMain,
                    includeFontPadding: false,
                    textAlignVertical: "bottom",
                  }}
                >
                  {soil}
                </Text>
                <Text
                  style={{
                    fontSize: UNIT_FS,
                    lineHeight: VALUE_LH,
                    color: theme.textSecondary,
                    marginLeft: s(2),
                    includeFontPadding: false,
                    textAlignVertical: "bottom",
                  }}
                >
                  %
                </Text>
              </View>

              {pendingSuggestion ? (
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: s(8), flexShrink: 1 }}
                >
                  {waterAmount && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: s(3) }}>
                      <Ionicons name="water" size={ms(14, 0.3)} color={theme.textSecondary} />
                      <Text
                        numberOfLines={1}
                        style={{ fontSize: ms(14, 0.3), color: theme.textMain }}
                      >
                        {waterAmount}
                      </Text>
                    </View>
                  )}
                  {recommendationTime && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: s(3) }}>
                      <Ionicons name="time-outline" size={ms(14, 0.3)} color={theme.textSecondary} />
                      <Text
                        numberOfLines={1}
                        style={{ fontSize: ms(14, 0.3), color: theme.textMain }}
                      >
                        {recommendationTime}
                      </Text>
                    </View>
                  )}
                </View>
              ) : (
                <Text
                  numberOfLines={1}
                  style={{
                    flexShrink: 1,
                    marginLeft: s(8),
                    fontSize: ms(12, 0.3),
                    color: theme.textSecondary,
                  }}
                >
                  {mutedSummary}
                </Text>
              )}
            </View>
          </TouchableOpacity>
        ) : (
          // Tarla geneli — dokunulamaz sade toprak nemi hucresi
          <SensorCell
            theme={theme}
            label={t.home.soilMoisture}
            value={String(soil)}
            unit="%"
            icon={<Ionicons name="water" size={ms(16, 0.3)} color={theme.primary} />}
          />
        )}
      </View>

    </View>
  );
};

// Veri tazeligi — baslik satirinin saginda acik "metadata" yazi: "Son güncelleme HH:MM" + yenile.
const DataFreshnessMeta = ({
  theme,
  fetchedAt,
  onRefresh,
}: {
  theme: Theme;
  fetchedAt: Date | null;
  onRefresh?: () => void;
}) => {
  const { t, language } = useLanguage();
  if (!fetchedAt) return null;
  const time = fetchedAt.toLocaleTimeString(language === "tr" ? "tr-TR" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: s(5), flexShrink: 0 }}>
      <Text numberOfLines={1} style={{ fontSize: ms(10, 0.3), color: theme.textMuted }}>
        {`${t.home.lastUpdated} ${time}`}
      </Text>
      <TouchableOpacity
        onPress={onRefresh}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        activeOpacity={0.6}
      >
        <Ionicons name="refresh" size={ms(13, 0.3)} color={theme.textSecondary} />
      </TouchableOpacity>
    </View>
  );
};
