import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

export const prisma = global.prisma || new PrismaClient({ 
  log: process.env.NODE_ENV === 'development' 
    ? ['query', 'error', 'warn'] 
    : ['error'],
});

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

let isConnected = false;

export async function initializeDatabase(): Promise<void> {
  try {
    const dbUrl = process.env.DATABASE_URL || '';
    
    if (!dbUrl) {
      logger.warn('DATABASE_URL not configured');
      return;
    }

    await prisma.$connect();
    isConnected = true;
    logger.info('Database connected');
  } catch (error) {
    isConnected = false;
    logger.error(`Database error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function isDatabaseConnected(): boolean {
  return isConnected;
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}

export default prisma;
