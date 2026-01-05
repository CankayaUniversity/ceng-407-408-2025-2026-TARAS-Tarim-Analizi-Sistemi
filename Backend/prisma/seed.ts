import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// demo data
const demoData = {
  users: [
    {
      user_id: 'a0000000-0000-0000-0000-000000000001',
      username: 'ahmet_ciftci',
      email: 'ahmet@example.com',
      password: 'password123',
    },
    {
      user_id: 'a0000000-0000-0000-0000-000000000002',
      username: 'fatma_toprak',
      email: 'fatma@example.com',
      password: 'password123',
    },
    {
      user_id: 'a0000000-0000-0000-0000-000000000003',
      username: 'tarik_tohum',
      email: 'tarik@example.com',
      password: 'password123',
    },
  ],
  farms: [
    {
      farm_id: 'b0000000-0000-0000-0000-000000000001',
      user_id: 'a0000000-0000-0000-0000-000000000001',
      name: 'Ahmet Çiftliği',
      location_text: 'Ankara, Turkey (39.9208, 32.8541)',
    },
    {
      farm_id: 'b0000000-0000-0000-0000-000000000002',
      user_id: 'a0000000-0000-0000-0000-000000000002',
      name: 'Toprak Tarım',
      location_text: 'Gaziantep, Turkey (37.0662, 37.3833)',
    },
    {
      farm_id: 'b0000000-0000-0000-0000-000000000003',
      user_id: 'a0000000-0000-0000-0000-000000000003',
      name: "Tarık'ın Çiftliği",
      location_text: 'İzmir, Turkey (38.4237, 27.1428)',
    },
  ],
  fields: [
    {
      field_id: 'c0000000-0000-0000-0000-000000000001',
      farm_id: 'b0000000-0000-0000-0000-000000000001',
      name: 'Domates Tarlası',
      area: 15.5,
      polygon: {
        exterior: [[0, 0], [120, 0], [120, 80], [0, 80]],
        holes: [],
      },
    },
    {
      field_id: 'c0000000-0000-0000-0000-000000000002',
      farm_id: 'b0000000-0000-0000-0000-000000000001',
      name: 'Biber Seracılığı',
      area: 8.2,
      polygon: {
        exterior: [[0, 0], [80, 0], [80, 40], [50, 40], [50, 70], [0, 70]],
        holes: [],
      },
    },
    {
      field_id: 'c0000000-0000-0000-0000-000000000003',
      farm_id: 'b0000000-0000-0000-0000-000000000002',
      name: 'Patates Bahçesi',
      area: 22.0,
      polygon: {
        exterior: [[0, 0], [150, 0], [150, 100], [0, 100]],
        holes: [[[60, 40], [90, 40], [90, 60], [60, 60]]],
      },
    },
    {
      field_id: 'c0000000-0000-0000-0000-000000000004',
      farm_id: 'b0000000-0000-0000-0000-000000000002',
      name: 'Domates-Biber Karışık',
      area: 5.8,
      polygon: {
        exterior: [[10, 5], [95, 0], [100, 55], [5, 65]],
        holes: [],
      },
    },
    {
      field_id: 'c0000000-0000-0000-0000-000000000005',
      farm_id: 'b0000000-0000-0000-0000-000000000003',
      name: 'Domates Serası',
      area: 3.2,
      polygon: {
        exterior: [[0, 0], [60, 0], [60, 40], [0, 40]],
        holes: [],
      },
    },
    {
      field_id: 'c0000000-0000-0000-0000-000000000006',
      farm_id: 'b0000000-0000-0000-0000-000000000003',
      name: 'Biber Bahçesi',
      area: 4.8,
      polygon: {
        exterior: [[0, 0], [70, 0], [70, 30], [40, 30], [40, 60], [0, 60]],
        holes: [],
      },
    },
    {
      field_id: 'c0000000-0000-0000-0000-000000000007',
      farm_id: 'b0000000-0000-0000-0000-000000000003',
      name: 'Patates Tarlası',
      area: 12.5,
      polygon: {
        exterior: [[0, 0], [140, 5], [145, 90], [10, 95], [5, 50]],
        holes: [[[60, 40], [80, 40], [80, 55], [60, 55]]],
      },
    },
  ],
  zones: [
    { zone_id: 'd0000000-0000-0000-0000-000000000001', field_id: 'c0000000-0000-0000-0000-000000000001', name: 'Domates Ana Bölge', soil_type: 'loamy' },
    { zone_id: 'd0000000-0000-0000-0000-000000000002', field_id: 'c0000000-0000-0000-0000-000000000002', name: 'Biber Ana Bölge', soil_type: 'clay' },
    { zone_id: 'd0000000-0000-0000-0000-000000000003', field_id: 'c0000000-0000-0000-0000-000000000003', name: 'Patates Ana Bölge', soil_type: 'sandy' },
    { zone_id: 'd0000000-0000-0000-0000-000000000004', field_id: 'c0000000-0000-0000-0000-000000000004', name: 'Karışık Sebze Ana Bölge', soil_type: 'loamy' },
    { zone_id: 'd0000000-0000-0000-0000-000000000005', field_id: 'c0000000-0000-0000-0000-000000000005', name: 'Domates Serası Ana Bölge', soil_type: 'loamy' },
    { zone_id: 'd0000000-0000-0000-0000-000000000006', field_id: 'c0000000-0000-0000-0000-000000000006', name: 'Biber Bahçesi Ana Bölge', soil_type: 'clay' },
    { zone_id: 'd0000000-0000-0000-0000-000000000007', field_id: 'c0000000-0000-0000-0000-000000000007', name: 'Patates Tarlası Ana Bölge', soil_type: 'sandy' },
  ],
  sensors: [
    // Zone 1 (Domates - Ahmet) - asymmetric placement
    { node_id: 'e0000000-0000-0000-0000-000000000001', zone_id: 'd0000000-0000-0000-0000-000000000001', hardware_mac: 'AA:BB:CC:DD:EE:01', x: 18, z: 63, battery_level: 87 },
    { node_id: 'e0000000-0000-0000-0000-000000000002', zone_id: 'd0000000-0000-0000-0000-000000000001', hardware_mac: 'AA:BB:CC:DD:EE:02', x: 103, z: 57, battery_level: 92 },
    { node_id: 'e0000000-0000-0000-0000-000000000003', zone_id: 'd0000000-0000-0000-0000-000000000001', hardware_mac: 'AA:BB:CC:DD:EE:03', x: 32, z: 15, battery_level: 78 },
    { node_id: 'e0000000-0000-0000-0000-000000000004', zone_id: 'd0000000-0000-0000-0000-000000000001', hardware_mac: 'AA:BB:CC:DD:EE:04', x: 87, z: 28, battery_level: 85 },
    // Zone 2 (Biber - Ahmet) - irregular spread
    { node_id: 'e0000000-0000-0000-0000-000000000005', zone_id: 'd0000000-0000-0000-0000-000000000002', hardware_mac: 'AA:BB:CC:DD:EE:05', x: 22, z: 58, battery_level: 91 },
    { node_id: 'e0000000-0000-0000-0000-000000000006', zone_id: 'd0000000-0000-0000-0000-000000000002', hardware_mac: 'AA:BB:CC:DD:EE:06', x: 47, z: 18, battery_level: 88 },
    { node_id: 'e0000000-0000-0000-0000-000000000007', zone_id: 'd0000000-0000-0000-0000-000000000002', hardware_mac: 'AA:BB:CC:DD:EE:07', x: 12, z: 8, battery_level: 95 },
    { node_id: 'e0000000-0000-0000-0000-000000000008', zone_id: 'd0000000-0000-0000-0000-000000000002', hardware_mac: 'AA:BB:CC:DD:EE:08', x: 68, z: 13, battery_level: 23 },
    // Zone 3 (Patates - Fatma) - varied positions
    { node_id: 'e0000000-0000-0000-0000-000000000009', zone_id: 'd0000000-0000-0000-0000-000000000003', hardware_mac: 'AA:BB:CC:DD:EE:09', x: 25, z: 73, battery_level: 82 },
    { node_id: 'e0000000-0000-0000-0000-000000000010', zone_id: 'd0000000-0000-0000-0000-000000000003', hardware_mac: 'AA:BB:CC:DD:EE:0A', x: 112, z: 86, battery_level: 79 },
    { node_id: 'e0000000-0000-0000-0000-000000000011', zone_id: 'd0000000-0000-0000-0000-000000000003', hardware_mac: 'AA:BB:CC:DD:EE:0B', x: 38, z: 27, battery_level: 94 },
    { node_id: 'e0000000-0000-0000-0000-000000000012', zone_id: 'd0000000-0000-0000-0000-000000000003', hardware_mac: 'AA:BB:CC:DD:EE:0C', x: 128, z: 14, battery_level: 86 },
    // Zone 4 (Karışık - Fatma) - non-uniform distribution
    { node_id: 'e0000000-0000-0000-0000-000000000013', zone_id: 'd0000000-0000-0000-0000-000000000004', hardware_mac: 'AA:BB:CC:DD:EE:0D', x: 55, z: 43, battery_level: 90 },
    { node_id: 'e0000000-0000-0000-0000-000000000014', zone_id: 'd0000000-0000-0000-0000-000000000004', hardware_mac: 'AA:BB:CC:DD:EE:0E', x: 73, z: 28, battery_level: 88 },
    { node_id: 'e0000000-0000-0000-0000-000000000015', zone_id: 'd0000000-0000-0000-0000-000000000004', hardware_mac: 'AA:BB:CC:DD:EE:0F', x: 42, z: 19, battery_level: 76 },
    { node_id: 'e0000000-0000-0000-0000-000000000016', zone_id: 'd0000000-0000-0000-0000-000000000004', hardware_mac: 'AA:BB:CC:DD:EE:10', x: 27, z: 38, battery_level: 0, status: 'INACTIVE' as const },
    // Zone 5 (Domates Serası - Tarık) - greenhouse layout
    { node_id: 'e0000000-0000-0000-0000-000000000017', zone_id: 'd0000000-0000-0000-0000-000000000005', hardware_mac: 'AA:BB:CC:DD:EE:11', x: 13, z: 27, battery_level: 88 },
    { node_id: 'e0000000-0000-0000-0000-000000000018', zone_id: 'd0000000-0000-0000-0000-000000000005', hardware_mac: 'AA:BB:CC:DD:EE:12', x: 34, z: 18, battery_level: 90 },
    { node_id: 'e0000000-0000-0000-0000-000000000019', zone_id: 'd0000000-0000-0000-0000-000000000005', hardware_mac: 'AA:BB:CC:DD:EE:13', x: 48, z: 23, battery_level: 85 },
    // Zone 6 (Biber Bahçesi - Tarık) - L-shaped field
    { node_id: 'e0000000-0000-0000-0000-00000000001A', zone_id: 'd0000000-0000-0000-0000-000000000006', hardware_mac: 'AA:BB:CC:DD:EE:14', x: 17, z: 33, battery_level: 92 },
    { node_id: 'e0000000-0000-0000-0000-00000000001B', zone_id: 'd0000000-0000-0000-0000-000000000006', hardware_mac: 'AA:BB:CC:DD:EE:15', x: 52, z: 19, battery_level: 87 },
    { node_id: 'e0000000-0000-0000-0000-00000000001C', zone_id: 'd0000000-0000-0000-0000-000000000006', hardware_mac: 'AA:BB:CC:DD:EE:16', x: 28, z: 47, battery_level: 91 },
    // Zone 7 (Patates Tarlası - Tarık) - irregular field with hole
    { node_id: 'e0000000-0000-0000-0000-00000000001D', zone_id: 'd0000000-0000-0000-0000-000000000007', hardware_mac: 'AA:BB:CC:DD:EE:17', x: 35, z: 68, battery_level: 84 },
    { node_id: 'e0000000-0000-0000-0000-00000000001E', zone_id: 'd0000000-0000-0000-0000-000000000007', hardware_mac: 'AA:BB:CC:DD:EE:18', x: 95, z: 52, battery_level: 89 },
    { node_id: 'e0000000-0000-0000-0000-00000000001F', zone_id: 'd0000000-0000-0000-0000-000000000007', hardware_mac: 'AA:BB:CC:DD:EE:19', x: 118, z: 23, battery_level: 86 },
  ],
};

