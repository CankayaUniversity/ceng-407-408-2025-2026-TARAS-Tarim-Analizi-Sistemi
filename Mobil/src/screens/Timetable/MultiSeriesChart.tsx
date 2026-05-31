// Coklu seri (cizgi) destekli grafik karti
// Her seri = bir node veya bir zone ortalamasi veya field ortalamasi
// LTTB downsample ile gorsel detayi koruyarak nokta sayisini sinirlar
// Cizim react-native-svg ile elle yapiliyor (gifted-charts'in grid koordinat sistemiyle
// overlay hizalama sorunlari yasandigi icin). Gridline/eksen/veri ayni koordinatta cizilir.

import { memo, useMemo, useState, useRef, useCallback, useEffect } from "react";
import { View, Text, TouchableOpacity, Animated, ActivityIndicator } from "react-native";
import type { LayoutChangeEvent } from "react-native";
import Svg, { Path, Line as SvgLine, Circle } from "react-native-svg";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Theme } from "../../utils/theme";
import { s, vs, ms } from "../../utils/responsive";
import { useLanguage } from "../../context/LanguageContext";
import {
  formatTime,
  formatDay,
  pickTimeInterval,
  generateTimeTicks,
  tickFormatFor,
  withAlpha,
  niceAxis,
  unifyAndDownsample,
} from "./chartMath";
import type { ChartSeries } from "./types";

const CHART_HEIGHT = vs(170);
// X ekseni etiket alani yukseklik — kendi DIY etiketlerimizi bu bandin uzerine cizeriz.
// Tek satir vs cift satir (DD/MM + HH:mm) icin iki ayri yukseklik. X_LABEL_GAP kadar
// X-ekseni cizgisinin altinda baslar (cizgiye yapismasin diye).
const X_LABEL_GAP = 4; // X-ekseni cizgisi ile etiket arasi bosluk
const X_LABEL_HEIGHT_SINGLE = vs(16);
const X_LABEL_HEIGHT_DOUBLE = vs(28);
// Her etiketin yatay slot genisligi — tick yogunlugunu da belirler (drawableWidth / slot = max tick).
// 40 -> "HH:mm" / "DD/MM" (~25px) rahat sigar, ama bir haftalik aralikta gunluk tick'e izin verecek kadar dar.
const X_LABEL_SLOT_WIDTH = s(40);
const POPUP_HIDE_DELAY = 2500;
// Scrub eksen kilidi esigi — bu kadar px hareketten sonra gesture yatay/dikey olarak kilitlenir.
const AXIS_LOCK_THRESHOLD = 8;

// Birime gore Y ekseni sutunu genisligi — etiket "75%" dar sigarken "0.0 mm/h" daha genise ihtiyac duyar.
// Bu degeri her grafik kartinda kendi unit'ine gore ayri hesapliyoruz, boylece kartin solunda gereksiz bosluk olusmaz.
// 2026-05-21: kullanici "sol taraf cok genis" dedi -> degerler kisaltildi (°C suffix'i bosluksuz: "22°C").
const yAxisWidthFor = (unit: string): number => {
  if (unit === "mm/h") return s(42);
  if (unit === "°C") return s(28);
  return s(26); // %, empty — "100%" sigacak kadar (cok dar olursa "%" clip olur)
};

// Y ekseni etiketinde birim soneki — "%" ve "°C" yapisik (yer kazanmak icin), uzun birimler (mm/h) boslukla.
const yLabelSuffix = (unit: string): string => {
  if (!unit) return "";
  if (unit === "%" || unit === "°C") return unit;
  return ` ${unit}`;
};

interface MultiSeriesChartProps {
  theme: Theme;
  title: string;
  icon: string;
  unit: string;
  decimals: number;
  series: ChartSeries[];
  // % metrikleri (humidity, soil moisture) icin Y eksenini 0..100 sabitle
  percentScale?: boolean;
  // Soil moisture vb. icin DB'den gelen kritik/saturasyon esikleri
  // (yalnizca percentScale=true iken kirmizi bantlar olarak gosterilir)
  thresholds?: { min: number; max: number } | null;
  onTouchStart?: () => void;
  onTouchEnd?: () => void;
  // Yatay scrub'a kilitlenince true, gesture bitince false. Ust ScrollView bunu scrollEnabled ile
  // kullanir: Android'de onResponderTerminationRequest=false native scroll'u DURDURMUYOR, bu yuzden
  // yatay scrub boyunca ScrollView'i komple devre disi birakiyoruz (dikey niyet hicbir zaman kilitlemez).
  onScrubbingChange?: (scrubbing: boolean) => void;
  // Filtre degisikliginden gelen refetch sirasinda kartin uzerine
  // yumusakca yari saydam karartma + spinner bindirir.
  loading?: boolean;
}

