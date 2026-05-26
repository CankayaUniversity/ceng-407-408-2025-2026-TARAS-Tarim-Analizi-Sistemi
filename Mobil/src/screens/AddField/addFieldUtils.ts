// Tarla olusturma yardimci fonksiyonlari — saksi grid uretimi, sera donusumu, mock data
// ColorPlane.tsx ile uyumlu FieldData uretir (polygon + nodes)

import { calculatePolygonCentroid } from "../../utils/fieldPlaceholder";
import type { FieldData, SensorNode } from "../../utils/fieldPlaceholder";
import type { DashboardData } from "../../utils/api";
import type { ZoneDraft } from "./types";

// ── Saksi alan uretimi ─────────────────────────────────────────────────────────

/**
 * Saksi sayisindan FieldData uretir.
 * Grid duzeni ile sanal sensor node'lar yerlestirir.
 * ColorPlane'in Voronoi shader'i her node icin bir bolge olusturur.
 */
export function generatePotFieldData(potCount: number): FieldData {
  const cols = Math.ceil(Math.sqrt(potCount));
  const rows = Math.ceil(potCount / cols);

  const spacing = 12;
  const padding = 8;
  const potRadius = 3;

  const width = padding * 2 + (cols - 1) * spacing + potRadius * 2;
  const height = padding * 2 + (rows - 1) * spacing + potRadius * 2;

  const exterior: [number, number][] = [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
  ];

  const nodes: SensorNode[] = [];
  for (let i = 0; i < potCount; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = padding + potRadius + col * spacing;
    const cz = padding + potRadius + row * spacing;

    nodes.push({
      id: `pot-node-${i + 1}`,
      zone_id: `pot-zone-${i + 1}`,
      x: cx,
      z: cz,
      moisture: 30 + Math.random() * 40,
      airTemperature: 20 + Math.random() * 10,
      airHumidity: 40 + Math.random() * 30,
    });
  }

  return { polygon: { exterior }, nodes, isPotField: true as const };
}

/**
 * Saksi sayisindan ZoneDraft dizisi uretir.
 * Her saksi icin sekizgen (octagon) geometri noktasi olusturur.
 */
export function generatePotZones(potCount: number): ZoneDraft[] {
  const cols = Math.ceil(Math.sqrt(potCount));
  const spacing = 12;
  const padding = 8;
  const potRadius = 3;

  const zones: ZoneDraft[] = [];
  for (let i = 0; i < potCount; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = padding + potRadius + col * spacing;
    const cz = padding + potRadius + row * spacing;

    // Sekizgen noktalar
    const points: [number, number][] = [];
    for (let a = 0; a < 8; a++) {
      const angle = (a * Math.PI * 2) / 8;
      points.push([
        cx + potRadius * Math.cos(angle),
        cz + potRadius * Math.sin(angle),
      ]);
    }

    zones.push({
      id: `pot-zone-${i + 1}`,
      name: `Pot ${i + 1}`,
      zoneType: "POT",
      polygonPoints: points,
      potIndex: i,
    });
  }
  return zones;
}

// ── Sera donusumu ───────────────────────────────────────────────────────────────

/**
 * Sera dis poligonu ve bolge poligonlarindan FieldData uretir.
 * Her bolgenin centroid'ine sanal sensor node yerlestirir.
 */
export function generateGreenhouseFieldData(
  outerPolygon: [number, number][],
  zones: ZoneDraft[],
): FieldData {
  const nodes: SensorNode[] = zones.map((zone, i) => {
    const centroid = calculatePolygonCentroid(zone.polygonPoints);
    return {
      id: `zone-node-${i + 1}`,
      zone_id: zone.id,
      x: centroid.x,
      z: centroid.z,
      moisture: 30 + Math.random() * 40,
      airTemperature: 20 + Math.random() * 10,
      airHumidity: 40 + Math.random() * 30,
    };
  });

  return {
    polygon: { exterior: outerPolygon },
    nodes,
  };
}

// ── Mock dashboard verisi ───────────────────────────────────────────────────────

/**
 * Frontend-only FieldData'dan tam DashboardData uretir.
 * Backend baglantisi yapildiginda bu fonksiyon yerine gercek API kullanilacak.
 */
export function generateMockDashboardData(
  fieldData: FieldData,
): DashboardData {
  const { nodes } = fieldData;
  const avgMoisture =
    nodes.length > 0
      ? Math.round(nodes.reduce((s, n) => s + n.moisture, 0) / nodes.length)
      : 50;

  const now = new Date();
  const tomorrow = new Date(now.getTime() + 86_400_000);

  return {
    weather: { airTemperature: 24, airHumidity: 55 },
    irrigation: {
      nextIrrigationTime: tomorrow.toISOString(),
      isScheduled: false,
    },
    sensors: {
      soilMoisture: avgMoisture,
      nodeCount: nodes.length,
      lastReadingTime: now.toISOString(),
    },
    field: fieldData,
  };
}

// ── Polygon bolme (zone division) ──────────────────────────────────────────────

