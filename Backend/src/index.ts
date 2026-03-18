import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

dotenv.config();

// BigInt JSON serialization fix
(BigInt.prototype as any).toJSON = function () { return this.toString(); };
import { initializeDatabase, disconnectDatabase } from './config/database';
import { initializeSocketIO } from './config/socket';
import { initializeMQTT, disconnectMQTT } from './config/mqtt';
import { errorHandler } from './middleware/error.middleware';
import { requestLogger } from './middleware/logger.middleware';
import { debugLogger } from './middleware/debug.middleware';
import { logDebugStatus, DEBUG_MODE } from './config/debug';
import routes from './routes';
import logger from './utils/logger';

const app: Express = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';
const httpServer = createServer(app);

app.use(helmet());
app.use(compression({
  filter: (req, res) => {
    // SSE bağlantılarında sıkıştırma yapma (streaming'i bozar)
    if (req.path.endsWith("/stream")) return false;
    return compression.filter(req, res);
  },
}));
app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || '*',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);
app.use(debugLogger);

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

app.use('/api', routes);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not Found' });
});

app.use(errorHandler);

async function startServer(): Promise<void> {
  try {
    logDebugStatus();
    await initializeDatabase();
    const io: SocketIOServer = initializeSocketIO(httpServer);
    logger.info('Socket.io initialized');

    if (DEBUG_MODE) {
      logger.info('MQTT skipped (debug mode)');
    } else {
      try {
        await initializeMQTT(io);
        logger.info('MQTT connected');
      } catch {
        logger.warn('MQTT connection skipped');
      }
    }

    httpServer.listen(PORT, () => {
      logger.info(`Server running on http://${HOST}:${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

const shutdown = async () => {
  logger.info('Shutting down...');
  disconnectMQTT();
  await disconnectDatabase();
  httpServer.close(() => process.exit(0));
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

startServer();

export default app;
