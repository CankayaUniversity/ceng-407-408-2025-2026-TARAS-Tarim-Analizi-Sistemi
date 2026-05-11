import { prisma } from "../config/database";
import { ActivityTypeCategory } from "../generated/prisma";
import logger from "../utils/logger";

// bir farm'ın bu user'a ait olup olmadığını kontrol et
export async function checkFarmAccess(
  userId: string,
  farmId: string,
): Promise<boolean> {
  const farm = await prisma.farm.findUnique({
    where: { farm_id: farmId },
    select: { user_id: true },
  });

  return farm?.user_id === userId;
}

// tüm aktif activity type'ları kategoriye göre grupla
export async function getActivityTypes(): Promise<
  Record<string, { activity_type_id: number; name: string; unit: string }[]>
> {
  const types = await prisma.activityType.findMany({
    where: { is_active: true },
    orderBy: { name: "asc" },
  });

  const grouped: Record<
    string,
    { activity_type_id: number; name: string; unit: string }[]
  > = {};

  for (const t of types) {
    const cat = t.category;
    if (!grouped[cat]) {
      grouped[cat] = [];
    }
    grouped[cat]!.push({
      activity_type_id: t.activity_type_id,
      name: t.name,
      unit: t.unit,
    });
  }

  return grouped;
}

// verilen tarih ve activity_type için geçerli emission factor'u bul
async function findEmissionFactor(
  activityTypeId: number,
  activityDate: Date,
): Promise<number | null> {
  const factor = await prisma.emissionFactor.findFirst({
    where: {
      activity_type_id: activityTypeId,
      used_from: { lte: activityDate },
      OR: [
        { used_until: null },
        { used_until: { gt: activityDate } },
      ],
    },
    orderBy: { used_from: "desc" },
  });

  return factor?.emission_factor ?? null;
}

interface CreateCarbonLogInput {
  activity_type_id: number;
  activity_date: string;
  activity_amount: number;
  notes?: string;
}

// yeni carbon log kaydı oluştur, emission_amount otomatik hesapla
export async function createCarbonLog(
  farmId: string,
  input: CreateCarbonLogInput,
): Promise<{ carbon_log_id: string; emission_amount: number }> {
  const activityDate = new Date(input.activity_date);

  const factor = await findEmissionFactor(
    input.activity_type_id,
    activityDate,
  );

  if (factor === null) {
    throw new Error("No emission factor found for this activity type and date");
  }

  const emissionAmount = input.activity_amount * factor;

  const log = await prisma.carbonLog.create({
    data: {
      farm_id: farmId,
      activity_type_id: input.activity_type_id,
      activity_date: activityDate,
      activity_amount: input.activity_amount,
      emission_amount: emissionAmount,
      notes: input.notes ?? null,
    },
    select: {
      carbon_log_id: true,
      emission_amount: true,
    },
  });

  return log;
}

interface FarmLogFilters {
  startDate?: Date;
  endDate?: Date;
  category?: ActivityTypeCategory;
}

// farm'ın carbon log kayıtlarını getir
export async function getFarmLogs(
  farmId: string,
  filters: FarmLogFilters,
): Promise<unknown[]> {
  const where: Record<string, unknown> = { farm_id: farmId };

  if (filters.startDate || filters.endDate) {
    const dateFilter: Record<string, Date> = {};
    if (filters.startDate) dateFilter.gte = filters.startDate;
    if (filters.endDate) dateFilter.lte = filters.endDate;
    where.activity_date = dateFilter;
  }

  if (filters.category) {
    where.activity_type = { category: filters.category };
  }

  const logs = await prisma.carbonLog.findMany({
    where,
    include: {
      activity_type: {
        select: {
          name: true,
          category: true,
          unit: true,
        },
      },
    },
    orderBy: { activity_date: "desc" },
  });

  return logs;
}

// carbon log kaydını sil
export async function deleteCarbonLog(
  logId: string,
  farmId: string,
): Promise<boolean> {
  const log = await prisma.carbonLog.findUnique({
    where: { carbon_log_id: logId },
    select: { farm_id: true },
  });

  if (!log || log.farm_id !== farmId) {
    return false;
  }

  await prisma.carbonLog.delete({
    where: { carbon_log_id: logId },
  });

  return true;
}

