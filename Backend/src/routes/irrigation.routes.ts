import { Router } from "express";
import {
  previewIrrigationInput,
  runIrrigationJob,
  runAllIrrigationJobs,
  getFieldIrrigationJobs,
  submitIrrigationJobOutcome,
} from "../controllers/irrigation.controller";


import { authenticateToken } from "../middleware/auth.middleware";

const router = Router();

router.use(authenticateToken);

router.post("/preview", previewIrrigationInput);
router.post("/run/:zone_id", runIrrigationJob);
router.post("/run-all", runAllIrrigationJobs);
router.get("/field/:field_id/jobs", getFieldIrrigationJobs);
router.post("/job/:job_id/actual", submitIrrigationJobOutcome);

export default router;