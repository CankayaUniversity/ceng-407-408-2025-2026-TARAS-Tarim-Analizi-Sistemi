import { Router } from 'express';
import authController from '../controllers/auth.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import { authLimiter } from '../middleware/authLimiter';

const router = Router();

router.post('/login', authLimiter, authController.login);
router.post('/register', authLimiter, authController.register);
router.get('/me', authenticateToken, authController.getProfile);
router.post('/change-password', authenticateToken, authLimiter, authController.changePassword);

export default router;
