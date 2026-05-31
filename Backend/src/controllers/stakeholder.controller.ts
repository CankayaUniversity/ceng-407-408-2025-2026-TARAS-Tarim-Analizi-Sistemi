import { Request, Response, NextFunction } from "express";
import { randomInt } from "crypto";
import { asyncHandler } from "../middleware/error.middleware";
import { getStringParam } from "../utils/requestHelpers";
import { resolveFarmAccess } from "../services/accessService";
import { getFarmerRoleId } from "../services/userService";
import { generateToken } from "../utils/jwt";
import { prisma } from "../config/database";
import { Prisma, FarmRole } from "../generated/prisma";
import logger from "../utils/logger";

// Davet/uye rolu olarak kabul edilen degerler — kullanici girdisini guvenle daralt.
const ASSIGNABLE_ROLES: FarmRole[] = ["stakeholder", "farmer"];
function parseFarmRole(raw: unknown, fallback: FarmRole = "stakeholder"): FarmRole {
  return typeof raw === "string" && (ASSIGNABLE_ROLES as string[]).includes(raw)
    ? (raw as FarmRole)
    : fallback;
}

// Karistirilmasi kolay karakterler haric (O/0/I/1) 32 harfli alfabe → 8 karakter ≈ 40 bit
const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const INVITE_CODE_LENGTH = 8;
const DEFAULT_TTL_DAYS = 7;
const MAX_TTL_DAYS = 30;

function generateInviteCode(): string {
  let code = "";
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    code += INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)];
  }
  return code;
}

// POST /api/stakeholder/farms/:farmId/invite — ciftci kendi ciftligi icin tek kullanimlik kod uretir
export const createInvite = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const userId = (req as any).user?.user_id;
    if (!userId) {
      res.status(401).json({ success: false, error: "Auth required" });
      return;
    }

    const farmId = getStringParam(req.params.farmId);
    if (!farmId) {
      res.status(400).json({ success: false, error: "farmId is required" });
      return;
    }

    // Yalnizca ciftlik sahibi davet uretebilir
    if ((await resolveFarmAccess(userId, farmId)) !== "owner") {
      res.status(403).json({ success: false, error: "Only the farm owner can create invites" });
      return;
    }

    const rawTtl = (req.body as { ttlDays?: unknown })?.ttlDays;
    let ttlDays = DEFAULT_TTL_DAYS;
    if (typeof rawTtl === "number" && Number.isFinite(rawTtl) && rawTtl > 0) {
      ttlDays = Math.min(Math.floor(rawTtl), MAX_TTL_DAYS);
    }
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    // Davetin verecegi rol — sahip secer (stakeholder=salt-okunur, farmer=operasyonel).
    const role = parseFarmRole((req.body as { role?: unknown })?.role);

    // Benzersiz kod uret — unique carpismasinda birkac kez dene
    let invite: { invite_id: string; code: string; expires_at: Date } | null = null;
    for (let attempt = 0; attempt < 5 && !invite; attempt++) {
      const code = generateInviteCode();
      try {
        invite = await prisma.farmInvite.create({
          data: { code, farm_id: farmId, created_by: userId, role, expires_at: expiresAt },
          select: { invite_id: true, code: true, expires_at: true },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          continue; // kod carpismasi — tekrar dene
        }
        throw err;
      }
    }

    if (!invite) {
      res.status(500).json({ success: false, error: "Could not generate a unique invite code" });
      return;
    }

    logger.info(`[STAKEHOLDER] invite created farm=${farmId.slice(0, 8)} by ${userId.slice(0, 8)}`);
    // invite_id donulur ki ciftci kodu kullanilmadan once iptal edebilsin (revokeInvite).
    res.status(201).json({
      success: true,
      data: { invite_id: invite.invite_id, code: invite.code, expires_at: invite.expires_at },
    });
  },
);

