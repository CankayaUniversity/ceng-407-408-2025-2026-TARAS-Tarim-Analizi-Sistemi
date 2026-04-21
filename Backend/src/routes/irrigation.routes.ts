import { Router } from "express";
import {
  previewIrrigationInput,
  runIrrigationJob,
  runAllIrrigationJobs,
} from "../controllers/irrigation.controller";


import { authenticateToken } from "../middleware/auth.middleware";

const router = Router();

router.use(authenticateToken);

router.post("/preview", previewIrrigationInput);
router.post("/run/:zone_id", runIrrigationJob);
router.post("/run-all", runAllIrrigationJobs);

export default router;