import path from 'node:path';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: path.resolve('backend/pr-chat/src/db/schema/index.ts'),
  // Kit 0.31 prepends "./" when reading snapshots; out must stay root-relative.
  out: './backend/pr-chat/drizzle',
  schemaFilter: ['chat'],
  migrations: { schema: 'chat_migrations', table: '__drizzle_migrations' },
});
