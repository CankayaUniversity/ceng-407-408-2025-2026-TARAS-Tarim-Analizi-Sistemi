// Field data types for 3D visualization

export interface FieldPolygon {
  exterior: [number, number][];
  holes?: [number, number][][];
}

export interface SensorNode {
  id: string;
  x: number;
  z: number;
  moisture: number;
  airTemperature: number;
  airHumidity: number;
}

export interface FieldData {
  polygon: FieldPolygon;
  nodes: SensorNode[];
}

function getPolygonBounds(polygon: [number, number][]) {
  const xs = polygon.map(p => p[0]);
  const zs = polygon.map(p => p[1]);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  };
}

// Calculate center of polygon using shoelace formula
export function calculatePolygonCentroid(exterior: [number, number][]): { x: number; z: number } {
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
    const xi = exterior[i][0], zi = exterior[i][1];
    const xj = exterior[j][0], zj = exterior[j][1];
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
    const xi = exterior[i][0], zi = exterior[i][1];
    const xj = exterior[j][0], zj = exterior[j][1];
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
