import { Router } from 'express';
import authController from '../controllers/auth.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import { authLimiter } from '../middleware/authLimiter';

const router = Router();

router.post('/login', authLimiter, authController.login);
// Demo girisi — govde YOK; sunucu DEMO_READONLY_USER_ID hesabi icin token uretir.
// Kimlik bilgisi istemciye gomulu degil. Rate-limited.
router.post('/demo-login', authLimiter, authController.demoLogin);
router.post('/register', authLimiter, authController.register);
router.get('/me', authenticateToken, authController.getProfile);
router.patch('/me', authenticateToken, authLimiter, authController.updateProfile);
router.patch('/me/dataset-consent', authenticateToken, authController.updateDatasetConsent);
router.post('/change-password', authenticateToken, authLimiter, authController.changePassword);

export default router;
