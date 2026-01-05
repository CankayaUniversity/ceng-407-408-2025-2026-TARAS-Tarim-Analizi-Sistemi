import { Router } from 'express';
import dashboardController from '../controllers/dashboard.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticateToken);

router.get('/fields', dashboardController.getFields);
router.get('/fields/:fieldId', dashboardController.getFieldDashboard);

export default router;
