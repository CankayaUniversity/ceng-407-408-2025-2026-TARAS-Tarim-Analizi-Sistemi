// Istek hiz sinirlandirma — kullanici bazli
import rateLimit from "express-rate-limit";

// LLM advisory limiti — maliyet kontrolu
export const advisoryLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 dakika
  max: 3, // 3 mesaj/dakika/kullanici
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req as any).user?.user_id || req.ip || "unknown",
  message: {
    success: false,
    error: "Çok fazla mesaj gönderildi. Lütfen biraz bekleyin.",
  },
});

// Genel API limiti
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 dakika
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req as any).user?.user_id || req.ip || "unknown",
  message: {
    success: false,
    error: "Çok fazla istek. Lütfen daha sonra tekrar deneyin.",
  },
});