// POST /api/stakeholder/accept — paydas kodu girer, ciftlige salt-okunur uyelik kazanir
export const acceptInvite = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const userId = (req as any).user?.user_id;
    if (!userId) {
      res.status(401).json({ success: false, error: "Auth required" });
      return;
    }

    // Herhangi bir kimlikli kullanici davet kabul edebilir: yeni (stakeholder) kullanici
    // bir ciftlige katilir; bir farmer da baska bir ciftligin izleyicisi olabilir. Erisim
    // her zaman uyelik + per-farm owner kontrolunden gecer, global role'den degil.
    const rawCode = (req.body as { code?: unknown })?.code;
    const code = typeof rawCode === "string" ? rawCode.trim().toUpperCase() : "";
    if (!code) {
      res.status(400).json({ success: false, error: "code is required" });
      return;
    }

    // Farmer-davet kabul edilirse global hesap rolu de farmer'a yukseltilir (tek yon, asla
    // dusurulmez) — foto gonderme gibi user-scoped haklar acilsin. role_id'yi tx oncesi coz.
    const farmerRoleId = await getFarmerRoleId();

    try {
      const result = await prisma.$transaction(async (tx) => {
        const invite = await tx.farmInvite.findUnique({
          where: { code },
          include: { farm: { select: { farm_id: true, name: true } } },
        });

        if (!invite || invite.status === "REVOKED") {
          throw Object.assign(new Error("INVALID"), { httpStatus: 400 });
        }
        if (invite.status === "ACCEPTED") {
          throw Object.assign(new Error("ALREADY_USED"), { httpStatus: 400 });
        }
        if (invite.expires_at.getTime() < Date.now()) {
          await tx.farmInvite.update({
            where: { invite_id: invite.invite_id },
            data: { status: "EXPIRED" },
          });
          throw Object.assign(new Error("EXPIRED"), { httpStatus: 400 });
        }

        // Uyelik olustur/guncelle — composite unique (farm_id,user_id) sayesinde idempotent.
        // Rol davetten gelir; zaten uyeyse uyelik rolu davetin roluyle eslesir (farmer-davet
        // bir stakeholder-uyeyi yukseltir).
        await tx.farmMember.upsert({
          where: { farm_id_user_id: { farm_id: invite.farm_id, user_id: userId } },
          update: { role: invite.role },
          create: {
            farm_id: invite.farm_id,
            user_id: userId,
            role: invite.role,
            invited_by: invite.created_by,
          },
        });

        await tx.farmInvite.update({
          where: { invite_id: invite.invite_id },
          data: { status: "ACCEPTED", accepted_by: userId, accepted_at: new Date() },
        });

        // Farmer rolu verildiyse hesap rolunu yukselt + guncel kullaniciyi don (token icin).
        let promotedUser:
          | { user_id: string; username: string; email: string; role: { role_name: string } | null }
          | null = null;
        if (invite.role === "farmer" && farmerRoleId != null) {
          const u = await tx.user.update({
            where: { user_id: userId },
            data: { role_id: farmerRoleId },
            include: { role: true },
          });
          promotedUser = {
            user_id: u.user_id,
            username: u.username,
            email: u.email,
            role: u.role ? { role_name: u.role.role_name } : null,
          };
        }

        return {
          farm_id: invite.farm.farm_id,
          farm_name: invite.farm.name,
          role: invite.role,
          promotedUser,
        };
      });

      logger.info(
        `[STAKEHOLDER] invite accepted farm=${result.farm_id.slice(0, 8)} role=${result.role} by ${userId.slice(0, 8)}`,
      );

      // Farmer'a yukseltildiyse yeni JWT + user don ki mobil tarafta hesap rolu (foto/onboarding
      // kapilari) bu istekte guncellensin (createFarm akisiyla ayni desen).
      const data: {
        farm_id: string;
        farm_name: string;
        role: FarmRole;
        token?: string;
        user?: { user_id: string; username: string; email: string; role: { role_name: string } | null };
      } = {
        farm_id: result.farm_id,
        farm_name: result.farm_name,
        role: result.role,
      };
      if (result.promotedUser) {
        data.token = generateToken({
          user_id: result.promotedUser.user_id,
          username: result.promotedUser.username,
          email: result.promotedUser.email,
          role_name: result.promotedUser.role?.role_name,
        });
        data.user = result.promotedUser;
      }

      res.status(200).json({ success: true, data });
    } catch (err: any) {
      if (err?.httpStatus === 400) {
        const map: Record<string, string> = {
          INVALID: "Invalid invite code",
          ALREADY_USED: "This invite code has already been used",
          EXPIRED: "This invite code has expired",
        };
        res.status(400).json({ success: false, error: map[err.message] ?? "Invalid invite code" });
        return;
      }
      throw err;
    }
  },
);

// GET /api/stakeholder/farms — paydasin gorebildigi ciftlikler (uyelik kayitlari)
export const getMyStakeholderFarms = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const userId = (req as any).user?.user_id;
    if (!userId) {
      res.status(401).json({ success: false, error: "Auth required" });
      return;
    }

    const memberships = await prisma.farmMember.findMany({
      where: { user_id: userId },
      orderBy: { created_at: "desc" },
      select: {
        farm: {
          select: {
            farm_id: true,
            name: true,
            user: { select: { username: true } },
          },
        },
      },
    });

    const farms = memberships.map((m) => ({
      farm_id: m.farm.farm_id,
      name: m.farm.name,
      owner_username: m.farm.user?.username ?? null,
    }));

    res.status(200).json({ success: true, data: farms });
  },
);

