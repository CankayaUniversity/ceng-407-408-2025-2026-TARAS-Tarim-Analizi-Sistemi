import { Router } from "express";
import carbonController from "../controllers/carbon.controller";
import { authenticateToken } from "../middleware/auth.middleware";

const router = Router();

router.use(authenticateToken);

// activity type lookup
router.get("/activity-types", carbonController.getActivityTypes);

// carbon logs (farm-scoped)
router.get("/farm/:farmId/logs", carbonController.getFarmLogs);
router.post("/farm/:farmId/logs", carbonController.createCarbonLog);
router.delete("/farm/:farmId/logs/:logId", carbonController.deleteCarbonLog);

// carbon summary
router.get("/farm/:farmId/summary", carbonController.getFarmSummary);
router.get("/farm/:farmId/carbon-footprint/yearly", carbonController.getYearlyTotal);

// emission factors
router.get("/emission-factors", carbonController.getEmissionFactors);
router.post("/emission-factors", carbonController.createEmissionFactor);

export default router;
