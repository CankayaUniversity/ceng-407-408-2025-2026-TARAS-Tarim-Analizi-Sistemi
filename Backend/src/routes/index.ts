import { Router } from 'express';
import imageRoutes from './image.routes';
import authRoutes from './auth.routes';
import sensorRoutes from './sensor.routes';
import dashboardRoutes from './dashboard.routes';
import diseaseRoutes from './disease.routes';

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
router.use('/dashboard', dashboardRoutes);
router.use('/disease', diseaseRoutes);

export default router;
