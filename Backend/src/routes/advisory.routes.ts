import { Router } from "express";
import { getTarasAdvice, getTarasAdviceStream, getFieldChatSession } from "../controllers/advisory.controller";
import { authenticateToken } from "../middleware/auth.middleware";

const router = Router();

router.use(authenticateToken);

router.get("/session", getFieldChatSession);
router.post("/", getTarasAdvice);
router.post("/stream", getTarasAdviceStream);

export default router;
