import { prisma } from "./config/database";

async function main() {
  const zoneId = "0dfc9046-89dc-4ebd-837a-f9f0f5eb6ab3";

  const zone = await prisma.zone.findUnique({
    where: { zone_id: zoneId },
    include: { field: true },
  });

  console.log("ZONE RESULT:");
  console.dir(zone, { depth: null });

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("PRISMA TEST ERROR:");
  console.error(err);
  try {
    await prisma.$disconnect();
  } catch {}
  process.exit(1);
});