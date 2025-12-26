import { Router } from 'express';
import imageRoutes from './image.routes';
import authRoutes from './auth.routes';
import sensorRoutes from './sensor.routes';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    message: 'TARAS API is running',
    timestamp: new Date().toISOString(),
  });
});

router.use('/auth', authRoutes);
router.use('/images', imageRoutes);
router.use('/sensors', sensorRoutes);

export default router;
