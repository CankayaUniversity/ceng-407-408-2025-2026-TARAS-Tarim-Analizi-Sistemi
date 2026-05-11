// Auth endpoint hiz sinirlandirma — brute force korumasi
import rateLimit from "express-rate-limit";

// Login/register limiti — kullanici basina/IP basina 10 deneme/15dk
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 dakika
  max: 10, // 10 deneme
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Çok fazla giriş denemesi. Lütfen 15 dakika sonra tekrar deneyin.",
  },
  // IP bazli — username brute force icin yeterli koruma saglar
  keyGenerator: (req) => req.ip || "unknown",
});

// Genel API limiti — DDoS hafifletme
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300, // 15 dakikada 300 istek (=20/dk)
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req as any).user?.user_id || req.ip || "unknown",
});
