import { Router } from "express";
import { previewIrrigationInput } from "../controllers/irrigation.controller";

// import { authenticateToken } from "../middleware/auth.middleware";

const router = Router();

// router.use(authenticateToken);

router.post("/preview", previewIrrigationInput);

export default router;