/** Nokta → dogru parcasi uzerindeki en yakin noktayi bul */
function projectPointOnSegment(
  p: [number, number],
  a: [number, number],
  b: [number, number],
): { point: [number, number]; t: number; dist: number } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const ex = p[0] - a[0];
    const ey = p[1] - a[1];
    return { point: [a[0], a[1]], t: 0, dist: Math.sqrt(ex * ex + ey * ey) };
  }
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = a[0] + t * dx;
  const projY = a[1] + t * dy;
  const ex = p[0] - projX;
  const ey = p[1] - projY;
  return { point: [projX, projY], t, dist: Math.sqrt(ex * ex + ey * ey) };
}

/** Bir noktanin polygon kenarindaki en yakin konumunu bul */
function snapToPolygonEdge(
  p: [number, number],
  polygon: [number, number][],
): { point: [number, number]; edgeIndex: number; t: number } {
  let bestDist = Infinity;
  let bestEdge = 0;
  let bestT = 0;
  let bestPoint: [number, number] = [0, 0];

  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    const proj = projectPointOnSegment(p, a, b);
    if (proj.dist < bestDist) {
      bestDist = proj.dist;
      bestEdge = i;
      bestT = proj.t;
      bestPoint = proj.point;
    }
  }
  return { point: bestPoint, edgeIndex: bestEdge, t: bestT };
}

/** Point-in-polygon testi (ray casting) */
function pointInPolygon(p: [number, number], polygon: [number, number][]): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Bir zone polygon'unu iki nokta ile ikiye bol.
 * p1 ve p2 polygon kenarindaki noktalara snap edilir.
 * Sonuc: iki yeni polygon dizisi.
 */
export function splitPolygon(
  polygon: [number, number][],
  rawP1: [number, number],
  rawP2: [number, number],
): [[number, number][], [number, number][]] | null {
  const n = polygon.length;
  if (n < 3) return null;

  const snap1 = snapToPolygonEdge(rawP1, polygon);
  const snap2 = snapToPolygonEdge(rawP2, polygon);

  // Ayni kenardalarsa bolme yapilamaz
  if (snap1.edgeIndex === snap2.edgeIndex) return null;

  // Polygon'a snap noktalarini ekle ve iki parcaya ayir
  // Kenar indekslerine gore sirala (kucukten buyuge)
  let e1 = snap1.edgeIndex;
  let e2 = snap2.edgeIndex;
  let pt1 = snap1.point;
  let pt2 = snap2.point;

  if (e1 > e2) {
    [e1, e2] = [e2, e1];
    [pt1, pt2] = [pt2, pt1];
  }

  // Polygon vertex'lerini yeniden olustur, snap noktalarini araya ekle
  const expanded: [number, number][] = [];
  let idx1 = -1;
  let idx2 = -1;

  for (let i = 0; i < n; i++) {
    expanded.push(polygon[i]);
    if (i === e1) {
      expanded.push(pt1);
      idx1 = expanded.length - 1;
    }
    if (i === e2) {
      expanded.push(pt2);
      idx2 = expanded.length - 1;
    }
  }

  if (idx1 === -1 || idx2 === -1) return null;

  // Polygon A: idx1 → idx2 yonunde yuru
  const polyA: [number, number][] = [];
  for (let i = idx1; i <= idx2; i++) {
    polyA.push(expanded[i]);
  }

  // Polygon B: idx2 → idx1 yonunde yuru (wrap)
  const polyB: [number, number][] = [];
  const en = expanded.length;
  for (let i = idx2; i !== idx1; i = (i + 1) % en) {
    polyB.push(expanded[i]);
  }
  polyB.push(expanded[idx1]);

  if (polyA.length < 3 || polyB.length < 3) return null;

  return [polyA, polyB];
}

/**
 * Bir bolme noktasinin hangi mevcut zone'a dustugunu bul.
 * Bulamazsa boundary centroid'e en yakin zone'u dondurur.
 */
export function findZoneForPoint(
  p: [number, number],
  zones: ZoneDraft[],
): number {
  for (let i = 0; i < zones.length; i++) {
    if (pointInPolygon(p, zones[i].polygonPoints)) return i;
  }
  // Kenar uzerindeyse en yakin centroid'li zone'u dondur
  let minDist = Infinity;
  let bestIdx = 0;
  for (let i = 0; i < zones.length; i++) {
    const c = getCentroid(zones[i].polygonPoints);
    const dx = p[0] - c[0];
    const dy = p[1] - c[1];
    const dist = dx * dx + dy * dy;
    if (dist < minDist) {
      minDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function getCentroid(pts: [number, number][]): [number, number] {
  const n = pts.length;
  if (n === 0) return [50, 50];
  const sx = pts.reduce((s, p) => s + p[0], 0);
  const sy = pts.reduce((s, p) => s + p[1], 0);
  return [sx / n, sy / n];
}

// ── Yardimci ────────────────────────────────────────────────────────────────────

/** Basit UUID v4 benzeri benzersiz kimlik ureteci */
export function generateId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Alan hesapla (shoelace formulu) — FieldSummary.area icin */
export function calculatePolygonArea(points: [number, number][]): number {
  const n = points.length;
  if (n < 3) return 0;

  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i][0] * points[j][1];
    area -= points[j][0] * points[i][1];
  }
  return Math.abs(area / 2);
}
