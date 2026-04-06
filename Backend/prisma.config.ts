import 'dotenv/config';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  earlyAccess: true,
  schema: path.join(__dirname, 'prisma', 'schema.prisma'),

  migrate: {
    adapter: async () => {
      const { Pool: PgPool } = await import('pg');
      const { PrismaPg } = await import('@prisma/adapter-pg');
      // use adapter's pg types for compatibility
      const { Pool: AdapterPool } = await import('@prisma/adapter-pg/node_modules/pg');

      const pool: AdapterPool = new PgPool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production'
          ? { rejectUnauthorized: false }
          : undefined,
      });

      return new PrismaPg(pool);
    },
  },
});
