import { Router } from 'express';
import sensorController from '../controllers/sensor.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// Device data endpoint (device_key auth, no JWT)
router.post('/device/data', sensorController.postDeviceData);

// All routes below require JWT auth
router.use(authenticateToken);

// Device registration (JWT required — only logged-in users can register devices)
router.post('/device/register', sensorController.registerDevice);

router.get('/zones', sensorController.getUserZones);
router.get('/zone/:zoneId', sensorController.getSensorsByZone);
router.get('/zone/:zoneId/latest', sensorController.getLatestReadings);
router.get('/zone/:zoneId/history', sensorController.getZoneHistory);
router.get('/zone/:zoneId/details', sensorController.getZoneDetails);
router.get('/node/:nodeId/readings', sensorController.getNodeReadings);
router.get('/field/:fieldId/history', sensorController.getFieldSensorHistory);

export default router;

