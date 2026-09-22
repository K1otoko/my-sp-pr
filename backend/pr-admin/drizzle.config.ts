import path from 'node:path';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: path.resolve('backend/pr-admin/src/db/schema/index.ts'),
  // Kit 0.31 prepends "./" when reading snapshots; out must stay root-relative.
  out: './backend/pr-admin/drizzle',
  schemaFilter: ['admin'],
  migrations: { schema: 'admin_migrations', table: '__drizzle_migrations' },
});