// generate fake readings
function generateReadings(
  nodeId: string,
  hoursBack: number = 72,
  moistureConfig?: {
    baseLevel: number;
    variation: number;
    isDrastic: boolean;
  }
): Array<{
  node_id: string;
  sm_percent: number;
  temperature: number;
  humidity: number;
  created_at: Date;
}> {
  const readings = [];
  const now = new Date();

  const sensorIndex = parseInt(nodeId.slice(-2), 16) || 1;
  const baseMoisture = moistureConfig ? moistureConfig.baseLevel : 40 + (sensorIndex % 4) * 8;
  const baseTemp = 20 + (sensorIndex % 3) * 3;
  const baseHumidity = 50 + (sensorIndex % 5) * 5;

  for (let i = hoursBack * 2; i >= 0; i--) {
    const timestamp = new Date(now.getTime() - i * 30 * 60 * 1000);
    const hour = timestamp.getHours();

    const tempModifier = Math.sin((hour - 6) * Math.PI / 12) * 8;
    const humidityModifier = -Math.sin((hour - 6) * Math.PI / 12) * 15;

    const randomFactor = () => (Math.random() - 0.5) * 4;

    let sm_percent: number;

    if (moistureConfig && moistureConfig.isDrastic) {
      const dailyCycle = Math.sin((hour - 6) * Math.PI / 12);
      const extremeModifier = dailyCycle * moistureConfig.variation;
      const spikeModifier = hour % 12 === 0 ? (Math.random() - 0.5) * 10 : 0;
      sm_percent = baseMoisture + extremeModifier + spikeModifier + randomFactor();
    } else if (moistureConfig) {
      const moistureModifier = -Math.sin((hour - 6) * Math.PI / 12) * moistureConfig.variation;
      sm_percent = baseMoisture + moistureModifier + randomFactor();
    } else {
      const moistureModifier = -Math.sin((hour - 6) * Math.PI / 12) * 10;
      sm_percent = baseMoisture + moistureModifier + randomFactor();
    }

    readings.push({
      node_id: nodeId,
      sm_percent: Math.max(10, Math.min(95, sm_percent)),
      temperature: Math.max(5, Math.min(45, baseTemp + tempModifier + randomFactor())),
      humidity: Math.max(20, Math.min(95, baseHumidity + humidityModifier + randomFactor())),
      created_at: timestamp,
    });
  }

  return readings;
}

