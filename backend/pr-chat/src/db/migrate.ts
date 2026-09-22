import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { databaseErrorCode, parseDatabaseConfig, runMigrations } from '@my-sp-pr/database';

try {
  try { loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url))); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  await runMigrations({
    config: parseDatabaseConfig(process.env, 'migration'),
    namespace: 'chat',
    migrationsFolder: fileURLToPath(new URL('../../drizzle/', import.meta.url)),
  });
  console.log('[pr-chat] 数据库迁移完成。');
} catch (error) {
  console.error(`[pr-chat] 数据库迁移失败：${databaseErrorCode(error)}`);
  process.exitCode = 1;
}
