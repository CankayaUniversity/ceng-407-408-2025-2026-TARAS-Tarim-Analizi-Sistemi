import { prisma } from "../src/config/database";
import { ensureAdminRole, ensureFarmerRole } from "../src/services/userService";

async function main() {
  console.log("Seeding roles...");
  await ensureAdminRole();
  await ensureFarmerRole();
  console.log("Roles seeded successfully");
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
