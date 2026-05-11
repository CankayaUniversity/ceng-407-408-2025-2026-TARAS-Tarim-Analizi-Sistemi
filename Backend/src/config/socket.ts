import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { prisma } from './database';
import logger from '../utils/logger';

let io: SocketIOServer;

export function initializeSocketIO(httpServer: HTTPServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.SOCKET_CORS_ORIGIN?.split(','),
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true,
  });

  io.on('connection', (socket: Socket) => {
    logger.info(`Client connected: ${socket.id}`);

    // ── Mobile App Events ──────────────────────────────────────────

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

    // ── Gateway Events ─────────────────────────────────────────────
    // Gateway connections are identified by the gateway:auth event.
    // All gateway events are prefixed with "gateway:" to avoid conflicts.

    let authenticatedGatewayId: string | null = null;

    socket.on("gateway:auth", async (data: { api_key: string }) => {
      const gateway = await prisma.gateway.findUnique({
        where: { api_key: data.api_key },
      });

      if (!gateway) {
        socket.emit("gateway:auth_result", { success: false, error: "Invalid API key" });
        return;
      }

      authenticatedGatewayId = gateway.gateway_id;
      socket.join(`gw:${authenticatedGatewayId}`);

      await prisma.gateway.update({
        where: { gateway_id: authenticatedGatewayId },
        data: { status: "ONLINE", last_seen: new Date() },
      });

      socket.emit("gateway:auth_result", {
        success: true,
        gateway_id: authenticatedGatewayId,
      });

      logger.info(`[GATEWAY-WS] Gateway authenticated: ${authenticatedGatewayId}`);
    });

    socket.on("gateway:heartbeat", async (data: {
      uptime?: number;
      node_count?: number;
      free_heap?: number;
      buffered_count?: number;
      fw_version?: string;
      pkt_recv?: number;
      pkt_ok?: number;
      pkt_drop?: number;
    }) => {
      if (!authenticatedGatewayId) return;

      if (data.pkt_recv != null) {
        logger.info(`[GATEWAY-HB] ${authenticatedGatewayId} recv=${data.pkt_recv} ok=${data.pkt_ok} drop=${data.pkt_drop}`);
      }

      const now = new Date();
      const updateData: Record<string, unknown> = {
        last_heartbeat: now,
        last_seen: now,
      };
      if (data.fw_version) updateData.firmware_version = data.fw_version;

      try {
        await prisma.gateway.update({
          where: { gateway_id: authenticatedGatewayId },
          data: updateData,
        });
      } catch (e) {
        logger.error(`[GATEWAY-WS] Heartbeat update failed for ${authenticatedGatewayId}:`, e);
      }

      logger.debug(`[GATEWAY-WS] Heartbeat from ${authenticatedGatewayId}`, data);
    });

    socket.on("gateway:node_discovered", async (data: {
      mac: string;
      fw_ver?: number;
      caps?: number;
    }) => {
      if (!authenticatedGatewayId) return;

      const gateway = await prisma.gateway.findUnique({
        where: { gateway_id: authenticatedGatewayId },
        select: { farm_id: true },
      });

      if (gateway?.farm_id) {
        io.to(`farm:${gateway.farm_id}`).emit("node_discovered", {
          gateway_id: authenticatedGatewayId,
          ...data,
        });
      }

      logger.info(`[GATEWAY-WS] Node discovered via ${authenticatedGatewayId}: ${data.mac}`);
    });

    socket.on("gateway:pair_complete", async (data: {
      mac: string;
      device_key: string;
      success: boolean;
    }) => {
      if (!authenticatedGatewayId) return;

      const gateway = await prisma.gateway.findUnique({
        where: { gateway_id: authenticatedGatewayId },
        select: { farm_id: true },
      });

      if (gateway?.farm_id) {
        io.to(`farm:${gateway.farm_id}`).emit("pair_complete", {
          gateway_id: authenticatedGatewayId,
          ...data,
        });
      }

      logger.info(`[GATEWAY-WS] Pair complete: ${data.mac} success=${data.success}`);
    });

    // ── Disconnect ─────────────────────────────────────────────────

    socket.on('disconnect', async () => {
      if (authenticatedGatewayId) {
        try {
          await prisma.gateway.update({
            where: { gateway_id: authenticatedGatewayId },
            data: { status: "OFFLINE" },
          });
        } catch (e) {
          logger.error(`[GATEWAY-WS] Disconnect update failed for ${authenticatedGatewayId}:`, e);
        }
        logger.info(`[GATEWAY-WS] Gateway disconnected: ${authenticatedGatewayId}`);
      } else {
        logger.info(`Client disconnected: ${socket.id}`);
      }
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

export function emitToGateway(gatewayId: string, event: string, data: unknown): void {
  const socketIO = getSocketIO();
  socketIO.to(`gw:${gatewayId}`).emit(event, data);
  logger.debug(`Emitted ${event} to gateway:${gatewayId}`);
}

export default { initializeSocketIO, getSocketIO, emitSensorUpdate, emitToGateway };
