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

  // Kisa request ozeti
  const hasBody = req.body && Object.keys(req.body).length > 0;
  const query = Object.keys(req.query).length > 0 ? ` q=${JSON.stringify(req.query)}` : "";
  const bodyKeys = hasBody ? ` body=[${Object.keys(req.body).join(",")}]` : "";
  logger.debug(`--> ${req.method} ${req.originalUrl}${query}${bodyKeys}`);

  // Response'u yakala — status + sure + yavas sorgu uyarisi
  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const ok = status >= 200 && status < 300;

    // Hata detayi
    const errMsg = !ok && body && typeof body === "object" && "error" in (body as any)
      ? ` ${(body as any).error}`
      : "";

    // Yavas sorgu uyarisi (>1s)
    const slow = duration > 1000 ? " SLOW" : "";

    logger.debug(`<-- ${req.method} ${req.originalUrl} ${status} ${duration}ms${slow}${errMsg}`);
    return originalJson(body);
  };

  next();
}
