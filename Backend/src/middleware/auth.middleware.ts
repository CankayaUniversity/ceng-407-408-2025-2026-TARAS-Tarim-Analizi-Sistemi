import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger';
import { enforceDemoReadonly } from './demoReadonly';

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
      // Paylasilan demo hesabi salt-okunur ise yazma denemesini burada reddet (tek choke point).
      if (enforceDemoReadonly(req, res)) return;
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

// Yalnizca ciftlik-baginsiz (farm-agnostic) farmer-only uclar icin: ciftlik olusturma,
// davet uretme, paydas listeleme. Belirli bir ciftlige erisim DB uyeliginden kontrol edilir
// (resolve*Access), bu middleware degil.
export function requireFarmer(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Authentication required',
    });
    return;
  }

  if (req.user.role_name !== 'farmer') {
    res.status(403).json({
      success: false,
      error: 'Farmer access required',
    });
    return;
  }

  next();
}

// Paydaslar (stakeholder) salt-okunurdur. Sahip-kontrolu olmayan yazma uclarinda
// (orn. user_id-scoped disease submit, global emission factor) paydasi acikca reddet.
// Sahip-kontrollu uclar (carbon log, gateway, sulama onayi) paydasi zaten owner check ile keser.
export function denyStakeholder(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role_name === 'stakeholder') {
    res.status(403).json({
      success: false,
      error: 'Stakeholders have read-only access',
    });
    return;
  }
  next();
}

export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
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

  // Demo hesabi salt-okunur ise (token gecerli + demo user) yazmayi burada da reddet.
  if (enforceDemoReadonly(req, res)) return;
  next();
}

export default {
  authenticateToken,
  requireAdmin,
  requireFarmer,
  denyStakeholder,
  optionalAuth,
};
