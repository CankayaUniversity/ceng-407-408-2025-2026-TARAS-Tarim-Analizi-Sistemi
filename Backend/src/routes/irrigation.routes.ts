import { Router } from "express";
import {
  previewIrrigationInput,
  runIrrigationJob,
} from "../controllers/irrigation.controller";


// import { authenticateToken } from "../middleware/auth.middleware";

const router = Router();

// router.use(authenticateToken);

router.post("/preview", previewIrrigationInput);
router.post("/run/:zone_id", runIrrigationJob);


export default router;