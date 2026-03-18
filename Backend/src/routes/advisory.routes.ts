import { Router } from "express";
import { getTarasAdvice, getTarasAdviceStream } from "../controllers/advisory.controller";
import { authenticateToken } from "../middleware/auth.middleware";

const router = Router();

router.use(authenticateToken);

router.post("/", getTarasAdvice);
router.post("/stream", getTarasAdviceStream);

export default router;
