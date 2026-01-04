const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    const count = await prisma.sensorReading.count();
    console.log('Total sensor readings:', count);
    
    if (count > 0) {
      const oldest = await prisma.sensorReading.findFirst({
        orderBy: { created_at: 'asc' }
      });
      const newest = await prisma.sensorReading.findFirst({
        orderBy: { created_at: 'desc' }
      });
      
      const timeSpan = (new Date(newest.created_at) - new Date(oldest.created_at)) / (1000 * 60 * 60);
      console.log('Time span:', timeSpan.toFixed(1), 'hours');
      console.log('Oldest:', oldest.created_at);
      console.log('Newest:', newest.created_at);
    }
    
    const sensors = await prisma.sensorNode.count();
    console.log('Total sensor nodes:', sensors);
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
})();
