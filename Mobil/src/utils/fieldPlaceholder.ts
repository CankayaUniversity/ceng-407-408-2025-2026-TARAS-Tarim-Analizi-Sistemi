// Tarla veri tipleri - 3D gorsellestirme icin polygon ve sensor node
// calculatePolygonCentroid ile merkezini hesaplar

export interface FieldPolygon {
  exterior: [number, number][];
  holes?: [number, number][][];
}

export interface SensorNode {
  id: string;
  zone_id?: string;
  // Zone'un gercek adi (ornek "Sera 1"). Backend dashboard'da henuz yok — DashboardContext
  // zone_id -> zone_name haritasiyla cozuluyor. Backend gonderirse buradan otomatik akar.
  zone_name?: string;
  x: number;
  z: number;
  moisture: number;
  airTemperature: number;
  airHumidity: number;
  // Bu zone'da kayitli sensor sayisi. Pin'ler bu sayiya gore zone merkezine
  // yayilir (1=ortada, 3=ucgen...). 0 → pin yok. Eski veride yoksa 1 varsayilir.
  sensorCount?: number;
  // Pin yayma yaricapi (field birimi) — backend zone extent'inden hesaplar.
  // Yoksa (demo/eski veri) frontend pin boyuna gore fallback kullanir.
  spreadRadius?: number;
}

export interface FieldData {
  polygon: FieldPolygon;
  nodes: SensorNode[];
  isPotField?: boolean;
}

function getPolygonBounds(polygon: [number, number][]) {
  const xs = polygon.map((p) => p[0]);
  const zs = polygon.map((p) => p[1]);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  };
}

// Calculate center of polygon using shoelace formula
export function calculatePolygonCentroid(exterior: [number, number][]): {
  x: number;
  z: number;
} {
  const n = exterior.length;

  if (n < 3) {
    const bounds = getPolygonBounds(exterior);
    return {
      x: (bounds.minX + bounds.maxX) / 2,
      z: (bounds.minZ + bounds.maxZ) / 2,
    };
  }

  let signedArea = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const xi = exterior[i][0],
      zi = exterior[i][1];
    const xj = exterior[j][0],
      zj = exterior[j][1];
    signedArea += xi * zj - xj * zi;
  }
  signedArea /= 2;

  if (Math.abs(signedArea) < 1e-10) {
    const bounds = getPolygonBounds(exterior);
    return {
      x: (bounds.minX + bounds.maxX) / 2,
      z: (bounds.minZ + bounds.maxZ) / 2,
    };
  }

  let cx = 0;
  let cz = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const xi = exterior[i][0],
      zi = exterior[i][1];
    const xj = exterior[j][0],
      zj = exterior[j][1];
    const cross = xi * zj - xj * zi;
    cx += (xi + xj) * cross;
    cz += (zi + zj) * cross;
  }

  const factor = 1 / (6 * signedArea);
  return {
    x: cx * factor,
    z: cz * factor,
  };
}
