import path from 'node:path';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  earlyAccess: true,
  schema: path.join(__dirname, 'prisma', 'schema.prisma'),

  migrate: {
    adapter: async () => {
      const { Pool } = await import('pg');
      const { PrismaPg } = await import('@prisma/adapter-pg');

      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production'
          ? { rejectUnauthorized: false }
          : undefined,
      });

      return new PrismaPg(pool);
    },
  },
});
