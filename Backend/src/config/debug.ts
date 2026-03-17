import logger from "../utils/logger";

export const DEBUG_MODE = process.env.DEBUG_MODE === "true";
export const DEBUG_QUERIES = process.env.DEBUG_QUERIES === "true";

/**
 * Sunucu baslarken debug durumunu logla.
 */
export function logDebugStatus(): void {
  if (DEBUG_MODE) {
    logger.warn("=== DEBUG MODE AKTIF ===");
    logger.warn("Detayli request/response loglama acik");
    logger.warn("Debug endpointleri aktif: /api/debug/*");
    logger.warn("Hata yanitlari stack trace iceriyor");
    logger.warn("========================");
  }
}

/**
 * Hassas env degerlerini maskele.
 */
function redact(value: string | undefined): string {
  if (!value) return "(bos)";
  if (value.length <= 6) return "***";
  return value.slice(0, 3) + "***" + value.slice(-3);
}

/**
 * Debug icin mevcut konfigurasyonu dondur. Hassas degerler maskelenir.
 */
export function getDebugConfig(): Record<string, unknown> {
  return {
    node_env: process.env.NODE_ENV || "(bos)",
    port: process.env.PORT || 3000,
    host: process.env.HOST || "localhost",
    database_url: redact(process.env.DATABASE_URL),
    mqtt_broker: process.env.MQTT_BROKER_URL || "(bos)",
    aws_region: process.env.AWS_REGION || "(bos)",
    aws_access_key: redact(process.env.AWS_ACCESS_KEY_ID),
    s3_bucket: process.env.AWS_S3_BUCKET || "(bos)",
    cors_origins: process.env.CORS_ORIGINS || "(bos)",
    log_level: process.env.LOG_LEVEL || "info",
    debug_mode: DEBUG_MODE,
  };
}
