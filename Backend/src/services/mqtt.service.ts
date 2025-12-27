import { Server as SocketIOServer } from 'socket.io';
import prisma from '../config/database';
import logger from '../utils/logger';
import { emitSensorUpdate } from '../config/socket';

interface SensorPayload {
  value: number;
  type: string;
  unit?: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

export async function processSensorData(
  macAddress: string,
  payload: SensorPayload,
  _io: SocketIOServer
): Promise<void> {
  try {
    const sensorNode = await prisma.sensorNode.findUnique({
      where: { hardware_mac: macAddress },
    });

    if (!sensorNode) {
      logger.warn(`Sensor node not found for MAC address: ${macAddress}`);
      return;
    }

    await prisma.sensorNode.update({
      where: { node_id: sensorNode.node_id },
      data: { battery_level: 0 },
    });

    const typeMapping: Record<string, string> = {
      moisture: 'MOISTURE',
      temperature: 'TEMPERATURE',
      ph: 'PH',
      humidity: 'HUMIDITY',
      light: 'LIGHT_INTENSITY',
      nitrogen: 'NITROGEN',
      phosphorus: 'PHOSPHORUS',
      potassium: 'POTASSIUM',
    };

    const readingType = typeMapping[payload.type.toLowerCase()] || 'MOISTURE';

    const reading = await prisma.sensorReading.create({
      data: {
        node_id: sensorNode.node_id,
        sm_percent: payload.type.toLowerCase() === 'moisture' ? payload.value : undefined,
        temperature: payload.type.toLowerCase() === 'temperature' ? payload.value : undefined,
        humidity: payload.type.toLowerCase() === 'humidity' ? payload.value : undefined,
        created_at: payload.timestamp ? new Date(payload.timestamp) : new Date(),
      },
    });

    logger.info(`New reading saved: ${reading.id} for sensor ${macAddress}`);

    const updateData = {
      readingId: reading.id,
      sensorNodeId: sensorNode.node_id,
      macAddress: sensorNode.hardware_mac,
      value: payload.value,
      type: payload.type,
      unit: payload.unit || getDefaultUnit(readingType),
      timestamp: reading.created_at,
    };

    emitSensorUpdate('sensor-update', updateData);

    await checkAlerts(reading, sensorNode);

  } catch (error) {
    logger.error('Error processing sensor data:', error);
    throw error;
  }
}

function getDefaultUnit(type: string): string {
  const units: Record<string, string> = {
    MOISTURE: '%',
    TEMPERATURE: '°C',
    PH: 'pH',
    HUMIDITY: '%',
    LIGHT_INTENSITY: 'lux',
    NITROGEN: 'ppm',
    PHOSPHORUS: 'ppm',
    POTASSIUM: 'ppm',
  };
  return units[type] || '';
}

async function checkAlerts(reading: any, sensorNode: any): Promise<void> {
  try {
    if (reading.sm_percent && reading.sm_percent < 20) {
      await prisma.alert.create({
        data: {
          title: 'Low Soil Moisture',
          message: `Sensor ${sensorNode.node_id} detected low moisture: ${reading.sm_percent}%`,
          severity: 'WARNING',
        },
      });
      logger.warn(`Alert created for low moisture: ${reading.sm_percent}%`);
    }
  } catch (error) {
    logger.error('Error checking alerts:', error);
  }
}
