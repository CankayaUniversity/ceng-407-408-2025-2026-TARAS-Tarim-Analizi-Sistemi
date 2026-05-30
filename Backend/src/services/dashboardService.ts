import { prisma } from "../config/database";
import {
  FieldListItem,
  DashboardResponse,
  DashboardNode,
  PolygonData,
} from "../types";
import { getAccessibleFarmIds, resolveFieldAccess } from "./accessService";

// get all fields the user can access (owned + stakeholder), optionally filtered by farm_id
export async function getUserFields(userId: string, farmId?: string): Promise<FieldListItem[]> {
  // Sahibi olunan + paydas olarak erisilen ciftlikler. farmId verilirse erisim dogrulanir.
  const accessibleIds = await getAccessibleFarmIds(userId);
  const allowedIds = farmId
    ? accessibleIds.includes(farmId)
      ? [farmId]
      : []
    : accessibleIds;

  if (allowedIds.length === 0) return [];

  const farms = await prisma.farm.findMany({
    where: { farm_id: { in: allowedIds } },
    include: {
      fields: {
        // is_active: { not: false } — soft-deleted (false) field'leri eler; is_active null
        // olan eski kayitlari (Prisma "not" null'lari dahil eder) gizlemez.
        where: { is_active: { not: false } },
        select: {
          field_id: true,
          name: true,
          area: true,
        },
      },
    },
  });

  return farms.flatMap((farm) =>
    farm.fields.map((field) => ({
      id: field.field_id,
      name: field.name,
      area: field.area ?? 0,
      farm_id: farm.farm_id,
    })),
  );
}

// Bu tarlaya OKUMA erisimi var mi? Sahibi (owner) VEYA paydasi (stakeholder).
// Yalnizca okuma uclari + LLM sohbet araclari bunu cagirir; yazma yollari owner kontrolu yapar.
export async function checkFieldAccess(
  userId: string,
  fieldId: string,
): Promise<boolean> {
  return (await resolveFieldAccess(userId, fieldId)) !== null;
}

// Polygon centroid (shoelace formula) — zone'lar icin sentetik node konumu hesaplar
function polygonCentroid(pts: [number, number][]): { x: number; z: number } {
  const n = pts.length;
  if (n < 3) {
    const xs = pts.map((p) => p[0]);
    const zs = pts.map((p) => p[1]);
    return {
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      z: (Math.min(...zs) + Math.max(...zs)) / 2,
    };
  }
  let area = 0;
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const pi = pts[i]!;
    const pj = pts[j]!;
    const cross = pi[0] * pj[1] - pj[0] * pi[1];
    area += cross;
    cx += (pi[0] + pj[0]) * cross;
    cz += (pi[1] + pj[1]) * cross;
  }
  area /= 2;
  if (Math.abs(area) < 1e-10) {
    const xs = pts.map((p) => p[0]);
    const zs = pts.map((p) => p[1]);
    return {
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      z: (Math.min(...zs) + Math.max(...zs)) / 2,
    };
  }
  const f = 1 / (6 * area);
  return { x: cx * f, z: cz * f };
}

