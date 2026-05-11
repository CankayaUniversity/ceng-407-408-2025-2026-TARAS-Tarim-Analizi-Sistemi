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
