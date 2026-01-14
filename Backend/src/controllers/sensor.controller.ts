import { Request, Response } from 'express';
import sensorNodeService from '../services/sensorNodeService';
import dashboardService from '../services/dashboardService';
import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger';

const prisma = new PrismaClient();

export async function getUserZones(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.user_id;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    const farms = await prisma.farm.findMany({
      where: { user_id: userId },
      include: {
        fields: {
          include: {
            zones: {
              include: {
                sensor_nodes: {
                  select: {
                    node_id: true,
                    hardware_mac: true,
                    status: true,
                    battery_level: true,
                  },
                },
                details: {
                  select: {
                    current_kc: true,
                    target_sm_percent: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const zones = farms.flatMap((farm) =>
      farm.fields.flatMap((field) =>
        field.zones.map((zone) => ({
          zone_id: zone.zone_id,
          name: zone.name,
          soil_type: zone.soil_type,
          field_name: field.name,
          farm_name: farm.name,
          sensor_count: zone.sensor_nodes.length,
          active_sensors: zone.sensor_nodes.filter((s) => s.status === 'ACTIVE').length,
          sensors: zone.sensor_nodes,
          adaptive_config: zone.details
            ? {
                current_kc: zone.details.current_kc,
                target_sm_percent: zone.details.target_sm_percent,
              }
            : null,
        }))
      )
    );

    res.status(200).json({
      success: true,
      data: {
        user_id: userId,
        zone_count: zones.length,
        zones,
      },
    });
  } catch (error) {
    logger.error('Get user zones error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
}

async function checkZoneAccess(userId: string, zoneId: string): Promise<boolean> {
  const zone = await prisma.zone.findUnique({
    where: { zone_id: zoneId },
    include: {
      field: {
        include: {
          farm: true,
        },
      },
    },
  });

  if (!zone?.field?.farm) {
    return false;
  }

  return zone.field.farm.user_id === userId;
}

export async function getSensorsByZone(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.user_id;
    const { zoneId } = req.params;
    const { limit } = req.query;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    if (!zoneId) {
      res.status(400).json({
        success: false,
        error: 'Zone ID is required',
      });
      return;
    }

    const hasAccess = await checkZoneAccess(userId, zoneId);
    if (!hasAccess) {
      res.status(403).json({
        success: false,
        error: 'You do not have access to this zone',
      });
      return;
    }

    const readingLimit = limit ? parseInt(limit as string) : 10;
    const sensors = await sensorNodeService.getSensorNodesForZone(zoneId, readingLimit);

    res.status(200).json({
      success: true,
      data: {
        zone_id: zoneId,
        sensor_count: sensors.length,
        sensors: sensors.map((sensor) => ({
          node_id: sensor.node_id,
          hardware_mac: sensor.hardware_mac,
          battery_level: sensor.battery_level,
          status: sensor.status,
          gateway_id: sensor.gateway_id,
          latest_reading: sensor.readings[0] || null,
          reading_count: sensor.readings.length,
          readings: sensor.readings,
        })),
      },
    });
  } catch (error) {
    logger.error('Get sensors by zone error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
}

export async function getLatestReadings(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.user_id;
    const { zoneId } = req.params;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    if (!zoneId) {
      res.status(400).json({
        success: false,
        error: 'Zone ID is required',
      });
      return;
    }

    const hasAccess = await checkZoneAccess(userId, zoneId);
    if (!hasAccess) {
      res.status(403).json({
        success: false,
        error: 'You do not have access to this zone',
      });
      return;
    }

    const sensors = await sensorNodeService.getSensorNodesForZone(zoneId, 1);

    const latestData = sensors.map((sensor) => {
      const reading = sensor.readings[0];
      return {
        node_id: sensor.node_id,
        hardware_mac: sensor.hardware_mac,
        status: sensor.status,
        battery_level: sensor.battery_level,
        latest_reading: reading
          ? {
              id: reading.id.toString(),
              created_at: reading.created_at,
              sm_percent: reading.sm_percent,
              temperature: reading.temperature,
              humidity: reading.humidity,
              et0_instant: reading.et0_instant,
              battery_voltage: reading.battery_voltage,
            }
          : null,
      };
    });

    res.status(200).json({
      success: true,
      data: {
        zone_id: zoneId,
        timestamp: new Date(),
        sensors: latestData,
      },
    });
  } catch (error) {
    logger.error('Get latest readings error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
}

export async function getZoneHistory(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.user_id;
    const { zoneId } = req.params;
    const { startTime, endTime, nodeId } = req.query;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    if (!zoneId) {
      res.status(400).json({
        success: false,
        error: 'Zone ID is required',
      });
      return;
    }

    const hasAccess = await checkZoneAccess(userId, zoneId);
    if (!hasAccess) {
      res.status(403).json({
        success: false,
        error: 'You do not have access to this zone',
      });
      return;
    }

    const end = endTime ? new Date(endTime as string) : new Date();
    const start = startTime
      ? new Date(startTime as string)
      : new Date(end.getTime() - 24 * 60 * 60 * 1000);

    let readings;
    if (nodeId) {
      readings = await sensorNodeService.getReadingsInTimeRange(
        nodeId as string,
        start,
        end
      );
    } else {
      const sensors = await prisma.sensorNode.findMany({
        where: { zone_id: zoneId },
      });

      const allReadings = await Promise.all(
        sensors.map((sensor) =>
          sensorNodeService.getReadingsInTimeRange(sensor.node_id, start, end)
        )
      );

      readings = allReadings.flat();
    }

    res.status(200).json({
      success: true,
      data: {
        zone_id: zoneId,
        time_range: {
          start,
          end,
        },
        reading_count: readings.length,
        readings: readings.map((r) => ({
          id: r.id.toString(),
          node_id: r.node_id,
          created_at: r.created_at,
          sm_percent: r.sm_percent,
          temperature: r.temperature,
          humidity: r.humidity,
          et0_instant: r.et0_instant,
        })),
      },
    });
  } catch (error) {
    logger.error('Get zone history error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
}

export async function getZoneDetails(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.user_id;
    const { zoneId } = req.params;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    if (!zoneId) {
      res.status(400).json({
        success: false,
        error: 'Zone ID is required',
      });
      return;
    }

    const hasAccess = await checkZoneAccess(userId, zoneId);
    if (!hasAccess) {
      res.status(403).json({
        success: false,
        error: 'You do not have access to this zone',
      });
      return;
    }

    const zone = await sensorNodeService.getZoneWithAdaptiveControl(zoneId);

    if (!zone) {
      res.status(404).json({
        success: false,
        error: 'Zone not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        zone_id: zone.zone_id,
        name: zone.name,
        soil_type: zone.soil_type,
        created_at: zone.created_at,
        adaptive_config: zone.details
          ? {
              current_kc: zone.details.current_kc,
              current_irrigation_gain: zone.details.current_irrigation_gain,
              target_sm_percent: zone.details.target_sm_percent,
              critical_sm_percent: zone.details.critical_sm_percent,
              updated_at: zone.details.updated_at,
            }
          : null,
        sensor_count: zone.sensor_nodes.length,
        active_sensors: zone.sensor_nodes.filter((s) => s.status === 'ACTIVE').length,
        latest_readings: zone.sensor_nodes.map((sensor) => ({
          node_id: sensor.node_id,
          hardware_mac: sensor.hardware_mac,
          status: sensor.status,
          battery_level: sensor.battery_level,
          latest: sensor.readings[0] || null,
        })),
        active_plantings: zone.plantings.map((p) => ({
          planting_id: p.planting_id,
          crop_name: p.crop?.name,
          planted_at: p.planted_at,
          is_active: p.is_active,
        })),
        recent_kc_calibrations: zone.kc_history.slice(0, 5),
      },
    });
  } catch (error) {
    logger.error('Get zone details error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
}

export async function getNodeReadings(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.user_id;
    const { nodeId } = req.params;
    const { limit, startTime, endTime } = req.query;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    if (!nodeId) {
      res.status(400).json({
        success: false,
        error: 'Node ID is required',
      });
      return;
    }

    const node = await prisma.sensorNode.findUnique({
      where: { node_id: nodeId },
      include: {
        zone: {
          include: {
            field: {
              include: {
                farm: true,
              },
            },
          },
        },
      },
    });

    if (!node) {
      res.status(404).json({
        success: false,
        error: 'Sensor node not found',
      });
      return;
    }

    if (node.zone?.field?.farm?.user_id !== userId) {
      res.status(403).json({
        success: false,
        error: 'You do not have access to this sensor',
      });
      return;
    }

    let readings;
    if (startTime && endTime) {
      const start = new Date(startTime as string);
      const end = new Date(endTime as string);
      readings = await sensorNodeService.getReadingsInTimeRange(nodeId, start, end);
    } else {
      const readingLimit = limit ? parseInt(limit as string) : 50;
      readings = await prisma.sensorReading.findMany({
        where: { node_id: nodeId },
        orderBy: { created_at: 'desc' },
        take: readingLimit,
      });
    }

    res.status(200).json({
      success: true,
      data: {
        node_id: nodeId,
        hardware_mac: node.hardware_mac,
        zone_id: node.zone_id,
        zone_name: node.zone?.name,
        reading_count: readings.length,
        readings: readings.map((r) => ({
          ...r,
          id: r.id.toString(),
        })),
      },
    });
  } catch (error) {
    logger.error('Get node readings error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
}

export async function getFieldSensorHistory(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.user_id;
    const { fieldId } = req.params;
    const { hours } = req.query;

    if (!userId) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    if (!fieldId) {
      res.status(400).json({ success: false, error: 'Field ID is required' });
      return;
    }

    const hasAccess = await dashboardService.checkFieldAccess(userId, fieldId);
    if (!hasAccess) {
      res.status(403).json({ success: false, error: 'You do not have access to this field' });
      return;
    }

    const hoursParam = hours ? parseInt(hours as string) : 72;
    const result = await sensorNodeService.getFieldSensorHistory(fieldId, hoursParam);

    if (!result) {
      res.status(404).json({ success: false, error: 'Field not found' });
      return;
    }

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    logger.error('Get field sensor history error:', error instanceof Error ? { message: error.message, stack: error.stack } : error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export default {
  getUserZones,
  getSensorsByZone,
  getLatestReadings,
  getZoneHistory,
  getZoneDetails,
  getNodeReadings,
  getFieldSensorHistory,
};
