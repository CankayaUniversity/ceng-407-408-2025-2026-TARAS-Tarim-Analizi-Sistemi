import { prisma } from "../config/database";
import bcrypt from "bcryptjs";
import logger from "../utils/logger";

export async function createUser(data: {
  username: string;
  email: string;
  password: string;
  role_id?: number;
}) {
  // bcrypt cost 12: ~300 ms per hash on EC2 t3.micro. Combined with authLimiter
  // (10 req / 15 min / IP) this keeps brute-force impractical without making
  // legitimate logins noticeably slow.
  const hashedPassword = await bcrypt.hash(data.password, 12);

  return prisma.user.create({
    data: {
      username: data.username,
      email: data.email,
      password_hash: hashedPassword,
      role_id: data.role_id,
      is_active: true,
    },
    include: {
      role: true,
    },
  });
}

export async function createUserWithFarm(data: {
  username: string;
  email: string;
  password: string;
  role_id?: number;
  farmName: string;
  farmLocation?: string;
}) {
  const hashedPassword = await bcrypt.hash(data.password, 12);

  // Interactive transaction PrismaPg adapter ile baglanti timeout'una neden olabiliyor.
  // Sirayla olustur, farm hatasi olursa user'i temizle.
  const user = await prisma.user.create({
    data: {
      username: data.username,
      email: data.email,
      password_hash: hashedPassword,
      role_id: data.role_id,
      is_active: true,
    },
    include: { role: true },
  });

  try {
    const farm = await prisma.farm.create({
      data: {
        user_id: user.user_id,
        name: data.farmName,
        ...(data.farmLocation ? { location_text: data.farmLocation } : {}),
      },
    });
    logger.info(`Farm created: ${farm.farm_id} for user ${user.user_id}`);
  } catch (farmError) {
    logger.error(`Farm creation failed for user ${user.user_id}:`, farmError);
    // Farm olusturulamazsa user'i da sil (manual rollback)
    await prisma.user.delete({ where: { user_id: user.user_id } }).catch(() => {});
    throw farmError;
  }

  return user;
}

export async function authenticateUser(username: string, password: string) {
  const user = await prisma.user.findFirst({
    where: {
      username: username,
      is_active: true,
    },
    include: {
      role: true,
    },
  });

  if (!user) {
    return { authenticated: false, error: "User not found or inactive" };
  }

  const passwordValid = await bcrypt.compare(password, user.password_hash);

  if (!passwordValid) {
    return { authenticated: false, error: "Invalid password" };
  }

  await prisma.user.update({
    where: { user_id: user.user_id },
    data: { last_login: new Date() },
  });

  return {
    authenticated: true,
    user: {
      user_id: user.user_id,
      username: user.username,
      email: user.email,
      role: user.role,
    },
  };
}

export async function getUserProfile(userId: string) {
  return prisma.user.findUnique({
    where: { user_id: userId },
    include: {
      role: true,
      farms: {
        include: {
          fields: {
            include: {
              zones: {
                include: {
                  details: true,
                  sensor_nodes: true,
                },
              },
            },
          },
        },
      },
      alerts: {
        where: { is_read: false },
        orderBy: { created_at: "desc" },
        take: 10,
      },
    },
  });
}

export async function updateUserPassword(userId: string, newPassword: string) {
  const hashedPassword = await bcrypt.hash(newPassword, 12);

  return prisma.user.update({
    where: { user_id: userId },
    data: { password_hash: hashedPassword },
  });
}

// Kullanici adi ve/veya e-postayi gunceller. Sadece verilen alanlari yazar.
// Username/email unique oldugu icin cakisma P2002 firlatir (controller 409'a cevirir).
// role ile doner ki username degistiginde yeni JWT uretilebilsin.
export async function updateUserProfile(
  userId: string,
  data: { username?: string; email?: string },
) {
  return prisma.user.update({
    where: { user_id: userId },
    data: {
      ...(data.username !== undefined ? { username: data.username } : {}),
      ...(data.email !== undefined ? { email: data.email } : {}),
    },
    include: { role: true },
  });
}

export async function updateDatasetConsent(userId: string, consent: boolean) {
  return prisma.user.update({
    where: { user_id: userId },
    data: { dataset_consent: consent },
    select: { user_id: true, dataset_consent: true },
  });
}

