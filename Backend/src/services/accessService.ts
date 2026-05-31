import { prisma } from "../config/database";
import { FarmRole } from "../generated/prisma";

// Bir kullanicinin bir ciftlige erisim turu.
// "owner" Farm.user_id'den turetilir; diger roller (stakeholder, ileride manager/viewer...)
// FarmMember.role'den gelir. Reads icin owner|herhangi-bir-rol yeterli; mutations icin yalnizca
// owner — bu ayrimi cagiran controller yapar (resolve* sadece rolu doner).
export type FarmAccess = "owner" | FarmRole | null;

// Yazma (operasyonel) erisimi: sahip VEYA farmer-uye. Sulama calistirma/onaylama + karbon
// girisi bu kontrolu kullanir. Stakeholder + erisimsiz reddedilir. Yapisal islemler (field/
// ciftlik/donanim/uye yonetimi) bunu DEGIL, dogrudan `=== "owner"` kullanir.
export function isWriteAccess(access: FarmAccess): boolean {
  return access === "owner" || access === "farmer";
}

// Ciftligin sahibi mi, paydasi mi, yoksa erisimi yok mu?
// Erisim her istekte buradan kontrol edilir (JWT'deki role degil), boylece davet
// iptali bir sonraki istekte aninda etkili olur ve token bayatligi sorun olmaz.
export async function resolveFarmAccess(
  userId: string,
  farmId: string,
): Promise<FarmAccess> {
  const farm = await prisma.farm.findUnique({
    where: { farm_id: farmId },
    select: { user_id: true, is_active: true },
  });

  // Soft-deleted ciftlik UI/API'den kaybolmus sayilir — sahibi bile erisemez (veri korunur).
  if (!farm || !farm.is_active) return null;
  if (farm.user_id === userId) return "owner";

  const membership = await prisma.farmMember.findUnique({
    where: { farm_id_user_id: { farm_id: farmId, user_id: userId } },
    select: { role: true },
  });

  return membership ? membership.role : null;
}

// Field -> Farm cozer, sonra resolveFarmAccess.
export async function resolveFieldAccess(
  userId: string,
  fieldId: string,
): Promise<FarmAccess> {
  const field = await prisma.field.findUnique({
    where: { field_id: fieldId },
    select: { farm_id: true, is_active: true },
  });

  // Soft-deleted field (is_active===false) erisilemez. null/true gecerli (eski kayitlar).
  if (!field?.farm_id || field.is_active === false) return null;
  return resolveFarmAccess(userId, field.farm_id);
}

// Zone -> Field -> Farm cozer, sonra resolveFarmAccess.
export async function resolveZoneAccess(
  userId: string,
  zoneId: string,
): Promise<FarmAccess> {
  const zone = await prisma.zone.findUnique({
    where: { zone_id: zoneId },
    select: { field: { select: { farm_id: true, is_active: true } } },
  });

  // Soft-deleted field altindaki zone erisilemez.
  if (zone?.field?.is_active === false) return null;
  const farmId = zone?.field?.farm_id;
  if (!farmId) return null;
  return resolveFarmAccess(userId, farmId);
}

// Kullanicinin erisebildigi tum ciftlik id'leri: sahibi oldugu + paydas oldugu (birlesim).
export async function getAccessibleFarmIds(userId: string): Promise<string[]> {
  // Iki tarafta da is_active=true filtresi: soft-deleted ciftlikler hem owned hem
  // membership listesinden dusurulur (paydas da goremez, sahip de listFarms'ta gormez).
  const [owned, memberships] = await Promise.all([
    prisma.farm.findMany({
      where: { user_id: userId, is_active: true },
      select: { farm_id: true },
    }),
    prisma.farmMember.findMany({
      where: { user_id: userId, farm: { is_active: true } },
      select: { farm_id: true },
    }),
  ]);

  const ids = new Set<string>();
  for (const f of owned) ids.add(f.farm_id);
  for (const m of memberships) ids.add(m.farm_id);
  return Array.from(ids);
}

export default {
  resolveFarmAccess,
  resolveFieldAccess,
  resolveZoneAccess,
  getAccessibleFarmIds,
  isWriteAccess,
};
