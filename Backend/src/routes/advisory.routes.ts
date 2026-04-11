import { Router } from "express";
import { getTarasAdvice, getTarasAdviceStream, getFieldChatSession, getChatHistory } from "../controllers/advisory.controller";
import { authenticateToken } from "../middleware/auth.middleware";

const router = Router();

router.use(authenticateToken);

// Rate limiter — sadece extended modda
let limiter: any = null;
if (process.env.LLM_PROVIDER !== "groq") {
  try { limiter = require("../services/llm/rateLimiter").advisoryLimiter; } catch { /* */ }
}

router.get("/session", getFieldChatSession);
router.get("/history", getChatHistory);
router.post("/", limiter ?? (((_r: any, _s: any, n: any) => n())), getTarasAdvice);
router.post("/stream", limiter ?? (((_r: any, _s: any, n: any) => n())), getTarasAdviceStream);

export default router;
