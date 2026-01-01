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
  ],
  fields: [
    {
      field_id: 'c0000000-0000-0000-0000-000000000001',
      farm_id: 'b0000000-0000-0000-0000-000000000001',
      name: 'Buğday Tarlası',
      area: 15.5,
      polygon: {
        exterior: [[0, 0], [120, 0], [120, 80], [0, 80]],
        holes: [],
      },
    },
    {
      field_id: 'c0000000-0000-0000-0000-000000000002',
      farm_id: 'b0000000-0000-0000-0000-000000000001',
      name: 'Mısır Tarlası',
      area: 8.2,
      polygon: {
        exterior: [[0, 0], [80, 0], [80, 40], [50, 40], [50, 70], [0, 70]],
        holes: [],
      },
    },
    {
      field_id: 'c0000000-0000-0000-0000-000000000003',
      farm_id: 'b0000000-0000-0000-0000-000000000002',
      name: 'Pamuk Alanı',
      area: 22.0,
      polygon: {
        exterior: [[0, 0], [150, 0], [150, 100], [0, 100]],
        holes: [[[60, 40], [90, 40], [90, 60], [60, 60]]],
      },
    },
    {
      field_id: 'c0000000-0000-0000-0000-000000000004',
      farm_id: 'b0000000-0000-0000-0000-000000000002',
      name: 'Sebze Bahçesi',
      area: 5.8,
      polygon: {
        exterior: [[10, 5], [95, 0], [100, 55], [5, 65]],
        holes: [],
      },
    },
  ],
  zones: [
    { zone_id: 'd0000000-0000-0000-0000-000000000001', field_id: 'c0000000-0000-0000-0000-000000000001', name: 'Buğday Ana Bölge', soil_type: 'loamy' },
    { zone_id: 'd0000000-0000-0000-0000-000000000002', field_id: 'c0000000-0000-0000-0000-000000000002', name: 'Mısır Ana Bölge', soil_type: 'clay' },
    { zone_id: 'd0000000-0000-0000-0000-000000000003', field_id: 'c0000000-0000-0000-0000-000000000003', name: 'Pamuk Ana Bölge', soil_type: 'sandy' },
    { zone_id: 'd0000000-0000-0000-0000-000000000004', field_id: 'c0000000-0000-0000-0000-000000000004', name: 'Sebze Ana Bölge', soil_type: 'loamy' },
  ],
  sensors: [
    { node_id: 'e0000000-0000-0000-0000-000000000001', zone_id: 'd0000000-0000-0000-0000-000000000001', hardware_mac: 'AA:BB:CC:DD:EE:01', x: 25, z: 60, battery_level: 87 },
    { node_id: 'e0000000-0000-0000-0000-000000000002', zone_id: 'd0000000-0000-0000-0000-000000000001', hardware_mac: 'AA:BB:CC:DD:EE:02', x: 95, z: 60, battery_level: 92 },
    { node_id: 'e0000000-0000-0000-0000-000000000003', zone_id: 'd0000000-0000-0000-0000-000000000001', hardware_mac: 'AA:BB:CC:DD:EE:03', x: 25, z: 20, battery_level: 78 },
    { node_id: 'e0000000-0000-0000-0000-000000000004', zone_id: 'd0000000-0000-0000-0000-000000000001', hardware_mac: 'AA:BB:CC:DD:EE:04', x: 95, z: 20, battery_level: 85 },
    { node_id: 'e0000000-0000-0000-0000-000000000005', zone_id: 'd0000000-0000-0000-0000-000000000002', hardware_mac: 'AA:BB:CC:DD:EE:05', x: 25, z: 55, battery_level: 91 },
    { node_id: 'e0000000-0000-0000-0000-000000000006', zone_id: 'd0000000-0000-0000-0000-000000000002', hardware_mac: 'AA:BB:CC:DD:EE:06', x: 40, z: 25, battery_level: 88 },
    { node_id: 'e0000000-0000-0000-0000-000000000007', zone_id: 'd0000000-0000-0000-0000-000000000002', hardware_mac: 'AA:BB:CC:DD:EE:07', x: 15, z: 10, battery_level: 95 },
    { node_id: 'e0000000-0000-0000-0000-000000000008', zone_id: 'd0000000-0000-0000-0000-000000000002', hardware_mac: 'AA:BB:CC:DD:EE:08', x: 65, z: 10, battery_level: 23 },
    { node_id: 'e0000000-0000-0000-0000-000000000009', zone_id: 'd0000000-0000-0000-0000-000000000003', hardware_mac: 'AA:BB:CC:DD:EE:09', x: 30, z: 80, battery_level: 82 },
    { node_id: 'e0000000-0000-0000-0000-000000000010', zone_id: 'd0000000-0000-0000-0000-000000000003', hardware_mac: 'AA:BB:CC:DD:EE:0A', x: 120, z: 80, battery_level: 79 },
    { node_id: 'e0000000-0000-0000-0000-000000000011', zone_id: 'd0000000-0000-0000-0000-000000000003', hardware_mac: 'AA:BB:CC:DD:EE:0B', x: 30, z: 20, battery_level: 94 },
    { node_id: 'e0000000-0000-0000-0000-000000000012', zone_id: 'd0000000-0000-0000-0000-000000000003', hardware_mac: 'AA:BB:CC:DD:EE:0C', x: 120, z: 20, battery_level: 86 },
    { node_id: 'e0000000-0000-0000-0000-000000000013', zone_id: 'd0000000-0000-0000-0000-000000000004', hardware_mac: 'AA:BB:CC:DD:EE:0D', x: 50, z: 50, battery_level: 90 },
    { node_id: 'e0000000-0000-0000-0000-000000000014', zone_id: 'd0000000-0000-0000-0000-000000000004', hardware_mac: 'AA:BB:CC:DD:EE:0E', x: 80, z: 30, battery_level: 88 },
    { node_id: 'e0000000-0000-0000-0000-000000000015', zone_id: 'd0000000-0000-0000-0000-000000000004', hardware_mac: 'AA:BB:CC:DD:EE:0F', x: 50, z: 15, battery_level: 76 },
    { node_id: 'e0000000-0000-0000-0000-000000000016', zone_id: 'd0000000-0000-0000-0000-000000000004', hardware_mac: 'AA:BB:CC:DD:EE:10', x: 20, z: 35, battery_level: 0, status: 'INACTIVE' as const },
  ],
};

