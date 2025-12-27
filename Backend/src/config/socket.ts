import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import logger from '../utils/logger';

let io: SocketIOServer;

export function initializeSocketIO(httpServer: HTTPServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.SOCKET_CORS_ORIGIN?.split(',') || '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  io.on('connection', (socket: Socket) => {
    logger.info(`Client connected: ${socket.id}`);

    socket.on('subscribe', (data: { farmId?: string; fieldId?: string }) => {
      if (data.farmId) {
        socket.join(`farm:${data.farmId}`);
        logger.info(`Socket ${socket.id} subscribed to farm:${data.farmId}`);
      }
      if (data.fieldId) {
        socket.join(`field:${data.fieldId}`);
        logger.info(`Socket ${socket.id} subscribed to field:${data.fieldId}`);
      }
    });

    socket.on('unsubscribe', (data: { farmId?: string; fieldId?: string }) => {
      if (data.farmId) {
        socket.leave(`farm:${data.farmId}`);
        logger.info(`Socket ${socket.id} unsubscribed from farm:${data.farmId}`);
      }
      if (data.fieldId) {
        socket.leave(`field:${data.fieldId}`);
        logger.info(`Socket ${socket.id} unsubscribed from field:${data.fieldId}`);
      }
    });

    socket.on('disconnect', () => {
      logger.info(`Client disconnected: ${socket.id}`);
    });
  });

  return io;
}

export function getSocketIO(): SocketIOServer {
  if (!io) {
    throw new Error('Socket.io not initialized. Call initializeSocketIO first.');
  }
  return io;
}

export function emitSensorUpdate(fieldId: string, data: unknown): void {
  const socketIO = getSocketIO();
  socketIO.to(`field:${fieldId}`).emit('sensor-update', data);
  logger.debug(`Emitted sensor-update to field:${fieldId}`);
}

export default { initializeSocketIO, getSocketIO, emitSensorUpdate };