// GET /api/stakeholder/farms/:farmId/stakeholders — ciftligin tum uyeleri (sahip + paydaslar) + rolleri.
// Erisimi olan HERKES okuyabilir (sahip + uye); erisimsiz yabanci 403. Sahip satiri her zaman
// ilk gelir (is_owner=true, role="owner", farms.user_id'den cikarilir) ve kaldirilamaz; paydaslar
// is_owner=false. Mobil "Uyeler" ekrani sahibe kaldirma (revoke) sunar, uyeye salt-okunur gosterir.
interface FarmMemberRow {
  user_id: string | null;
  username: string | null;
  role: string;
  is_owner: boolean;
  created_at: Date | null;
}

export const listFarmStakeholders = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const userId = (req as any).user?.user_id;
    if (!userId) {
      res.status(401).json({ success: false, error: "Auth required" });
      return;
    }

    const farmId = getStringParam(req.params.farmId);
    if (!farmId) {
      res.status(400).json({ success: false, error: "farmId is required" });
      return;
    }

    // Erisimi olmayan (ne sahip ne uye) uyeleri goremez
    if ((await resolveFarmAccess(userId, farmId)) === null) {
      res.status(403).json({ success: false, error: "You do not have access to this farm" });
      return;
    }

    // Sahip satiri — farms.user_id + kullanici adi + ciftlik olusturma zamani
    const farm = await prisma.farm.findUnique({
      where: { farm_id: farmId },
      select: {
        user_id: true,
        created_at: true,
        user: { select: { username: true } },
      },
    });
    if (!farm) {
      res.status(404).json({ success: false, error: "Farm not found" });
      return;
    }

    const members = await prisma.farmMember.findMany({
      where: { farm_id: farmId },
      orderBy: { created_at: "desc" },
      select: {
        user_id: true,
        role: true,
        created_at: true,
        user: { select: { username: true } },
      },
    });

    const data: FarmMemberRow[] = [];
    // Sahip her zaman ilk satir (orphan ciftlik = user_id null ise atlanir)
    if (farm.user_id) {
      data.push({
        user_id: farm.user_id,
        username: farm.user?.username ?? null,
        role: "owner",
        is_owner: true,
        created_at: farm.created_at,
      });
    }
    for (const m of members) {
      data.push({
        user_id: m.user_id,
        username: m.user?.username ?? null,
        role: m.role,
        is_owner: false,
        created_at: m.created_at,
      });
    }

    res.status(200).json({ success: true, data });
  },
);

// GET /api/stakeholder/farms/:farmId/invites — sahip, ciftligin tum davet kodlarini gorur
// (kod + durum + son kullanim). Mobil "Paylas" ekrani: PENDING kodlari iptal edilebilir, yeni uretilir.
export const listFarmInvites = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const userId = (req as any).user?.user_id;
    if (!userId) {
      res.status(401).json({ success: false, error: "Auth required" });
      return;
    }

    const farmId = getStringParam(req.params.farmId);
    if (!farmId) {
      res.status(400).json({ success: false, error: "farmId is required" });
      return;
    }

    // Yalnizca ciftlik sahibi davet kodlarini gorebilir
    if ((await resolveFarmAccess(userId, farmId)) !== "owner") {
      res.status(403).json({ success: false, error: "Only the farm owner can list invites" });
      return;
    }

    const rows = await prisma.farmInvite.findMany({
      where: { farm_id: farmId },
      orderBy: { created_at: "desc" },
      take: 100,
      select: {
        invite_id: true,
        code: true,
        role: true,
        status: true,
        expires_at: true,
        created_at: true,
      },
    });

    res.status(200).json({ success: true, data: rows });
  },
);

// DELETE /api/stakeholder/farms/:farmId/stakeholders/:userId — ciftci erisimi iptal eder
export const revokeStakeholder = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const ownerId = (req as any).user?.user_id;
    if (!ownerId) {
      res.status(401).json({ success: false, error: "Auth required" });
      return;
    }

    const farmId = getStringParam(req.params.farmId);
    const targetUserId = getStringParam(req.params.userId);
    if (!farmId || !targetUserId) {
      res.status(400).json({ success: false, error: "farmId and userId are required" });
      return;
    }

    if ((await resolveFarmAccess(ownerId, farmId)) !== "owner") {
      res.status(403).json({ success: false, error: "Only the farm owner can revoke access" });
      return;
    }

    // deleteMany — kayit yoksa hata vermez (idempotent). Erisim bir sonraki istekte keser.
    await prisma.farmMember.deleteMany({
      where: { farm_id: farmId, user_id: targetUserId },
    });

    logger.info(
      `[STAKEHOLDER] access revoked farm=${farmId.slice(0, 8)} user=${targetUserId.slice(0, 8)}`,
    );
    res.status(200).json({ success: true, message: "Stakeholder access revoked" });
  },
);

