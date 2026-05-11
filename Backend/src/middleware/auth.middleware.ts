import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger';

const _JWT_SECRET_RAW = process.env.JWT_SECRET;
if (!_JWT_SECRET_RAW || _JWT_SECRET_RAW === 'change-me-in-production' || _JWT_SECRET_RAW.length < 32) {
  throw new Error('JWT_SECRET env var must be set to a strong random value (>=32 chars, not the default placeholder)');
}
const JWT_SECRET: string = _JWT_SECRET_RAW;

interface JwtPayload {
  user_id: string;
  username: string;
  email: string;
  role_name?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.substring(7)
      : null;

    if (!token) {
      res.status(401).json({
        success: false,
        error: 'Access token required',
      });
      return;
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) {
        logger.warn(`Token verification failed: ${err.message}`);
        res.status(403).json({
          success: false,
          error: 'Invalid or expired token',
        });
        return;
      }

      req.user = decoded as JwtPayload;
      next();
    });
  } catch (error) {
    logger.error('Authentication middleware error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Authentication required',
    });
    return;
  }

  if (req.user.role_name !== 'admin') {
    res.status(403).json({
      success: false,
      error: 'Admin access required',
    });
    return;
  }

  next();
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.substring(7)
    : null;

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
      req.user = decoded;
    } catch (error) {
      logger.debug('Optional auth: Invalid token provided');
    }
  }

  next();
}

export default {
  authenticateToken,
  requireAdmin,
  optionalAuth,
};
