import { Router } from 'express';
import imageRoutes from './image.routes';
import authRoutes from './auth.routes';
import sensorRoutes from './sensor.routes';
import gatewayRoutes from './gateway.routes';
import dashboardRoutes from './dashboard.routes';
import diseaseRoutes from './disease.routes';
import advisoryRoutes from './advisory.routes';
import carbonRoutes from './carbon.routes';
import { DEBUG_MODE } from '../config/debug';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    message: 'TARAS API is running',
    timestamp: new Date().toISOString(),
    debug_mode: DEBUG_MODE,
  });
});

router.use('/auth', authRoutes);
router.use('/images', imageRoutes);
router.use('/sensors', sensorRoutes);
router.use('/gateway', gatewayRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/disease', diseaseRoutes);
router.use('/advisory', advisoryRoutes);
router.use('/carbon', carbonRoutes);

if (DEBUG_MODE) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const debugRoutes = require('./debug.routes').default;
  router.use('/debug', debugRoutes);
}

export default router;