// PATCH /api/stakeholder/farms/:farmId/members/:userId/role — sahip bir uyenin rolunu degistirir
// (stakeholder <-> farmer). farmer'a yukseltme hesap rolunu de yukseltir (tek yon, asla dusurmez)
// ki foto gonderme gibi user-scoped haklar acilsin. Sahibin kendi rolu degistirilemez (uye degil).
export const changeMemberRole = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const ownerId = (req as any).user?.user_id;
    if (!ownerId) {
      res.status(401).json({ success: false, error: "Auth required" });
      return;
    }

    const farmId = getStringParam(req.params.farmId);
    const targetUserId = getStringParam(req.params.userId);
    if (!farmId || !targetUserId) {
      res.status(400).json({ success: false, error: "farmId and userId are required" });
      return;
    }

    if ((await resolveFarmAccess(ownerId, farmId)) !== "owner") {
      res.status(403).json({ success: false, error: "Only the farm owner can change member roles" });
      return;
    }

    // Hedef rol acikca stakeholder|farmer olmali — eksik/gecersiz govde kullaniciyi sessizce
    // dusurmesin diye parseFarmRole fallback'i yerine sert dogrulama.
    const rawRole = (req.body as { role?: unknown })?.role;
    if (rawRole !== "stakeholder" && rawRole !== "farmer") {
      res.status(400).json({ success: false, error: "role must be 'stakeholder' or 'farmer'" });
      return;
    }
    const role: FarmRole = rawRole;

    const farmerRoleId = await getFarmerRoleId();

    try {
      await prisma.$transaction(async (tx) => {
        // Uyelik yoksa (sahip ya da uye degil) P2025 -> 404
        await tx.farmMember.update({
          where: { farm_id_user_id: { farm_id: farmId, user_id: targetUserId } },
          data: { role },
        });
        if (role === "farmer" && farmerRoleId != null) {
          await tx.user.update({ where: { user_id: targetUserId }, data: { role_id: farmerRoleId } });
        }
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
        res.status(404).json({ success: false, error: "Member not found" });
        return;
      }
      throw err;
    }

    logger.info(
      `[STAKEHOLDER] member role changed farm=${farmId.slice(0, 8)} user=${targetUserId.slice(0, 8)} -> ${role}`,
    );
    res.status(200).json({ success: true, message: "Member role updated" });
  },
);

// POST /api/stakeholder/invites/:inviteId/revoke — ciftci henuz kullanilmamis bir kodu iptal eder
export const revokeInvite = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const userId = (req as any).user?.user_id;
    if (!userId) {
      res.status(401).json({ success: false, error: "Auth required" });
      return;
    }

    const inviteId = getStringParam(req.params.inviteId);
    if (!inviteId) {
      res.status(400).json({ success: false, error: "inviteId is required" });
      return;
    }

    const invite = await prisma.farmInvite.findUnique({
      where: { invite_id: inviteId },
      select: { status: true, farm: { select: { user_id: true } } },
    });

    if (!invite) {
      res.status(404).json({ success: false, error: "Invite not found" });
      return;
    }
    // Yalnizca davetin ait oldugu ciftligin sahibi iptal edebilir (DIREKT Farm.user_id)
    if (invite.farm.user_id !== userId) {
      res.status(403).json({ success: false, error: "Only the farm owner can revoke this invite" });
      return;
    }
    // Yalnizca PENDING iptal edilebilir — kabul edilmis/iptalli/suresi gecmis sessizce gecmesin
    if (invite.status !== "PENDING") {
      res.status(409).json({
        success: false,
        error: "Only a pending invite can be revoked",
      });
      return;
    }

    await prisma.farmInvite.update({
      where: { invite_id: inviteId },
      data: { status: "REVOKED" },
    });

    logger.info(`[STAKEHOLDER] invite revoked ${inviteId.slice(0, 8)} by ${userId.slice(0, 8)}`);
    res.status(200).json({ success: true, message: "Invite revoked" });
  },
);

export default {
  createInvite,
  acceptInvite,
  getMyStakeholderFarms,
  listFarmStakeholders,
  listFarmInvites,
  revokeStakeholder,
  changeMemberRole,
  revokeInvite,
};
