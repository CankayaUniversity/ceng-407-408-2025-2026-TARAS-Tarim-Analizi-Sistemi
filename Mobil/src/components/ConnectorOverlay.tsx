// Secili zone'u sensor/sulama kartina baglayan canli baglanti cizgisi.
// PERF: SVG <Path> her frame yeniden cizmek pahaliydi (UI thread'i kilitliyordu). Bunun yerine
// cizgi, SADECE transform ile hareket eden bir kac kucuk View "segment"inden olusur — GPU'da
// composite edilir, yeniden raster YOK. Segmentler bir kubik Bezier'i takip eder → yumusak egri.
//
// RENK: cizgi balonla (FeaturedZoneCard) AYNI renkleri kullanir — ic = pastel dolgu tonu,
// kenar (kilif) = zone rengi. Renkler OPAK olmali: saydam olsa segment eklemleri ust uste binip
// lekelenir. Bu yuzden IKI GECIS — once TUM kenar segmentleri, sonra TUM ic segmentleri ustune
// (koyu/kenar asla ic'i ortmez). Cizginin ust ucu NOKTA olmadan dogrudan balonun KENARINA deginir.
// Kart ucu altinda iki spot; zone esigi gecince anchor yumusak gecer.
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import type { ZoneScreenPos } from "./ColorPlane";

// ─── Gorsel + hareket ayarlari — buradan kolayca duzenle ─────────────────────
const SEG_COUNT = 16; // egriyi kac segmente bolelim (cok = daha yumusak, hepsi transform = ucuz)
const TAIL_WIDTH = 2; // ic (pastel) cekirdek kalinligi
const CASING_EXTRA = 1; // kenar (zone rengi) cekirdekten bu kadar genis → her yandan 0.5
const LINE_H = TAIL_WIDTH + CASING_EXTRA; // 3 — balon kenarligiyla AYNI kalinlik
const MARKER_R = 5;
const FADE_MS = 240;

// Ust baglanti — kart altinda iki spot (kart genisliginin orani)
const SPOT_A_FRAC = 0.3; // sol spot
const SPOT_B_FRAC = 0.7; // sag spot
const ANCHOR_OVERLAP = 0; // cizginin ust ucu TAM balon KENARINDA biter — icine girmez, nokta yok
// Zone, kart merkezinden bu kadar (kart genisliginin orani) uzaklasinca anchor taraf degistirir.
// Hysteresis: merkez ± esik arasinda mevcut taraf korunur (esik geri-gecis titremesini onler).
const SWAP_THRESHOLD_FRAC = 0.15;
// Taraf degisimi YUMUSAK — timing + ease, overshoot yok.
const SWAP_MS = 320;
// Ic dolgu pastel orani — balon ile AYNI: FeaturedZoneCard `pastel(zoneColor, 0.55)` kullaniyor
const CORE_PASTEL = 0.55;
// ─────────────────────────────────────────────────────────────────────────────

// hex'i beyaza dogru harmanla (pastel) — balonun ic dolgusuyla AYNI ton (FeaturedZoneCard ile ayni)
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

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ConnectorOverlayProps {
  // Secili zone'un canvas icindeki konumu (0..1 fraction) — ColorPlane her frame yazar
  zonePosSV: SharedValue<ZoneScreenPos>;
  // Kart ve canvas dikdortgenleri — overlay-yerel koordinatlar (sol-ust orijin)
  cardRect: Rect | null;
  canvasRect: Rect | null;
  // Cizgi gorunsun mu (zone secili && 3D plane hazir)
  active: boolean;
  // Zone'un nem rengi (#rrggbb) — cizgi bu tondan
  zoneColor: string;
}

// Tek segment — kubik egrinin [t0,t1] dilimini kaplayan, SADECE transform ile yerlesen ince View.
// `thickness` katmana gore degisir: kilif gecisi = LINE_H, cekirdek gecisi = TAIL_WIDTH.
interface SegmentProps {
  index: number;
  thickness: number;
  color: string;
  zonePosSV: SharedValue<ZoneScreenPos>;
  anchorT: SharedValue<number>;
  cardRect: Rect | null;
  canvasRect: Rect | null;
}

