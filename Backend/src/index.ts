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
const PORT = process.env.PORT;
const HOST = process.env.HOST;
if (!PORT) throw new Error("PORT not configured");
if (!HOST) throw new Error("HOST not configured");
const httpServer = createServer(app);

// Reverse proxy (nginx) arkasinda calisirken gercek IP'yi al
app.set('trust proxy', 1);

app.use(helmet({
  // API icin CSP gerekli degil — sadece JSON donduruyoruz
  contentSecurityPolicy: false,
  // HSTS — HTTPS uzerinden hizmet veriliyorken etkili olur
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
}));
app.use(compression({
  filter: (req, res) => {
    // SSE bağlantılarında sıkıştırma yapma (streaming'i bozar)
    if (req.path.endsWith("/stream")) return false;
    return compression.filter(req, res);
  },
}));
// CORS — mobile app only, native clients bypass CORS entirely.
// Wildcard is fine; restrict this if a web frontend is ever added.
const corsOrigins = process.env.CORS_ORIGINS?.split(',').map(s => s.trim()).filter(Boolean) || ['*'];
app.use(cors({
  origin: corsOrigins,
  credentials: true,
}));
// Bound request body memory to prevent slow-loris / large-payload DoS.
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
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
