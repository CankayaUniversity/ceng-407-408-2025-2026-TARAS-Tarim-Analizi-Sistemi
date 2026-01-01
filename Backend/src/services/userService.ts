import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

export async function createUser(data: {
  username: string;
  email: string;
  password: string;
  role_id?: number;
}) {
  const hashedPassword = await bcrypt.hash(data.password, 10);

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
    return { authenticated: false, error: 'User not found or inactive' };
  }

  const passwordValid = await bcrypt.compare(password, user.password_hash);

  if (!passwordValid) {
    return { authenticated: false, error: 'Invalid password' };
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
        orderBy: { created_at: 'desc' },
        take: 10,
      },
    },
  });
}

export async function updateUserPassword(userId: string, newPassword: string) {
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  return prisma.user.update({
    where: { user_id: userId },
    data: { password_hash: hashedPassword },
  });
}

export async function ensureAdminRole() {
  return prisma.role.upsert({
    where: { role_name: 'admin' },
    update: {},
    create: {
      role_name: 'admin',
      description: 'System administrator with full access',
    },
  });
}

export async function ensureFarmerRole() {
  return prisma.role.upsert({
    where: { role_name: 'farmer' },
    update: {},
    create: {
      role_name: 'farmer',
      description: 'Farm owner with access to their own farms',
    },
  });
}

export async function getAllRoles() {
  return prisma.role.findMany({
    orderBy: { role_name: 'asc' },
  });
}

export async function createAlert(data: {
  user_id: string;
  title: string;
  message: string;
  severity?: 'INFO' | 'WARNING' | 'CRITICAL';
}) {
  return prisma.alert.create({
    data: {
      user_id: data.user_id,
      title: data.title,
      message: data.message,
      severity: data.severity || 'INFO',
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
    orderBy: { created_at: 'desc' },
  });
}

export async function createCriticalMoistureAlert(
  userId: string,
  zoneName: string,
  smPercent: number,
  criticalThreshold: number
) {
  return createAlert({
    user_id: userId,
    title: `Critical Soil Moisture Alert - ${zoneName}`,
    message: `Soil moisture (${smPercent.toFixed(1)}%) has fallen below critical threshold (${criticalThreshold}%). Immediate irrigation recommended.`,
    severity: 'CRITICAL',
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
  sender: 'user' | 'ai',
  content: string
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
    orderBy: { created_at: 'asc' },
  });
}

export async function getUserChatSessions(userId: string, limit: number = 10) {
  return prisma.chatSession.findMany({
    where: { user_id: userId },
    orderBy: { started_at: 'desc' },
    take: limit,
    include: {
      messages: {
        orderBy: { created_at: 'asc' },
      },
    },
  });
}

export default {
  createUser,
  authenticateUser,
  getUserProfile,
  updateUserPassword,
  ensureAdminRole,
  ensureFarmerRole,
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