const Segment = ({
  index,
  thickness,
  color,
  zonePosSV,
  anchorT,
  cardRect,
  canvasRect,
}: SegmentProps) => {
  const style = useAnimatedStyle(() => {
    const zp = zonePosSV.value;
    if (!zp.visible || !canvasRect || !cardRect) {
      return { transform: [{ translateX: 0 }, { translateY: 0 }, { rotateZ: "0rad" }, { scaleX: 0 }] };
    }
    // Egrinin iki ucu: anchor (kart alti) → zone
    const zx = canvasRect.x + zp.fx * canvasRect.w;
    const zy = canvasRect.y + zp.fy * canvasRect.h;
    const spotA = cardRect.x + cardRect.w * SPOT_A_FRAC;
    const spotB = cardRect.x + cardRect.w * SPOT_B_FRAC;
    const ax = spotA + (spotB - spotA) * anchorT.value;
    const ay = cardRect.y + cardRect.h - ANCHOR_OVERLAP;
    const dy = zy - ay;
    // Kontrol noktalari: anchor'in altinda + zone'un ustunde (iki ucta dikey tanjant)
    const p1y = ay + dy * 0.4;
    const p2y = zy - dy * 0.4;
    // Kubik Bezier'i t0 ve t1'de orneklemek (x: ax,ax,zx,zx — y: ay,p1y,p2y,zy)
    const t0 = index / SEG_COUNT;
    const t1 = (index + 1) / SEG_COUNT;
    const m0 = 1 - t0;
    const x0 = m0 * m0 * m0 * ax + 3 * m0 * m0 * t0 * ax + 3 * m0 * t0 * t0 * zx + t0 * t0 * t0 * zx;
    const y0 = m0 * m0 * m0 * ay + 3 * m0 * m0 * t0 * p1y + 3 * m0 * t0 * t0 * p2y + t0 * t0 * t0 * zy;
    const m1 = 1 - t1;
    const x1 = m1 * m1 * m1 * ax + 3 * m1 * m1 * t1 * ax + 3 * m1 * t1 * t1 * zx + t1 * t1 * t1 * zx;
    const y1 = m1 * m1 * m1 * ay + 3 * m1 * m1 * t1 * p1y + 3 * m1 * t1 * t1 * p2y + t1 * t1 * t1 * zy;
    // Segmentin orta noktasi + acisi + uzunlugu → birim kutuyu buraya otururuz
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    const len = Math.hypot(x1 - x0, y1 - y0);
    const ang = Math.atan2(y1 - y0, x1 - x0);
    return {
      transform: [
        { translateX: mx - 0.5 },
        { translateY: my - thickness / 2 },
        { rotateZ: `${ang}rad` },
        { scaleX: len },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        { position: "absolute", left: 0, top: 0, width: 1, height: thickness, backgroundColor: color },
        style,
      ]}
    />
  );
};

export const ConnectorOverlay = ({
  zonePosSV,
  cardRect,
  canvasRect,
  active,
  zoneColor,
}: ConnectorOverlayProps) => {
  // Tum cizginin fade'i — active degisince tek seferlik timing
  const progress = useSharedValue(0);
  useEffect(() => {
    const show = active && cardRect !== null && canvasRect !== null ? 1 : 0;
    progress.value = withTiming(show, { duration: FADE_MS });
  }, [active, cardRect, canvasRect, progress]);

  const containerStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  // side: anchor hangi spot'ta (0 = sol, 1 = sag). anchorT: side'a dogru yumusak ilerler.
  const side = useSharedValue(0);
  const anchorT = useSharedValue(0);

  // Zone yatayda esigi gecince anchor'u diger spot'a yumusak tasi (hysteresis ile)
  useAnimatedReaction(
    () => {
      const zp = zonePosSV.value;
      if (!zp.visible || !canvasRect || !cardRect) return side.value;
      const zx = canvasRect.x + zp.fx * canvasRect.w;
      const centerX = cardRect.x + cardRect.w / 2;
      const threshold = cardRect.w * SWAP_THRESHOLD_FRAC;
      if (zx > centerX + threshold) return 1; // zone cok sagda → sag spot
      if (zx < centerX - threshold) return 0; // zone cok solda → sol spot
      return side.value; // esik icinde → mevcut tarafi koru
    },
    (desired) => {
      if (desired !== side.value) {
        side.value = desired;
        anchorT.value = withTiming(desired, {
          duration: SWAP_MS,
          easing: Easing.inOut(Easing.cubic),
        });
      }
    },
    [canvasRect, cardRect],
  );

  // Zone ucundaki isaretci — (zx,zy)'ye tasinir; cocuklar yaricap kadar negatif offset ile ortalanir
  const markerStyle = useAnimatedStyle(() => {
    const zp = zonePosSV.value;
    if (!zp.visible || !canvasRect) {
      return { opacity: 0, transform: [{ translateX: 0 }, { translateY: 0 }] };
    }
    return {
      opacity: 1,
      transform: [
        { translateX: canvasRect.x + zp.fx * canvasRect.w },
        { translateY: canvasRect.y + zp.fy * canvasRect.h },
      ],
    };
  });

  // Balonla AYNI renkler (opak — saydamlik eklem lekesi yapardi): ic = pastel dolgu, kenar = zone rengi
  const coreColor = pastel(zoneColor, CORE_PASTEL); // ic (balon dolgusu tonu)
  const casingColor = zoneColor; // kenar/kilif (balon kenarligi tonu)

  // Segment dizisi — ayni indeksler iki gecis icin (kilif + cekirdek)
  const indices = Array.from({ length: SEG_COUNT }, (_, i) => i);

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, containerStyle]}>
      {/* GECIS 1 — TUM koyu kilifler (cekirdeklerin ALTINDA kalir) */}
      {indices.map((i) => (
        <Segment
          key={`casing-${i}`}
          index={i}
          thickness={LINE_H}
          color={casingColor}
          zonePosSV={zonePosSV}
          anchorT={anchorT}
          cardRect={cardRect}
          canvasRect={canvasRect}
        />
      ))}
      {/* GECIS 2 — TUM parlak cekirdekler (kilifin USTUNDE; koyu asla parlagi ortmez) */}
      {indices.map((i) => (
        <Segment
          key={`core-${i}`}
          index={i}
          thickness={TAIL_WIDTH}
          color={coreColor}
          zonePosSV={zonePosSV}
          anchorT={anchorT}
          cardRect={cardRect}
          canvasRect={canvasRect}
        />
      ))}
      {/* Zone ucu — balon kenari tonunda halka + balon ic (pastel) tonunda dolu nokta */}
      <Animated.View style={[{ position: "absolute", left: 0, top: 0 }, markerStyle]}>
        <View
          style={{
            position: "absolute",
            left: -(MARKER_R + 3),
            top: -(MARKER_R + 3),
            width: (MARKER_R + 3) * 2,
            height: (MARKER_R + 3) * 2,
            borderRadius: MARKER_R + 3,
            borderWidth: 2,
            borderColor: casingColor,
          }}
        />
        <View
          style={{
            position: "absolute",
            left: -MARKER_R,
            top: -MARKER_R,
            width: MARKER_R * 2,
            height: MARKER_R * 2,
            borderRadius: MARKER_R,
            backgroundColor: coreColor,
          }}
        />
      </Animated.View>
    </Animated.View>
  );
};
