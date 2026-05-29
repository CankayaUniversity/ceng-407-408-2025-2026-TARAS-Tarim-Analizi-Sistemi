import { Router } from "express";
import {
  previewIrrigationInput,
  runIrrigationJob,
  runAllIrrigationJobs,
  getFieldIrrigationJobs,
  getZoneIrrigationJobsHandler,
  submitIrrigationJobOutcome,
  createManualIrrigationActualHandler,
} from "../controllers/irrigation.controller";


import { authenticateToken, requireFarmer } from "../middleware/auth.middleware";

const router = Router();

router.use(authenticateToken);

// preview + run/:zone_id sahip kontrolunu controller'da yapar (owner-only + IDOR kapali).
router.post("/preview", previewIrrigationInput);
router.post("/run/:zone_id", runIrrigationJob);
// run-all tum zone'lari isler — paydasi blokla (cron yolu servisi dogrudan cagirir, etkilenmez).
router.post("/run-all", requireFarmer, runAllIrrigationJobs);
router.get("/field/:field_id/jobs", getFieldIrrigationJobs);
router.get("/zone/:zone_id/jobs", getZoneIrrigationJobsHandler);
router.patch("/jobs/:job_id/actual", submitIrrigationJobOutcome);
router.post("/zone/:zone_id/manual-actual", createManualIrrigationActualHandler);

export default router;