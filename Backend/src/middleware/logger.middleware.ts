import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';
import { DEBUG_MODE } from '../config/debug';

export function requestLogger(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  // Debug modunda debug middleware zaten logluyor, tekrar yazmaya gerek yok
  if (!DEBUG_MODE) {
    logger.info(`${req.method} ${req.url}`, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
  }
  next();
}
