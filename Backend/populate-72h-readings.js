const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function randomInRange(min, max) {
  return Math.random() * (max - min) + min;
}

async function populate72Hours() {
  try {
    console.log('Fetching sensor nodes...');
    const sensors = await prisma.sensorNode.findMany();
    console.log('Found ' + sensors.length + ' sensor nodes');
    
    const now = new Date();
    const hoursToCreate = 72;
    const intervalMinutes = 15;
    const readingsPerSensor = (hoursToCreate * 60) / intervalMinutes;
    
    console.log('Creating ' + readingsPerSensor + ' readings per sensor');
    
    let totalCreated = 0;
    
    for (const sensor of sensors) {
      console.log('Processing sensor ' + sensor.node_id + '...');
      
      const readings = [];
      for (let i = 0; i < readingsPerSensor; i++) {
        const timestamp = new Date(now - (i * intervalMinutes * 60 * 1000));
        
        const baseTemp = 20 + Math.sin(i / 10) * 5;
        const baseMoisture = 45 + Math.sin(i / 20) * 15;
        const baseHumidity = 60 + Math.sin(i / 15) * 20;
        
        readings.push({
          node_id: sensor.node_id,
          temperature: baseTemp + randomInRange(-2, 2),
          humidity: baseHumidity + randomInRange(-5, 5),
          sm_percent: baseMoisture + randomInRange(-3, 3),
          raw_sm_value: Math.floor((baseMoisture + randomInRange(-3, 3)) * 40.96),
          created_at: timestamp
        });
      }
      
      const batchSize = 100;
      for (let i = 0; i < readings.length; i += batchSize) {
        const batch = readings.slice(i, i + batchSize);
        await prisma.sensorReading.createMany({
          data: batch,
          skipDuplicates: true
        });
        totalCreated += batch.length;
      }
      
      console.log('  Created ' + readings.length + ' readings');
    }
    
    console.log('Total created: ' + totalCreated);
    
    const total = await prisma.sensorReading.count();
    console.log('Database total: ' + total);
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

populate72Hours();
