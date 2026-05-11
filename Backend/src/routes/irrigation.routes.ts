import { Router } from "express";
import {
  previewIrrigationInput,
  runIrrigationJob,
  runAllIrrigationJobs,
  getFieldIrrigationJobs,
  getZoneIrrigationJobsHandler,
  submitIrrigationJobOutcome,
} from "../controllers/irrigation.controller";


import { authenticateToken } from "../middleware/auth.middleware";

const router = Router();

router.use(authenticateToken);

router.post("/preview", previewIrrigationInput);
router.post("/run/:zone_id", runIrrigationJob);
router.post("/run-all", runAllIrrigationJobs);
router.get("/field/:field_id/jobs", getFieldIrrigationJobs);
router.get("/zone/:zone_id/jobs", getZoneIrrigationJobsHandler);
router.patch("/jobs/:job_id/actual", submitIrrigationJobOutcome);

export default router;