// get dashboard data for a field
export async function getFieldDashboard(
  fieldId: string,
): Promise<DashboardResponse | null> {
  // Tek sorguda tarla + node + son okuma + pending job + zone bilgisi al
  const [field, nodeRows, jobRows, zoneRows] = await Promise.all([
    // 1) Tarla polygon verisi + ortam tipi (sera / saksi)
    prisma.field.findUnique({
      where: { field_id: fieldId },
      select: { field_id: true, polygon: true, environment_type: true },
    }),
    // 2) Node pozisyonlari + son okuma (DISTINCT ON ile tek sorgu)
    prisma.$queryRawUnsafe<{
      node_id: string;
      zone_id: string;
      x: number | null;
      z: number | null;
      sm_percent: number | null;
      temperature: number | null;
      humidity: number | null;
      created_at: Date | null;
    }[]>(
      `SELECT sn.node_id, sn.zone_id, sn.x, sn.z, lr.sm_percent, lr.temperature, lr.humidity, lr.created_at
       FROM sensor_nodes sn
       JOIN zones z ON z.zone_id = sn.zone_id
       LEFT JOIN LATERAL (
         SELECT sr.sm_percent, sr.temperature, sr.humidity, sr.created_at
         FROM sensor_readings sr
         WHERE sr.node_id = sn.node_id
         ORDER BY sr.created_at DESC
         LIMIT 1
       ) lr ON true
       WHERE z.field_id = $1`,
      fieldId,
    ),
    // 3) Pending irrigation job
    prisma.irrigationJob.findFirst({
      where: {
        zone: { field_id: fieldId },
        status: "PENDING",
      },
      orderBy: { created_at: "asc" },
      select: { actual_start_time: true, created_at: true },
    }),
    // 4) Zone polygon'lari — sensor_node'u olmayan zone'lar icin sentetik node uretimi
    prisma.zone.findMany({
      where: { field_id: fieldId },
      select: { zone_id: true, polygon: true },
    }),
  ]);

  if (!field) {
    return null;
  }

  // Sensor verilerini topla — node bazli DEGIL, ZONE bazli.
  // sn.x/z saklanmadigi icin (hep null → 0,0'a cokuyordu) konum artik HER ZAMAN
  // zone polygon centroid'inden gelir. Her zone tek bir temsilci node uretir
  // (Voronoi hucresi + saksi + pin tabani); sensorCount = zone'daki kayitli sensor
  // sayisi, frontend pin'leri buna gore yayar (0 ise pin gostermez).
  let totalMoisture = 0;
  let totalTemperature = 0;
  let totalHumidity = 0;
  let readingCount = 0;
  let latestReadingTime: Date | null = null;

  // Zone bazinda topla: okuma ortalamasi (sadece okumasi olan sensorler) + sensor sayisi
  interface ZoneAgg {
    sumMoisture: number;
    sumTemperature: number;
    sumHumidity: number;
    readingCount: number;
    sensorCount: number;
  }
  const zoneAgg = new Map<string, ZoneAgg>();
  for (const node of nodeRows) {
    const agg =
      zoneAgg.get(node.zone_id) ?? {
        sumMoisture: 0,
        sumTemperature: 0,
        sumHumidity: 0,
        readingCount: 0,
        sensorCount: 0,
      };
    agg.sensorCount += 1;
    if (node.sm_percent != null) {
      const moisture = node.sm_percent;
      const temperature = node.temperature ?? 0;
      const humidity = node.humidity ?? 0;
      agg.sumMoisture += moisture;
      agg.sumTemperature += temperature;
      agg.sumHumidity += humidity;
      agg.readingCount += 1;
      // Tarla geneli ortalama — sensor bazli (onceki davranisla ayni)
      totalMoisture += moisture;
      totalTemperature += temperature;
      totalHumidity += humidity;
      readingCount++;
      if (
        node.created_at &&
        (!latestReadingTime || node.created_at > latestReadingTime)
      ) {
        latestReadingTime = node.created_at;
      }
    }
    zoneAgg.set(node.zone_id, agg);
  }

  // Field polygon — sera icin saklanan polygon; saksi tarlada asagida kanonik
  // wizard grid'iyle DEGISTIRILIR (saklanan polygon saksi dizilimine uymayabilir).
  let polygon: PolygonData = field.polygon
    ? (field.polygon as unknown as PolygonData)
    : { exterior: [], holes: [] };

  // Saksi tarla tespiti — node yerlesimi buna gore degisir, o yuzden donus objesinden
  // buraya tasindi. environment_type acikca set edilmisse onu kullan; NULL ise (eski
  // kayit / DB insert) zone geometrisinden cikar (saksi wizard'i her zone icin 8 koseli).
  const isPotField =
    field.environment_type === "pot" ||
    (!field.environment_type &&
      zoneRows.length > 0 &&
      zoneRows.every((z) => {
        const p = z.polygon as { exterior?: unknown[] } | null;
        return p?.exterior?.length === 8;
      }));

  // Her zone icin tek temsilci node — okuma ortalamasi + sensor sayisi ortak.
  const aggFor = (zoneId: string) => {
    const agg = zoneAgg.get(zoneId);
    const rc = agg?.readingCount ?? 0;
    return {
      sensorCount: agg?.sensorCount ?? 0,
      moisture: rc > 0 ? agg!.sumMoisture / rc : 0,
      airTemperature: rc > 0 ? agg!.sumTemperature / rc : 0,
      airHumidity: rc > 0 ? agg!.sumHumidity / rc : 0,
    };
  };

  const allNodes: DashboardNode[] = [];
  let totalSensorCount = 0;

  if (isPotField) {
    // SAKSI TARLA: zone polygon koordinatlari guvenilmez (field polygon'dan farkli
    // uzayda olabilir veya eksik). "Onceki saksi dizilim mantigi" = wizard'in kullandigi
    // grid (Mobil/src/screens/AddField/addFieldUtils.ts -> generatePotFieldData):
    // cols=ceil(sqrt(n)), spacing=12, padding=8, potRadius=3. Hem saksilari HEM de FIELD
    // polygon'unu bu kanonik grid'den ureticez → dashboard, wizard onizlemesiyle birebir
    // ayni gorunur. Sira zone_id'ye gore sabit (yenilemede saksilar yer degistirmesin).
    const sorted = [...zoneRows].sort((a, b) =>
      a.zone_id.localeCompare(b.zone_id),
    );
    const n = sorted.length;
    // "Akilli" dizilim: n'i en kareye yakin TAM carpanlarina ayir — bos hucre/L-sekli yok.
    // rows = sqrt(n) altindaki en buyuk bolen, cols = n/rows (cols >= rows → yatay sira).
    // Ornek: 3 → 3x1 (tek sira), 4 → 2x2, 6 → 3x2, 5/7 (asal) → tek sira, 9 → 3x3.
    let rows = 1;
    for (let c = Math.floor(Math.sqrt(n)); c >= 1; c--) {
      if (n % c === 0) {
        rows = c;
        break;
      }
    }
    const cols = n > 0 ? n / rows : 1;
    const SPACING = 12;
    // Dar padding — sentezlenen polygon saksilari sikica sarsin. Kamera field'in en buyuk
    // boyutunu cerceveler; genis kenar bosluklari saksilari kuculttup "zoom out" gosteriyordu.
    // (Kameranin kendi %15 marji zaten var — HomeScreen FIELD_EXTENT*PADDING.)
    const PADDING = 2;
    const POT_RADIUS = 3;
    const width = PADDING * 2 + (cols - 1) * SPACING + POT_RADIUS * 2;
    const height = PADDING * 2 + (rows - 1) * SPACING + POT_RADIUS * 2;
    polygon = {
      exterior: [
        [0, 0],
        [width, 0],
        [width, height],
        [0, height],
      ] as [number, number][],
      holes: [],
    };
    // Pin yayma yaricapi saksi yaricapinin yarisi — cok sensorlu saksida pinler ustte kalir.
    const spreadRadius = POT_RADIUS * 0.5;
    sorted.forEach((zone, i) => {
      const r = aggFor(zone.zone_id);
      totalSensorCount += r.sensorCount;
      allNodes.push({
        id: `zone-${zone.zone_id}`,
        zone_id: zone.zone_id,
        x: PADDING + POT_RADIUS + (i % cols) * SPACING,
        z: PADDING + POT_RADIUS + Math.floor(i / cols) * SPACING,
        ...r,
        spreadRadius,
      });
    });
  } else {
    // SERA: zone centroid konumu field ile ayni uzayda, guvenilir. Voronoi hucresi +
    // pin tabani buradan. Polygon'u olmayan zone atlanir (centroid hesaplanamaz, ama
    // sera duzlemi yine cizildigi icin ekran bos kalmaz).
    for (const zone of zoneRows) {
      const poly = zone.polygon as { exterior?: [number, number][] } | null;
      if (!poly?.exterior?.length) continue;
      const center = polygonCentroid(poly.exterior);
      const xs = poly.exterior.map((p) => p[0]);
      const zs = poly.exterior.map((p) => p[1]);
      const minDim = Math.min(
        Math.max(...xs) - Math.min(...xs),
        Math.max(...zs) - Math.min(...zs),
      );
      const r = aggFor(zone.zone_id);
      totalSensorCount += r.sensorCount;
      allNodes.push({
        id: `zone-${zone.zone_id}`,
        zone_id: zone.zone_id,
        x: center.x,
        z: center.z,
        ...r,
        spreadRadius: 0.28 * minDim,
      });
    }
  }

  // calc averages
  const avgMoisture = readingCount > 0 ? totalMoisture / readingCount : 0;
  const avgTemperature = readingCount > 0 ? totalTemperature / readingCount : 0;
  const avgHumidity = readingCount > 0 ? totalHumidity / readingCount : 0;

  // Sulama bilgisi
  let nextIrrigationTime: string | null = null;
  let isScheduled = false;

  if (jobRows) {
    const scheduledTime = jobRows.actual_start_time ?? jobRows.created_at;
    if (scheduledTime) {
      nextIrrigationTime = scheduledTime.toISOString();
      isScheduled = true;
    }
  }

  return {
    weather: {
      airTemperature: Number(avgTemperature.toFixed(1)),
      airHumidity: Number(avgHumidity.toFixed(0)),
    },
    irrigation: {
      nextIrrigationTime,
      isScheduled,
    },
    sensors: {
      soilMoisture: Number(avgMoisture.toFixed(0)),
      nodeCount: totalSensorCount,
      lastReadingTime: latestReadingTime
        ? latestReadingTime.toISOString()
        : null,
    },
    field: {
      polygon,
      nodes: allNodes,
      isPotField,
    },
  };
}

