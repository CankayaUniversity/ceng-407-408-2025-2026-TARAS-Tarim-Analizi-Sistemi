import { Router } from "express";
import multer from "multer";
import gatewayController from "../controllers/gateway.controller";
import { authenticateToken } from "../middleware/auth.middleware";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

// Gateway self-auth (api_key header, no JWT)
router.post("/auth", gatewayController.authenticateGateway);

// All routes below require JWT auth
router.use(authenticateToken);

router.post("/register", gatewayController.registerGateway);
router.get("/farms", gatewayController.listFarms);
router.get("/list", gatewayController.listGateways);
router.post("/firmware/upload", upload.single("file"), gatewayController.uploadFirmware);
router.get("/firmware/latest", gatewayController.getLatestFirmware);
router.get("/:gatewayId", gatewayController.getGatewayStatus);
router.get("/:gatewayId/nodes", gatewayController.getGatewayNodes);
router.post("/:gatewayId/ota", gatewayController.triggerOtaUpdate);
router.post("/:gatewayId/pair/start", gatewayController.startPairing);
router.post("/:gatewayId/pair/stop", gatewayController.stopPairing);
router.post("/:gatewayId/pair/approve", gatewayController.approveNode);
router.post("/:gatewayId/pair/reject", gatewayController.rejectNode);
router.patch("/node/:nodeId/config", gatewayController.updateNodeConfig);

export default router;
