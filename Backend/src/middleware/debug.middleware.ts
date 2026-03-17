import { Request, Response, NextFunction } from "express";
import logger from "../utils/logger";
import { DEBUG_MODE } from "../config/debug";

/**
 * Debug modunda request body, response body ve sure bilgilerini loglar.
 * Normal modda hicbir sey yapmaz (sifir maliyet).
 */
export function debugLogger(req: Request, res: Response, next: NextFunction): void {
  if (!DEBUG_MODE) {
    next();
    return;
  }

  const start = Date.now();

  // Request detaylari
  logger.debug(`[DEBUG] --> ${req.method} ${req.originalUrl}`, {
    body: req.body,
    query: req.query,
    params: req.params,
    ip: req.ip,
    contentType: req.get("content-type"),
    auth: req.get("authorization") ? "Bearer ***" : "(yok)",
  });

  // Response'u yakala
  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    const duration = Date.now() - start;
    logger.debug(`[DEBUG] <-- ${req.method} ${req.originalUrl} [${res.statusCode}] ${duration}ms`, {
      responseBody: body,
    });
    return originalJson(body);
  };

  next();
}