// Hafif envanter — sadece isimler ve ID'ler
export async function getFieldInventory(userId: string) {
  return prisma.farm.findMany({
    where: { user_id: userId },
    select: {
      farm_id: true,
      name: true,
      fields: {
        select: {
          field_id: true,
          name: true,
          crop_name: true,
          zones: {
            select: { zone_id: true, name: true },
          },
        },
      },
    },
  });
}

// Kullanici meta — LLM kontekstine isim + rol enjekte etmek icin (Part B).
export async function getUserMeta(userId: string) {
  const user = await prisma.user.findUnique({
    where: { user_id: userId },
    select: { username: true, role: { select: { role_name: true } } },
  });
  return {
    username: user?.username ?? null,
    role: user?.role?.role_name ?? null,
  };
}

// create a new field with zones under the user's farm
interface CreateFieldInput {
  fieldName: string;
  cropName?: string;
  fieldType: "greenhouse" | "pot";
  polygon: { exterior: [number, number][]; holes?: [number, number][][] };
  area: number;
  zones: {
    name: string;
    polygon: { exterior: [number, number][]; holes?: [number, number][][] };
    cropId?: number;
    plantingDate?: string; // ISO date string (YYYY-MM-DD)
  }[];
  farmId?: string;
}

export async function createField(
  userId: string,
  input: CreateFieldInput,
): Promise<FieldListItem> {
  const farm = await prisma.farm.findFirst({
    where: { user_id: userId, ...(input.farmId ? { farm_id: input.farmId } : {}) },
    select: { farm_id: true },
  });

  if (!farm) {
    throw new Error("NO_FARM");
  }

  const environmentType = input.fieldType;

  // create field + zones + plantings in a single transaction
  const field = await prisma.$transaction(async (tx) => {
    const newField = await tx.field.create({
      data: {
        farm_id: farm.farm_id,
        name: input.fieldName,
        crop_name: input.cropName || null,
        area: input.area,
        polygon: input.polygon,
        environment_type: environmentType,
      },
    });

    if (input.zones.length > 0) {
      const createdZones = await tx.zone.createManyAndReturn({
        data: input.zones.map((z) => ({
          field_id: newField.field_id,
          name: z.name,
          polygon: z.polygon,
        })),
        select: { zone_id: true, name: true },
      });

      // create planting records for zones that have crop/planting info
      const plantingData = createdZones
        .map((cz) => {
          const inputZone = input.zones.find((iz) => iz.name === cz.name);
          if (!inputZone?.plantingDate) return null;
          return {
            zone_id: cz.zone_id,
            crop_id: inputZone.cropId ?? null,
            planting_date: new Date(inputZone.plantingDate),
            is_active: true,
          };
        })
        .filter((p): p is NonNullable<typeof p> => p !== null);

      if (plantingData.length > 0) {
        await tx.planting.createMany({ data: plantingData });
      }
    }

    return newField;
  });

  return {
    id: field.field_id,
    name: field.name,
    area: field.area ?? 0,
    farm_id: farm.farm_id,
  };
}

