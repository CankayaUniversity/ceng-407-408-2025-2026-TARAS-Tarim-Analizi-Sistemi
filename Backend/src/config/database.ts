import dotenv from "dotenv";
dotenv.config();

import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma";
import { DEBUG_QUERIES } from "./debug";
import logger from "../utils/logger";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  const dbUrl = process.env.DATABASE_URL || "";

  logger.info(`Prisma DB host test: ${dbUrl.replace(/:\/\/.*?:.*?@/, "://***:***@")}`);

  const pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 10000,
  });

  const adapter = new PrismaPg(pool);

  return new PrismaClient({
    adapter,
    log: DEBUG_QUERIES ? ["query", "error", "warn"] : ["error", "warn"],
  });
}


export const prisma = global.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}

let isConnected = false;

export async function initializeDatabase(): Promise<void> {
  try {
    const dbUrl = process.env.DATABASE_URL || "";

    if (!dbUrl) {
      logger.warn("DATABASE_URL not configured");
      return;
    }

    await prisma.$connect();
    isConnected = true;
    logger.info("Database connected");
  } catch (error) {
    isConnected = false;
    logger.error(
      `Database error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function isDatabaseConnected(): boolean {
  return isConnected;
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}

export default prisma;
