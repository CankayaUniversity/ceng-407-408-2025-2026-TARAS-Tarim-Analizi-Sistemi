import { Router } from "express";
import { getTarasAdvice, getTarasAdviceStream } from "../controllers/advisory.controller";

const router = Router();

router.post("/", getTarasAdvice);
router.post("/stream", getTarasAdviceStream);

export default router;