// create a new farm for the user
export interface CreateFarmInput {
  name: string;
  latitude?: number;
  longitude?: number;
  altitude_m?: number;
  location_text?: string;
}

export interface FarmResult {
  farm_id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  altitude_m: number | null;
  created_at: Date | null;
}

export async function createFarm(
  userId: string,
  input: CreateFarmInput,
): Promise<FarmResult> {
  const farm = await prisma.farm.create({
    data: {
      user_id: userId,
      name: input.name,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      altitude_m: input.altitude_m ?? null,
      ...(input.location_text ? { location_text: input.location_text } : {}),
    },
    select: {
      farm_id: true,
      name: true,
      latitude: true,
      longitude: true,
      altitude_m: true,
      created_at: true,
    },
  });
  return farm;
}

// SOFT delete: yalnizca DIREKT sahibi (Farm.user_id === userId) "siler" — uyelik
// (FarmMember) yetmez, paydas silemez. is_active=false'a duser, veriler korunur (UI'dan
// kaybolur cunku tum read path'leri is_active filtreliyor). Hard delete + cascade YOK —
// gelecekteki restore icin opsiyon ve yanlislikla bagimliliklari uctan uca silmemek icin.
// Zaten soft-deleted (is_active=false) bir ciftligi yeniden silmek not_found doner (gone).
export async function deleteFarmAsOwner(
  userId: string,
  farmId: string,
): Promise<{ ok: true } | { ok: false; reason: "not_found" | "forbidden" }> {
  const farm = await prisma.farm.findUnique({
    where: { farm_id: farmId },
    select: { user_id: true, is_active: true },
  });
  if (!farm || !farm.is_active) return { ok: false, reason: "not_found" };
  if (farm.user_id !== userId) return { ok: false, reason: "forbidden" };

  await prisma.farm.update({
    where: { farm_id: farmId },
    data: { is_active: false },
  });
  return { ok: true };
}