async function main() {
  console.log('Starting database seed...');

  const farmerRole = await prisma.role.upsert({
    where: { role_name: 'farmer' },
    update: {},
    create: {
      role_name: 'farmer',
      description: 'Farm owner with full access to their farms',
    },
  });
  console.log('Created role:', farmerRole.role_name);

  for (const userData of demoData.users) {
    const passwordHash = await bcrypt.hash(userData.password, 10);
    const user = await prisma.user.upsert({
      where: { user_id: userData.user_id },
      update: {},
      create: {
        user_id: userData.user_id,
        username: userData.username,
        email: userData.email,
        password_hash: passwordHash,
        role_id: farmerRole.role_id,
        is_active: true,
      },
    });
    console.log('Created user:', user.username);
  }

  for (const farmData of demoData.farms) {
    const farm = await prisma.farm.upsert({
      where: { farm_id: farmData.farm_id },
      update: {},
      create: {
        farm_id: farmData.farm_id,
        user_id: farmData.user_id,
        name: farmData.name,
        location_text: farmData.location_text,
      },
    });
    console.log('Created farm:', farm.name);
  }

  for (const fieldData of demoData.fields) {
    const field = await prisma.field.upsert({
      where: { field_id: fieldData.field_id },
      update: {
        name: fieldData.name,
        area: fieldData.area,
        polygon: fieldData.polygon,
      },
      create: {
        field_id: fieldData.field_id,
        farm_id: fieldData.farm_id,
        name: fieldData.name,
        area: fieldData.area,
        polygon: fieldData.polygon,
      },
    });
    console.log('Created field:', field.name);
  }

  for (const zoneData of demoData.zones) {
    const field = demoData.fields.find(f => f.field_id === zoneData.field_id);

    const zone = await prisma.zone.upsert({
      where: { zone_id: zoneData.zone_id },
      update: {
        name: zoneData.name,
        polygon: field?.polygon,
        soil_type: zoneData.soil_type,
      },
      create: {
        zone_id: zoneData.zone_id,
        field_id: zoneData.field_id,
        name: zoneData.name,
        polygon: field?.polygon,
        soil_type: zoneData.soil_type,
      },
    });
    console.log('Created zone:', zone.name);

    await prisma.zoneDetail.upsert({
      where: { zone_id: zoneData.zone_id },
      update: {},
      create: {
        zone_id: zoneData.zone_id,
        current_kc: 1.0,
        current_irrigation_gain: 0.015,
        target_sm_percent: 60.0,
        critical_sm_percent: 30.0,
      },
    });
  }

  for (const sensorData of demoData.sensors) {
    const sensor = await prisma.sensorNode.upsert({
      where: { node_id: sensorData.node_id },
      update: {
        battery_level: sensorData.battery_level,
        x: sensorData.x,
        z: sensorData.z,
        status: sensorData.status || 'ACTIVE',
      },
      create: {
        node_id: sensorData.node_id,
        zone_id: sensorData.zone_id,
        hardware_mac: sensorData.hardware_mac,
        battery_level: sensorData.battery_level,
        x: sensorData.x,
        z: sensorData.z,
        status: sensorData.status || 'ACTIVE',
      },
    });
    console.log('Created sensor:', sensor.hardware_mac);

    // Assign unique moisture patterns to each sensor for realistic variety
    const moisturePatterns: Record<string, { baseLevel: number; variation: number; isDrastic: boolean }> = {
      // Zone 1 (Domates - Ahmet) - varied irrigation zones
      '01': { baseLevel: 35, variation: 12, isDrastic: false },
      '02': { baseLevel: 65, variation: 8, isDrastic: false },
      '03': { baseLevel: 45, variation: 15, isDrastic: true },
      '04': { baseLevel: 55, variation: 10, isDrastic: false },
      // Zone 2 (Biber - Ahmet) - drastic variations from poor drainage
      '05': { baseLevel: 72, variation: 6, isDrastic: false },
      '06': { baseLevel: 28, variation: 18, isDrastic: true },
      '07': { baseLevel: 50, variation: 20, isDrastic: true },
      '08': { baseLevel: 42, variation: 14, isDrastic: true },
      // Zone 3 (Patates - Fatma) - sandy soil, lower retention
      '09': { baseLevel: 25, variation: 8, isDrastic: false },
      '0A': { baseLevel: 38, variation: 12, isDrastic: false },
      '0B': { baseLevel: 30, variation: 16, isDrastic: true },
      '0C': { baseLevel: 48, variation: 10, isDrastic: false },
      // Zone 4 (Karışık - Fatma) - mixed moisture patterns
      '0D': { baseLevel: 58, variation: 7, isDrastic: false },
      '0E': { baseLevel: 68, variation: 18, isDrastic: true },
      '0F': { baseLevel: 40, variation: 11, isDrastic: false },
      '10': { baseLevel: 20, variation: 5, isDrastic: false }, // inactive sensor
      // Zone 5 (Domates Serası - Tarık) - greenhouse controlled
      '11': { baseLevel: 62, variation: 5, isDrastic: false },
      '12': { baseLevel: 58, variation: 6, isDrastic: false },
      '13': { baseLevel: 65, variation: 7, isDrastic: false },
      // Zone 6 (Biber Bahçesi - Tarık) - variable microclimate
      '1A': { baseLevel: 45, variation: 13, isDrastic: true },
      '1B': { baseLevel: 70, variation: 9, isDrastic: false },
      '1C': { baseLevel: 52, variation: 17, isDrastic: true },
      // Zone 7 (Patates Tarlası - Tarık) - irregular field
      '1D': { baseLevel: 22, variation: 15, isDrastic: true },
      '1E': { baseLevel: 48, variation: 20, isDrastic: true },
      '1F': { baseLevel: 75, variation: 11, isDrastic: false },
    };

    const sensorSuffix = sensorData.node_id.slice(-2).toUpperCase();
    const moistureConfig = moisturePatterns[sensorSuffix];

    const readings = generateReadings(sensorData.node_id, 72, moistureConfig);

    await prisma.sensorReading.deleteMany({
      where: { node_id: sensorData.node_id },
    });

    const batchSize = 50;
    for (let i = 0; i < readings.length; i += batchSize) {
      const batch = readings.slice(i, i + batchSize);
      await prisma.sensorReading.createMany({
        data: batch,
      });
    }
    console.log(`  Created ${readings.length} readings for sensor ${sensor.hardware_mac}`);
  }

  // sample irrigation job
  const sampleReading = await prisma.sensorReading.findFirst({
    where: { node_id: 'e0000000-0000-0000-0000-000000000001' },
    orderBy: { created_at: 'desc' },
  });

  if (sampleReading) {
    await prisma.irrigationJob.create({
      data: {
        zone_id: 'd0000000-0000-0000-0000-000000000001',
        trigger_reading_id: sampleReading.id,
        reasoning: 'Soil moisture below target threshold (45% < 60%)',
        recommended_duration_min: 30,
        recommended_volume_liters: 500,
        status: 'PENDING',
        actual_start_time: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours from now
      },
    });
    console.log('Created sample irrigation job');
  }

  console.log('Database seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