// farm'ın karbon ayak izi özetini getir (kategoriye göre toplam)
export async function getFarmSummary(
  farmId: string,
  startDate?: Date,
  endDate?: Date,
): Promise<{
  total_emission: number;
  by_category: { category: string; total: number; count: number }[];
}> {
  const dateFilter: Record<string, Date> = {};
  if (startDate) dateFilter.gte = startDate;
  if (endDate) dateFilter.lte = endDate;

  const logs = await prisma.carbonLog.findMany({
    where: {
      farm_id: farmId,
      ...(startDate || endDate ? { activity_date: dateFilter } : {}),
    },
    include: {
      activity_type: {
        select: { category: true },
      },
    },
  });

  const categoryMap = new Map<
    string,
    { total: number; count: number }
  >();
  let totalEmission = 0;

  for (const log of logs) {
    const cat = log.activity_type.category;
    const existing = categoryMap.get(cat) ?? { total: 0, count: 0 };
    existing.total += log.emission_amount;
    existing.count += 1;
    categoryMap.set(cat, existing);
    totalEmission += log.emission_amount;
  }

  const byCategory = Array.from(categoryMap.entries()).map(
    ([category, data]) => ({
      category,
      total: Number(data.total.toFixed(4)),
      count: data.count,
    }),
  );

  return {
    total_emission: Number(totalEmission.toFixed(4)),
    by_category: byCategory,
  };
}

// farm için belirli bir yılın toplam karbon emisyonunu hesapla
export async function getYearlyTotal(
  farmId: string,
  year: number,
): Promise<{ farm_id: string; year: number; total_CO2: number }> {
  const start = new Date(`${year}-01-01T00:00:00.000Z`);
  const end = new Date(`${year + 1}-01-01T00:00:00.000Z`);

  const result = await prisma.carbonLog.aggregate({
    where: {
      farm_id: farmId,
      activity_date: {
        gte: start,
        lt: end,
      },
    },
    _sum: {
      emission_amount: true,
    },
  });

  return {
    farm_id: farmId,
    year,
    total_CO2: Number((result._sum.emission_amount ?? 0).toFixed(4)),
  };
}

// tüm emission factor'ları getir
export async function getEmissionFactors(): Promise<unknown[]> {
  return prisma.emissionFactor.findMany({
    include: {
      activity_type: {
        select: { name: true, category: true, unit: true },
      },
    },
    orderBy: [
      { activity_type_id: "asc" },
      { used_from: "desc" },
    ],
  });
}

interface CreateEmissionFactorInput {
  activity_type_id: number;
  emission_factor: number;
  source?: string;
  used_from: string;
  used_until?: string;
}

// yeni emission factor oluştur, eski aktif olanın used_until'ini güncelle
export async function createEmissionFactor(
  input: CreateEmissionFactorInput,
): Promise<unknown> {
  const usedFrom = new Date(input.used_from);

  // eski aktif factor'ün used_until'ini kapat
  await prisma.emissionFactor.updateMany({
    where: {
      activity_type_id: input.activity_type_id,
      used_until: null,
      used_from: { lt: usedFrom },
    },
    data: { used_until: usedFrom },
  });

  const factor = await prisma.emissionFactor.create({
    data: {
      activity_type_id: input.activity_type_id,
      emission_factor: input.emission_factor,
      source: input.source ?? null,
      used_from: usedFrom,
      used_until: input.used_until ? new Date(input.used_until) : null,
    },
    include: {
      activity_type: {
        select: { name: true, category: true },
      },
    },
  });

  logger.info("Emission factor created", {
    activity_type_id: input.activity_type_id,
    factor: input.emission_factor,
  });

  return factor;
}

export default {
  checkFarmAccess,
  getActivityTypes,
  createCarbonLog,
  getFarmLogs,
  deleteCarbonLog,
  getFarmSummary,
  getYearlyTotal,
  getEmissionFactors,
  createEmissionFactor,
};
