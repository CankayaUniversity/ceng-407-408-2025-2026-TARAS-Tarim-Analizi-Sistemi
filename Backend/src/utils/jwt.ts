import jwt from "jsonwebtoken";

// JWT uretimi — auth.controller (login/register) ve dashboard.controller (ciftlik
// olusturunca rol yukseltme) tarafindan paylasilir. Secret dogrulamasi import aninda calisir.
const _JWT_SECRET_RAW = process.env.JWT_SECRET;
if (!_JWT_SECRET_RAW || _JWT_SECRET_RAW === "change-me-in-production" || _JWT_SECRET_RAW.length < 32) {
  throw new Error(
    "JWT_SECRET env var must be set to a strong random value (>=32 chars, not the default placeholder)",
  );
}
const JWT_SECRET: string = _JWT_SECRET_RAW;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN;
if (!JWT_EXPIRES_IN) throw new Error("JWT_EXPIRES_IN not configured");

export interface JwtPayload {
  user_id: string;
  username: string;
  email: string;
  role_name?: string;
}

export function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload as any, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
}