// SOFT delete bir field — yalnizca field'in ait oldugu ciftligin DIREKT sahibi (Farm.user_id).
// is_active=false'a duser; getUserFields + resolveFieldAccess + sulama/sensor zincirleri
// is_active filtreledigi icin field UI/API'den kaybolur (zone/sensor verisi DB'de korunur).
export async function deleteFieldAsOwner(
  userId: string,
  fieldId: string,
): Promise<{ ok: true } | { ok: false; reason: "not_found" | "forbidden" }> {
  const field = await prisma.field.findUnique({
    where: { field_id: fieldId },
    select: { is_active: true, farm: { select: { user_id: true } } },
  });
  if (!field || field.is_active === false) return { ok: false, reason: "not_found" };
  if (field.farm?.user_id !== userId) return { ok: false, reason: "forbidden" };

  await prisma.field.update({
    where: { field_id: fieldId },
    data: { is_active: false },
  });
  return { ok: true };
}

// fetch elevation from Open-Meteo Elevation API
export async function getElevation(
  latitude: number,
  longitude: number,
): Promise<number> {
  const url = `https://api.open-meteo.com/v1/elevation?latitude=${latitude}&longitude=${longitude}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Open-Meteo API error: ${res.status}`);
  }
  const data = (await res.json()) as { elevation?: number[] };
  if (!data.elevation || !Array.isArray(data.elevation) || data.elevation.length === 0) {
    throw new Error("No elevation data returned from Open-Meteo");
  }
  return data.elevation[0]!;
}

// list all available crops
export async function getCropList() {
  return prisma.cropDetail.findMany({
    orderBy: { name: "asc" },
    select: {
      crop_id: true,
      name: true,
      default_kc: true,
      growth_days: true,
      optimal_sm_min: true,
      optimal_sm_max: true,
    },
  });
}

export default {
  getUserFields,
  checkFieldAccess,
  getFieldDashboard,
  getFieldInventory,
  createField,
  createFarm,
  deleteFarmAsOwner,
  deleteFieldAsOwner,
  getElevation,
  getCropList,
};
