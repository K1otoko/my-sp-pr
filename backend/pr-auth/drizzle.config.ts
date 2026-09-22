import path from 'node:path';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: path.resolve('backend/pr-auth/src/db/schema/index.ts'),
  // Kit 0.31 prepends "./" when reading snapshots; out must stay root-relative.
  out: './backend/pr-auth/drizzle',
  schemaFilter: ['auth'],
  migrations: { schema: 'auth_migrations', table: '__drizzle_migrations' },
});