// generate fake readings
function generateReadings(nodeId: string, hoursBack: number = 24): Array<{
  node_id: string;
  sm_percent: number;
  temperature: number;
  humidity: number;
  created_at: Date;
}> {
  const readings = [];
  const now = new Date();

  const sensorIndex = parseInt(nodeId.slice(-2), 16) || 1;
  const baseMoisture = 40 + (sensorIndex % 4) * 8;
  const baseTemp = 20 + (sensorIndex % 3) * 3;
  const baseHumidity = 50 + (sensorIndex % 5) * 5;

  for (let i = hoursBack * 2; i >= 0; i--) {
    const timestamp = new Date(now.getTime() - i * 30 * 60 * 1000);
    const hour = timestamp.getHours();

    // daily pattern simulation
    const tempModifier = Math.sin((hour - 6) * Math.PI / 12) * 8;
    const moistureModifier = -Math.sin((hour - 6) * Math.PI / 12) * 10;
    const humidityModifier = -Math.sin((hour - 6) * Math.PI / 12) * 15;

    const randomFactor = () => (Math.random() - 0.5) * 4;

    readings.push({
      node_id: nodeId,
      sm_percent: Math.max(20, Math.min(80, baseMoisture + moistureModifier + randomFactor())),
      temperature: Math.max(10, Math.min(40, baseTemp + tempModifier + randomFactor())),
      humidity: Math.max(30, Math.min(90, baseHumidity + humidityModifier + randomFactor())),
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
      update: {},
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
      update: {},
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
      update: {},
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

    const readings = generateReadings(sensorData.node_id, 24);

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