export const MultiSeriesChart = memo(function MultiSeriesChart({
  theme,
  title,
  icon,
  unit,
  decimals,
  series,
  percentScale = false,
  thresholds = null,
  onTouchStart,
  onTouchEnd,
  onScrubbingChange,
  loading = false,
}: MultiSeriesChartProps) {
  const { t } = useLanguage();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  // Tap-to-highlight: tek seri vurgula (digerleri dimlenir). null = default state (hepsi normal opaklik).
  // Eski behavior (hide/show) yerine kullanici talebi ile bu interaction'a gectik.
  const [highlightedSeries, setHighlightedSeries] = useState<string | null>(null);
  // Olculen kart genisligi — onLayout ile guncellenir
  const [containerWidth, setContainerWidth] = useState(0);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Touch container'in EKRAN uzerindeki sol X koordinati — measureInWindow ile her layout'ta guncelleriz.
  // Android'de nativeEvent.locationX bazi senaryolarda hatali geliyor; bunun yerine pageX'i kullanip
  // bu mutlak X'i cikartarak yerel X'i kendimiz hesapliyoruz.
  const containerScreenXRef = useRef(0);
  // Scrub eksen kilidi: dokunma basinda baslangic koordinati + kilitlenen eksen tutulur. Yatay ("h")
  // kilitliyken responder birakilmaz → ust ScrollView dikey kaydiramaz (scrub hafif dikey kaymadan
  // iptal olmaz); dikey ("v") iken scrub yapilmaz → sayfa normal kayar. Gesture boyunca tek eksene kilitli.
  const gestureStartRef = useRef<{ x: number; y: number } | null>(null);
  const axisLockRef = useRef<"h" | "v" | null>(null);

  // Yari saydam karartma overlay opaklik animasyonu — filtre degisikligi refetch'i sirasinda
  // eski grafik uzerine yumusakca girer/cikar (250ms). Native driver ile JS thread'i mesgul etmez.
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(overlayOpacity, {
      toValue: loading ? 1 : 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [loading, overlayOpacity]);

  // Temizleme
  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, []);

  // Tum seriler her zaman gorunur; vurgu sadece opaklik+thickness ile yapilir.
  // (Eski hiddenSeries durum kaldirildi; kullanici talebi 2026-05-20.)
  const visibleSeries = series;

  // Birime gore Y eksen sutun genisligi + plot baslangici (sabit module constant yerine her grafik kendi degerini hesaplar).
  // % gibi kisa metrik = dar Y sutunu = kartin solunda gereksiz bosluk olmaz. mm/h gibi uzun birim icin daha genis.
  const yAxisWidth = useMemo(() => yAxisWidthFor(unit), [unit]);
  // gifted-charts plot baslangici = yAxisLabelWidth + yAxisThickness. yAxisThickness'i 0 yaptik
  // (kendi Y-ekseni cizgimizi ciziyoruz) -> plot baslangici = yAxisLabelWidth = yAxisWidth - 4.
  const plotStartOffset = yAxisWidth - 4;

  // Cizilebilir alan = kart icindeki gen - y-ekseni etiket alani
  const drawableWidth = Math.max(containerWidth - yAxisWidth, 0);

  // measureInWindow callback ref — touch container'in ekran uzerindeki sol X'i.
  const containerRef = useRef<View>(null);
  const measureContainer = useCallback(() => {
    const node = containerRef.current;
    if (node && typeof node.measureInWindow === "function") {
      node.measureInWindow((x: number) => {
        containerScreenXRef.current = x;
      });
    }
  }, []);

  const onChartContainerLayout = useCallback((e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w > 0) setContainerWidth(w);
    // Layout degisince ekran-uzeri X'i tekrar olc — orn. scroll, klavye, oryantasyon vs.
    measureContainer();
  }, [measureContainer]);

  // Veriyi unify + downsample
  const { unifiedTs, perSeriesValues } = useMemo(
    () => unifyAndDownsample(visibleSeries),
    [visibleSeries],
  );

  const numPoints = unifiedTs.length;
  const tsMin = numPoints > 0 ? unifiedTs[0]! : 0;
  const tsMax = numPoints > 0 ? unifiedTs[numPoints - 1]! : 0;
  const tsSpan = tsMax - tsMin;

  // Zaman -> X koordinati (X ekseni zamana LINEER). Veri noktalari da bu mapping ile yerlesir.
  const xForTime = useCallback(
    (ts: number) =>
      tsSpan > 0
        ? plotStartOffset + ((ts - tsMin) / tsSpan) * drawableWidth
        : plotStartOffset + drawableWidth / 2,
    [tsMin, tsSpan, plotStartOffset, drawableWidth],
  );

  // X ekseni tick'leri — genislige gore hedef tick sayisi, sonra "nice" zaman interval'i secip
  // o sinirlarda (00:00/03:00/... gibi) tam zamana tick uret. Etiket formati interval & span'e gore.
  const timeAxis = useMemo(() => {
    if (numPoints === 0 || tsSpan <= 0 || drawableWidth <= 0) {
      return { ticks: [] as number[], fmt: (ts: number) => formatTime(new Date(ts)), multiLine: false };
    }
    const targetTicks = Math.max(3, Math.min(8, Math.floor(drawableWidth / X_LABEL_SLOT_WIDTH)));
    const interval = pickTimeInterval(tsSpan, targetTicks);
    const ticks = generateTimeTicks(tsMin, tsMax, interval);
    const { fmt, multiLine } = tickFormatFor(interval, tsSpan);
    return { ticks, fmt, multiLine };
  }, [numPoints, tsMin, tsMax, tsSpan, drawableWidth]);

  const xLabelHeight = timeAxis.multiLine ? X_LABEL_HEIGHT_DOUBLE : X_LABEL_HEIGHT_SINGLE;

  // Dokunulan X -> en yakin veri noktasi indeksi (zaman uzerinden). unifiedTs sirali (artan).
  const nearestIndexByTime = useCallback(
    (ts: number): number => {
      if (numPoints === 0) return 0;
      if (ts <= unifiedTs[0]!) return 0;
      if (ts >= unifiedTs[numPoints - 1]!) return numPoints - 1;
      let lo = 0;
      let hi = numPoints - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (unifiedTs[mid]! < ts) lo = mid + 1;
        else hi = mid;
      }
      const a = unifiedTs[lo - 1]!;
      const b = unifiedTs[lo]!;
      return ts - a <= b - ts ? lo - 1 : lo;
    },
    [unifiedTs, numPoints],
  );

  // Y ekseni sinir + adim hesabi (nice-axis).
  // percentScale=true ise 0..100 / 25'lik adim sabit (humidity, soil moisture).
  // Aksi halde veri min/max'ini yuvarlak adimlara oturtuyoruz -> temiz, tekrar etmeyen etiketler.
  const { minValue, maxValue, yStep, ySections, yDecimals } = useMemo(() => {
    if (percentScale) {
      return { minValue: 0, maxValue: 100, yStep: 25, ySections: 4, yDecimals: 0 };
    }
    let mn = Number.POSITIVE_INFINITY;
    let mx = Number.NEGATIVE_INFINITY;
    for (const arr of perSeriesValues) {
      for (const v of arr) {
        if (v == null) continue;
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
    }
    if (!isFinite(mn) || !isFinite(mx)) {
      return { minValue: 0, maxValue: 1, yStep: 0.25, ySections: 4, yDecimals: 1 };
    }
    const a = niceAxis(mn, mx, 4);
    return {
      minValue: a.min,
      maxValue: a.max,
      yStep: a.step,
      ySections: a.sections,
      yDecimals: a.decimals,
    };
  }, [perSeriesValues, percentScale]);

  // Deger -> SVG y koordinati (plot 0..CHART_HEIGHT). maxValue ust (y=0), minValue alt (y=CHART_HEIGHT).
  const yForValue = useCallback(
    (v: number) =>
      maxValue === minValue
        ? CHART_HEIGHT
        : ((maxValue - v) / (maxValue - minValue)) * CHART_HEIGHT,
    [maxValue, minValue],
  );

  // SVG cizim serileri — her seri icin path string'i (null'larda kopararak bosluk birakir = eksik veri gap'i).
  // Tap-to-highlight: highlightedSeries null ise adaptif baseAlpha; vurgu varsa o seri 1.0, digerleri 0.15.
  // Vurgulanan seri diziye SONA konur ki en uste cizilsin.
  // Adaptif opaklik: cizgi sayisi arttikca duser (ust uste binince yogunluk gozuksun) ama 0.55 floor
  // (tek-cizgi bolgelerinde kontrast korunur). Farkli palette hue'lari ust uste binince karisik renk verir.
  const svgSeries = useMemo(() => {
    const n = visibleSeries.length;
    const baseAlpha = Math.max(0.55, Math.min(0.78, 0.88 - n * 0.06));
    const alphaFor = (id: string): number => {
      if (highlightedSeries == null) return baseAlpha;
      return highlightedSeries === id ? 1.0 : 0.15;
    };
    const built = visibleSeries.map((s, i) => {
      const values = perSeriesValues[i] ?? [];
      let d = "";
      let penDown = false;
      const dots: { x: number; y: number }[] = [];
      for (let idx = 0; idx < values.length; idx++) {
        const v = values[idx];
        if (v == null) {
          penDown = false; // bosluk birak (eksik veri)
          continue;
        }
        const x = xForTime(unifiedTs[idx]!);
        const y = yForValue(v);
        dots.push({ x, y });
        d += `${penDown ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
        penDown = true;
      }
      return {
        id: s.id,
        d,
        dots,
        color: withAlpha(s.color, alphaFor(s.id)),
        thickness: highlightedSeries === s.id ? 2.4 : 2,
      };
    });
    if (highlightedSeries != null) {
      built.sort(
        (a, b) =>
          (a.id === highlightedSeries ? 1 : 0) - (b.id === highlightedSeries ? 1 : 0),
      );
    }
    // Seyrek veri (<=40 nokta) icin nokta isaretleri goster
    const showDots = numPoints > 0 && numPoints <= 40;
    return { built, showDots };
  }, [
    visibleSeries,
    perSeriesValues,
    highlightedSeries,
    unifiedTs,
    xForTime,
    yForValue,
    numPoints,
  ]);

  // Touch -> data index (zaman uzerinden). Dokunulan X'i zamana cevirip en yakin veri noktasini buluruz.
  // Android'de nativeEvent.locationX hatali olabildigi icin pageX + measureInWindow ile ekran-X kullaniyoruz.
  const indexFromTouchX = useCallback(
    (localX: number): number => {
      if (drawableWidth <= 0 || tsSpan <= 0) return 0;
      const frac = Math.max(0, Math.min(1, (localX - plotStartOffset) / drawableWidth));
      const touchedTime = tsMin + frac * tsSpan;
      return nearestIndexByTime(touchedTime);
    },
    [drawableWidth, tsSpan, tsMin, plotStartOffset, nearestIndexByTime],
  );

  const handleTouchStart = useCallback(
    (e: { nativeEvent: { pageX: number; pageY: number; locationX: number } }) => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
      onTouchStart?.();
      if (numPoints === 0) return;
      // Yeni gesture: baslangic noktasini kaydet, eksen kilidini sifirla (ilk harekette belirlenir).
      gestureStartRef.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
      axisLockRef.current = null;
      const localX =
        containerScreenXRef.current > 0
          ? e.nativeEvent.pageX - containerScreenXRef.current
          : e.nativeEvent.locationX;
      setSelectedIndex(indexFromTouchX(localX));
    },
    [onTouchStart, numPoints, indexFromTouchX],
  );

  const handleTouchMove = useCallback(
    (e: { nativeEvent: { pageX: number; pageY: number; locationX: number } }) => {
      if (numPoints === 0) return;
      // Eksen henuz kilitli degilse: ilk anlamli hareketin yonune gore kilitle (esitlikte yatay=scrub).
      if (axisLockRef.current === null && gestureStartRef.current) {
        const dx = Math.abs(e.nativeEvent.pageX - gestureStartRef.current.x);
        const dy = Math.abs(e.nativeEvent.pageY - gestureStartRef.current.y);
        if (dx > AXIS_LOCK_THRESHOLD || dy > AXIS_LOCK_THRESHOLD) {
          axisLockRef.current = dx >= dy ? "h" : "v";
          if (axisLockRef.current === "h") {
            // Yatay scrub'a kilitlendi → ust ScrollView'i devre disi birak. Android native scroll
            // onResponderTerminationRequest=false'u dinlemiyor; scrollEnabled=false tek guvenilir yol.
            onScrubbingChange?.(true);
          } else {
            // Dikey kaydirma niyeti: scrub secimini HEMEN temizle — yoksa tooltip + secim cizgisi
            // sayfa kayarken 2.5sn bayat kalir (grant aninda scrub baslamisti).
            if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
            setSelectedIndex(null);
          }
        }
      }
      // Dikey kilit: scrub etme, responder ScrollView'a kalsin (sayfa kaysin).
      if (axisLockRef.current === "v") return;
      const localX =
        containerScreenXRef.current > 0
          ? e.nativeEvent.pageX - containerScreenXRef.current
          : e.nativeEvent.locationX;
      setSelectedIndex(indexFromTouchX(localX));
    },
    [numPoints, indexFromTouchX, onScrubbingChange],
  );

  const handleTouchEnd = useCallback(() => {
    // Gesture bitti: eksen kilidini sifirla + ust ScrollView'i tekrar etkinlestir.
    axisLockRef.current = null;
    gestureStartRef.current = null;
    onScrubbingChange?.(false);
    onTouchEnd?.();
    hideTimeoutRef.current = setTimeout(() => setSelectedIndex(null), POPUP_HIDE_DELAY);
  }, [onTouchEnd, onScrubbingChange]);

  const selectedTs = selectedIndex != null ? unifiedTs[selectedIndex] : null;
  const selectedValues = selectedIndex != null
    ? visibleSeries.map((s, i) => ({
        id: s.id,
        label: s.label,
        color: s.color,
        value: perSeriesValues[i]?.[selectedIndex] ?? null,
      }))
    : [];

  // Legend chip'e dokun -> o seriyi vurgula; tekrar dokun -> default state'e don.
  const toggleHighlight = useCallback((id: string) => {
    setHighlightedSeries((prev) => (prev === id ? null : id));
  }, []);

  // Hicbir seri yoksa kart komple bos durumda
  if (series.length === 0) {
    return (
      <View
        style={{
          marginBottom: vs(14),
          padding: s(16),
          borderRadius: 10,
          backgroundColor: theme.surface,
          minHeight: vs(120),
          justifyContent: "center",
          alignItems: "center",
          borderWidth: 1,
          borderColor: theme.border,
        }}
      >
        <MaterialCommunityIcons name={icon as any} size={28} color={theme.textMuted} />
        <Text style={{ marginTop: vs(6), color: theme.textMuted, fontSize: ms(12, 0.3) }}>
          {title} · {t.timetable.noDataYet}
        </Text>
      </View>
    );
  }

  // Tum seriler gizliyse legend chip'leri tut, sadece chart alanini placeholder yap
  const allHidden = unifiedTs.length === 0;

  // Secim cizgisi X pozisyonu — secili noktanin zamanindan (xForTime).
  const selectionX =
    !allHidden && selectedIndex != null && unifiedTs[selectedIndex] != null
      ? xForTime(unifiedTs[selectedIndex]!)
      : 0;

  return (
    <View
      style={{
        marginBottom: vs(8),
        paddingHorizontal: s(8),
        paddingTop: vs(6),
        paddingBottom: vs(2),
        borderRadius: 12,
        backgroundColor: theme.surface,
        borderWidth: 1,
        borderColor: theme.border,
      }}
    >
      {/* Header — sade. Birim Y eksenindeki sayilarin yaninda gozukuyor. */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: vs(2),
        }}
      >
        <MaterialCommunityIcons name={icon as any} size={16} color={theme.primary} />
        <Text
          style={{
            marginLeft: s(6),
            fontSize: ms(13, 0.3),
            fontWeight: "700",
            color: theme.textMain,
            flex: 1,
          }}
          numberOfLines={1}
        >
          {title}
        </Text>
      </View>

      {/* Legend chips — tap to highlight bir seri (digerleri dimlenir). Tekrar dokununca default'a doner.
          Default state'de hicbir chip vurgulu degil — tum seriler 0.85 opaklikta. */}
      {series.length > 1 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: s(4), marginBottom: vs(2) }}>
          {series.map((sr) => {
            const isHL = highlightedSeries === sr.id;
            const dimmed = highlightedSeries != null && !isHL;
            return (
              <TouchableOpacity
                key={sr.id}
                onPress={() => toggleHighlight(sr.id)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 7,
                  paddingVertical: 3,
                  borderRadius: 999,
                  backgroundColor: isHL ? sr.color + "33" : sr.color + "1A",
                  // Border kalinligi sabit (1) — vurgu bg + font weight + opacity ile veriliyor, layout kaymasin.
                  borderWidth: 1,
                  borderColor: isHL ? sr.color : sr.color + "80",
                  opacity: dimmed ? 0.45 : 1,
                }}
              >
                <View
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 3.5,
                    backgroundColor: sr.color,
                    marginRight: 5,
                  }}
                />
                <Text
                  style={{
                    fontSize: ms(9.5, 0.3),
                    fontWeight: isHL ? "800" : "600",
                    color: theme.textMain,
                  }}
                >
                  {sr.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Chart + absolute-overlay tooltip
          onLayout ile genislik olcumu — Dimensions yerine gercek render gen.
      */}
      <View
        ref={containerRef}
        onLayout={onChartContainerLayout}
        style={{
          height: CHART_HEIGHT + xLabelHeight,
          position: "relative",
          // gifted-charts plot altina hardcoded ~50px bos alan + en altta kendi X-ekseni cizgisini koyuyor.
          // overflow:hidden hem bu bos alani hem gifted'in (gizledigimiz) dusuk X/Y-ekseni cizgi artiklarini kirpar.
          // Plot CHART_HEIGHT'a kadar; tooltip (top:4) ve DIY etiketler sinir icinde, clip etkilemez.
          overflow: "hidden",
        }}
        onStartShouldSetResponder={() => !allHidden && containerWidth > 0}
        onMoveShouldSetResponder={() => !allHidden && containerWidth > 0}
        // Yatay scrub'a kilitlendiyse responder'i BIRAKMA → ust ScrollView devralip dikey kaydiramaz,
        // boylece hafif dikey kayma scrub'i iptal etmez. Kilit yoksa/dikeyse true → ScrollView sayfayi kaydirir.
        onResponderTerminationRequest={() => axisLockRef.current !== "h"}
        onResponderGrant={handleTouchStart}
        onResponderMove={handleTouchMove}
        onResponderRelease={handleTouchEnd}
        onResponderTerminate={handleTouchEnd}
      >
        {allHidden ? (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: theme.divider,
              borderStyle: "dashed",
              borderRadius: 8,
            }}
          >
            <MaterialCommunityIcons name="eye-off-outline" size={22} color={theme.textMuted} />
            <Text style={{ marginTop: vs(6), color: theme.textMuted, fontSize: ms(11, 0.3) }}>
              {t.timetable.allHidden}
            </Text>
          </View>
        ) : containerWidth > 0 ? (
          <>
            {/* Soil moisture vb. icin DB esik bantlari — SVG'nin arkasinda View olarak (seffaf SVG'den gozukur).
                Plot 0..CHART_HEIGHT; bandlar plotStartOffset'ten drawableWidth boyunca uzanir. */}
            {percentScale && thresholds && (() => {
              const dryTop = yForValue(thresholds.min); // min..0 -> kirmizi kurak (alt bant)
              const satBottom = yForValue(thresholds.max); // 100..max -> kirmizi saturasyon (ust bant)
              const bandLeft = plotStartOffset;
              const bandWidth = drawableWidth;
              // Esik bantlari renkleri — alt (kurulu) ve ust (saturasyon) icin subtle ama gorunur kirmizi.
              const dangerColor = theme.danger + "33";
              return (
                <>
                  {thresholds.min > 0 && (
                    <View
                      pointerEvents="none"
                      style={{
                        position: "absolute",
                        left: bandLeft,
                        width: bandWidth,
                        top: dryTop,
                        height: Math.max(0, CHART_HEIGHT - dryTop),
                        backgroundColor: dangerColor,
                      }}
                    />
                  )}
                  {thresholds.max < 100 && (
                    <View
                      pointerEvents="none"
                      style={{
                        position: "absolute",
                        left: bandLeft,
                        width: bandWidth,
                        top: 0,
                        height: Math.max(0, satBottom),
                        backgroundColor: dangerColor,
                      }}
                    />
                  )}
                </>
              );
            })()}
            {/* Custom SVG chart — gridline'lar, eksenler, dikey rehber cizgileri ve veri cizgileri
                hepsi TEK koordinat sisteminde (y: yForValue 0..CHART_HEIGHT, x: xForTime — zamana lineer).
                gifted-charts'in kendi grid'i farkli koordinat sistemindeydi (cift Y-etiket / kayma sorunlari);
                bu yuzden veri cizimini de kendimiz yapiyoruz. Overlay'ler (Y/X etiket, tooltip, secim) ayri View. */}
            <Svg
              width={containerWidth}
              height={CHART_HEIGHT}
              style={{ position: "absolute", top: 0, left: 0 }}
              pointerEvents="none"
            >
              {/* Yatay gridline'lar — en alt (minValue) = X ekseni, daha koyu. */}
              {Array.from({ length: ySections + 1 }).map((_, k) => {
                const value = minValue + k * yStep;
                const y = Math.max(0.5, Math.min(CHART_HEIGHT - 0.5, yForValue(value)));
                const isAxis = k === 0;
                return (
                  <SvgLine
                    key={`grid-${k}`}
                    x1={plotStartOffset}
                    y1={y}
                    x2={plotStartOffset + drawableWidth}
                    y2={y}
                    stroke={theme.textSecondary + (isAxis ? "40" : "12")}
                    strokeWidth={1}
                  />
                );
              })}
              {/* Y ekseni cizgisi */}
              <SvgLine
                x1={plotStartOffset}
                y1={0}
                x2={plotStartOffset}
                y2={CHART_HEIGHT}
                stroke={theme.textSecondary + "40"}
                strokeWidth={1}
              />
              {/* Dikey rehber cizgileri — zaman tick'lerinde (her tick TAM kendi zamaninda).
                  Y-ekseniyle/sag kenarla cakisanlari atla. */}
              {timeAxis.ticks.map((tick) => {
                const x = xForTime(tick);
                if (x <= plotStartOffset + 1 || x >= plotStartOffset + drawableWidth - 1) {
                  return null;
                }
                return (
                  <SvgLine
                    key={`vline-${tick}`}
                    x1={x}
                    y1={0}
                    x2={x}
                    y2={CHART_HEIGHT}
                    stroke={theme.textSecondary + "1F"}
                    strokeWidth={1}
                  />
                );
              })}
              {/* Veri cizgileri — null degerlerde kopuk (eksik veri = bosluk). */}
              {svgSeries.built.map((sr) => (
                <Path
                  key={`path-${sr.id}`}
                  d={sr.d}
                  stroke={sr.color}
                  strokeWidth={sr.thickness}
                  fill="none"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ))}
              {/* Seyrek veri (<=40 nokta) icin nokta isaretleri. */}
              {svgSeries.showDots &&
                svgSeries.built.map((sr) =>
                  sr.dots.map((p, j) => (
                    <Circle key={`dot-${sr.id}-${j}`} cx={p.x} cy={p.y} r={2.5} fill={sr.color} />
                  )),
                )}
            </Svg>
            {/* Kendi Y-ekseni etiketlerimiz — gridline degerlerinde, sag hizali, Y-ekseninin solunda.
                Kenarlardaki (en alt minValue / en ust maxValue) etiketler plot disina tasmasin diye clamp'lenir;
                ozellikle en alt etiket X-ekseni cizgisinin altina sarkmaz. */}
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: plotStartOffset - 3,
                height: CHART_HEIGHT,
              }}
            >
              {Array.from({ length: ySections + 1 }).map((_, k) => {
                const value = minValue + k * yStep;
                const y = ((maxValue - value) / (maxValue - minValue)) * CHART_HEIGHT;
                const labelH = 13;
                const top = Math.max(0, Math.min(CHART_HEIGHT - labelH, y - labelH / 2));
                return (
                  <Text
                    key={`ylabel-${k}`}
                    numberOfLines={1}
                    style={{
                      position: "absolute",
                      top,
                      left: 0,
                      right: 0,
                      height: labelH,
                      lineHeight: labelH,
                      textAlign: "right",
                      color: theme.textSecondary,
                      fontSize: ms(9, 0.3),
                    }}
                  >
                    {value.toFixed(yDecimals) + yLabelSuffix(unit)}
                  </Text>
                );
              })}
            </View>
            {/* DIY X-ekseni etiketleri — gifted-charts'in dar slot'lu rendering'i etiketleri "..." gibi gosteriyordu.
                Burada her etiketi bagimsiz bir Text kutusuna koyup absolute positioned ciziyoruz.
                X-ekseni cizgisinin X_LABEL_GAP kadar altinda baslar (cizgiye yapismasin).
                Ilk etiket sola, son etiket saga hizali (Y-ekseni etiketiyle cakismasin / sag kenardan tasmasin). */}
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: CHART_HEIGHT + X_LABEL_GAP,
                left: 0,
                right: 0,
                height: xLabelHeight - X_LABEL_GAP,
              }}
            >
              {timeAxis.ticks.map((tick) => {
                const cx = xForTime(tick);
                const plotRight = plotStartOffset + drawableWidth;
                // Kutuyu plot icinde tut: ortali ama kenarlardan tasarsa sola/saga hizala.
                let left = cx - X_LABEL_SLOT_WIDTH / 2;
                let textAlign: "left" | "center" | "right" = "center";
                if (left < plotStartOffset) {
                  left = plotStartOffset;
                  textAlign = "left";
                } else if (left + X_LABEL_SLOT_WIDTH > plotRight) {
                  left = plotRight - X_LABEL_SLOT_WIDTH;
                  textAlign = "right";
                }
                return (
                  <Text
                    key={`xlabel-${tick}`}
                    numberOfLines={timeAxis.multiLine ? 2 : 1}
                    style={{
                      position: "absolute",
                      left,
                      top: 0,
                      width: X_LABEL_SLOT_WIDTH,
                      textAlign,
                      color: theme.textSecondary,
                      fontSize: ms(9, 0.3),
                      lineHeight: 11,
                    }}
                  >
                    {timeAxis.fmt(tick)}
                  </Text>
                );
              })}
            </View>
            {selectedIndex != null && (
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  top: 0,
                  left: selectionX,
                  width: 1,
                  height: CHART_HEIGHT,
                  backgroundColor: theme.textSecondary + "AA",
                  zIndex: 10,
                }}
              />
            )}
            {/* Tooltip overlay — chart'i asagi itmez */}
            {selectedTs != null && (
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  top: 4,
                  right: 4,
                  maxWidth: drawableWidth * 0.7,
                  paddingHorizontal: s(8),
                  paddingVertical: vs(4),
                  borderRadius: 8,
                  backgroundColor: theme.background,
                  borderWidth: 1,
                  borderColor: theme.border,
                  zIndex: 20,
                  shadowColor: theme.shadowColor,
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.12,
                  shadowRadius: 3,
                  elevation: 2,
                }}
              >
                <Text
                  style={{
                    fontSize: ms(10, 0.3),
                    fontWeight: "700",
                    color: theme.textSecondary,
                    marginBottom: 2,
                  }}
                >
                  {formatDay(new Date(selectedTs))} {formatTime(new Date(selectedTs))}
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {selectedValues.map((sv) => (
                    <View
                      key={sv.id}
                      style={{ flexDirection: "row", alignItems: "center" }}
                    >
                      <View
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 3,
                          backgroundColor: sv.color,
                          marginRight: 4,
                        }}
                      />
                      <Text style={{ fontSize: ms(10, 0.3), color: theme.textMain }}>
                        {sv.value != null ? sv.value.toFixed(decimals) : "-"}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </>
        ) : null}
      </View>

      {/* Yari saydam karartma + spinner — filtre degisikligi refetch'i sirasinda
          eski veri gozukmeye devam eder; sadece yumusakca dimlenir.
          Acik temada hafif, koyu temada daha belirgin. */}
      <Animated.View
        pointerEvents={loading ? "auto" : "none"}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          borderRadius: 12,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.isDark ? "rgba(0,0,0,0.42)" : "rgba(0,0,0,0.18)",
          opacity: overlayOpacity,
        }}
      >
        <ActivityIndicator size="small" color={theme.isDark ? theme.textOnPrimary : theme.primary} />
      </Animated.View>
    </View>
  );
});

export default MultiSeriesChart;