export async function ensureAdminRole() {
  return prisma.role.upsert({
    where: { role_name: "admin" },
    update: {},
    create: {
      role_name: "admin",
      description: "System administrator with full access",
    },
  });
}

export async function ensureFarmerRole() {
  return prisma.role.upsert({
    where: { role_name: "farmer" },
    update: {},
    create: {
      role_name: "farmer",
      description: "Farm owner with access to their own farms",
    },
  });
}

export async function ensureStakeholderRole() {
  return prisma.role.upsert({
    where: { role_name: "stakeholder" },
    update: {},
    create: {
      role_name: "stakeholder",
      description: "Read-only viewer invited to a specific farm",
    },
  });
}

export async function getFarmerRoleId(): Promise<number | undefined> {
  const role = await prisma.role.findUnique({ where: { role_name: "farmer" } });
  return role?.role_id;
}

// Kullaniciyi "farmer" rolune yukseltir — ilk ciftligini olusturunca cagrilir.
// Idempotent: zaten farmer ise ayni degeri yazar. Sadece yukseltir (asla stakeholder'a dusurmez).
// Guncellenmis kullaniciyi role ile doner ki yeni JWT uretilebilsin.
export async function promoteToFarmer(userId: string) {
  const farmerRoleId = await getFarmerRoleId();
  return prisma.user.update({
    where: { user_id: userId },
    data: farmerRoleId != null ? { role_id: farmerRoleId } : {},
    include: { role: true },
  });
}

export async function getRoleIdByName(roleName: string): Promise<number | undefined> {
  const role = await prisma.role.findUnique({ where: { role_name: roleName } });
  return role?.role_id;
}

export async function getAllRoles() {
  return prisma.role.findMany({
    orderBy: { role_name: "asc" },
  });
}

export async function createAlert(data: {
  user_id: string;
  title: string;
  message: string;
  severity?: "INFO" | "WARNING" | "CRITICAL";
}) {
  return prisma.alert.create({
    data: {
      user_id: data.user_id,
      title: data.title,
      message: data.message,
      severity: data.severity || "INFO",
      is_read: false,
    },
  });
}

export async function markAlertAsRead(alertId: bigint) {
  return prisma.alert.update({
    where: { alert_id: alertId },
    data: { is_read: true },
  });
}

export async function getUserUnreadAlerts(userId: string) {
  return prisma.alert.findMany({
    where: {
      user_id: userId,
      is_read: false,
    },
    orderBy: { created_at: "desc" },
  });
}

export async function createCriticalMoistureAlert(
  userId: string,
  zoneName: string,
  smPercent: number,
  criticalThreshold: number,
) {
  return createAlert({
    user_id: userId,
    title: `Critical Soil Moisture Alert - ${zoneName}`,
    message: `Soil moisture (${smPercent.toFixed(1)}%) has fallen below critical threshold (${criticalThreshold}%). Immediate irrigation recommended.`,
    severity: "CRITICAL",
  });
}

export async function createChatSession(userId: string) {
  return prisma.chatSession.create({
    data: {
      user_id: userId,
    },
  });
}

export async function addChatMessage(
  sessionId: string,
  sender: "user" | "ai",
  content: string,
) {
  return prisma.chatMessage.create({
    data: {
      session_id: sessionId,
      sender,
      content,
    },
  });
}

export async function getChatHistory(sessionId: string) {
  return prisma.chatMessage.findMany({
    where: { session_id: sessionId },
    orderBy: { created_at: "asc" },
  });
}

export async function getUserChatSessions(userId: string, limit: number = 10) {
  return prisma.chatSession.findMany({
    where: { user_id: userId },
    orderBy: { started_at: "desc" },
    take: limit,
    include: {
      messages: {
        orderBy: { created_at: "asc" },
      },
    },
  });
}

export default {
  createUser,
  createUserWithFarm,
  authenticateUser,
  getUserProfile,
  updateUserPassword,
  updateUserProfile,
  updateDatasetConsent,
  ensureAdminRole,
  ensureFarmerRole,
  ensureStakeholderRole,
  getFarmerRoleId,
  promoteToFarmer,
  getRoleIdByName,
  getAllRoles,
  createAlert,
  markAlertAsRead,
  getUserUnreadAlerts,
  createCriticalMoistureAlert,
  createChatSession,
  addChatMessage,
  getChatHistory,
  getUserChatSessions,
};
