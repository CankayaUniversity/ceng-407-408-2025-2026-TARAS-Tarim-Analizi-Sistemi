import winston from 'winston';
import path from 'path';

const logDir = process.env.LOG_FILE_PATH || './logs';
const isDebug = process.env.DEBUG_MODE === 'true';
const logLevel = isDebug ? 'debug' : (process.env.LOG_LEVEL || 'info');

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Meta objesini okunabilir formata cevir
function formatMeta(meta: Record<string, unknown>): string {
  const clean = Object.fromEntries(
    Object.entries(meta).filter(([k]) => k !== "timestamp"),
  );
  if (Object.keys(clean).length === 0) return "";

  // responseBody varsa kisalt
  if (clean.responseBody) {
    const body = clean.responseBody as Record<string, unknown>;
    if (body.success !== undefined) {
      const preview = body.success ? "ok" : `err: ${body.error ?? "?"}`;
      const dataKeys = body.data ? Object.keys(body.data as object) : [];
      clean.responseBody = dataKeys.length > 0
        ? `{${preview}, keys: [${dataKeys.join(", ")}]}`
        : `{${preview}}`;
    }
  }

  // body (request) icindeki password'u gizle
  if (clean.body && typeof clean.body === "object") {
    const b = { ...(clean.body as Record<string, unknown>) };
    if (b.password) b.password = "***";
    clean.body = b;
  }

  const str = JSON.stringify(clean);
  return str.length > 200 ? str.slice(0, 200) + "..." : str;
}

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (stack) {
      msg += `\n${stack}`;
    } else {
      const metaStr = formatMeta(meta);
      if (metaStr) msg += ` ${metaStr}`;
    }
    return msg;
  })
);

const logger = winston.createLogger({
  level: logLevel,
  format: logFormat,
  transports: [
    new winston.transports.Console({ format: consoleFormat }),
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 5242880,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5242880,
      maxFiles: 5,
    }),
  ],
  exitOnError: false,
});

export const stream = {
  write: (message: string): void => {
    logger.info(message.trim());
  },
};

export default logger;
