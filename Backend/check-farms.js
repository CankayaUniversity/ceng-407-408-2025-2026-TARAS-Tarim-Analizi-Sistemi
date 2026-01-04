const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    const farms = await prisma.farm.findMany({
      include: {
        user: { select: { username: true } },
        fields: { select: { field_id: true, name: true } }
      }
    });
    
    console.log('Total farms:', farms.length);
    farms.forEach(f => {
      console.log(`Farm ${f.farm_id}: User=${f.user?.username}, Fields=${f.fields.length}`);
    });
    
    const fields = await prisma.field.findMany({ take: 5 });
    console.log('\nSample fields:', fields.length);
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
})();
