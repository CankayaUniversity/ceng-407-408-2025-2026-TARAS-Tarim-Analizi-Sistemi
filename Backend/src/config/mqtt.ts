import mqtt, { MqttClient } from 'mqtt';
import { Server as SocketIOServer } from 'socket.io';
import logger from '../utils/logger';
import { processSensorData } from '../services/mqtt.service';

let mqttClient: MqttClient | null = null;

export async function initializeMQTT(io: SocketIOServer): Promise<void> {
  const brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://broker.hivemq.com:1883';
  const clientId = process.env.MQTT_CLIENT_ID || `taras-backend-${Math.random().toString(16).slice(2, 8)}`;
  const topicPrefix = process.env.MQTT_TOPIC_PREFIX || 'taras/sensors';

  const options: mqtt.IClientOptions = {
    clientId,
    clean: true,
    connectTimeout: 4000,
    reconnectPeriod: 1000,
  };

  if (process.env.MQTT_USERNAME && process.env.MQTT_PASSWORD) {
    options.username = process.env.MQTT_USERNAME;
    options.password = process.env.MQTT_PASSWORD;
  }

  return new Promise((resolve, reject) => {
    mqttClient = mqtt.connect(brokerUrl, options);

    mqttClient.on('connect', () => {
      logger.info(`MQTT client connected to ${brokerUrl}`);

      const topic = `${topicPrefix}/+/data`;
      mqttClient?.subscribe(topic, (err) => {
        if (err) {
          logger.error(`Failed to subscribe to ${topic}:`, err);
          reject(err);
        } else {
          logger.info(`Subscribed to MQTT topic: ${topic}`);
          resolve();
        }
      });
    });

    mqttClient.on('message', async (topic: string, message: Buffer) => {
      try {
        logger.debug(`Received MQTT message on ${topic}`);
        const payload = JSON.parse(message.toString());
        
        const macAddress = topic.split('/')[2];
        
        if (!macAddress) {
          logger.warn(`Invalid topic format: ${topic}`);
          return;
        }
        
        await processSensorData(macAddress, payload, io);
      } catch (error) {
        logger.error('Error processing MQTT message:', error);
      }
    });

    mqttClient.on('error', (error) => {
      logger.error('MQTT client error:', error);
      reject(error);
    });

    mqttClient.on('offline', () => {
      logger.warn('MQTT client is offline');
    });

    mqttClient.on('reconnect', () => {
      logger.info('MQTT client reconnecting...');
    });
  });
}

export function getMQTTClient(): MqttClient {
  if (!mqttClient) {
    throw new Error('MQTT client not initialized. Call initializeMQTT first.');
  }
  return mqttClient;
}

export function publishMQTT(topic: string, message: string | Buffer): void {
  if (!mqttClient) {
    throw new Error('MQTT client not initialized');
  }

  mqttClient.publish(topic, message, (error) => {
    if (error) {
      logger.error(`Failed to publish to ${topic}:`, error);
    } else {
      logger.debug(`Published message to ${topic}`);
    }
  });
}

export function disconnectMQTT(): void {
  if (mqttClient) {
    mqttClient.end();
    logger.info('MQTT client disconnected');
  }
}

export default { initializeMQTT, getMQTTClient, publishMQTT, disconnectMQTT };
