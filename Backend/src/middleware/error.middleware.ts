import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';
import { DEBUG_MODE } from '../config/debug';

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const message = err.message || 'Internal Server Error';

  logger.error(`Error ${statusCode}: ${message}`, {
    stack: err.stack,
    ...(DEBUG_MODE && { url: req.originalUrl, method: req.method }),
  });

  const showDetails = DEBUG_MODE || process.env.NODE_ENV === 'development';

  res.status(statusCode).json({
    error: {
      message,
      ...(showDetails && {
        stack: err.stack,
        url: req.originalUrl,
        method: req.method,
      }),
    },
  });
}

export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
