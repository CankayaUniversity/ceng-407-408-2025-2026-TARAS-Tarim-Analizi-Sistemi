import { Router } from 'express';
import dashboardController from '../controllers/dashboard.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticateToken);

router.get('/fields', dashboardController.getFields);
router.post('/fields', dashboardController.createField);
router.get('/fields/:fieldId', dashboardController.getFieldDashboard);
router.post('/farms', dashboardController.createFarm);
router.delete('/farms/:farmId', dashboardController.deleteFarm);
router.delete('/fields/:fieldId', dashboardController.deleteField);
router.get('/elevation', dashboardController.getElevation);
router.get('/crops', dashboardController.getCrops);

export default router;
