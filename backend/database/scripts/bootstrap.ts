import { randomBytes } from 'node:crypto';
import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import pg from 'pg';
import {
  connectionOptions, parseDatabaseConfig, databaseNamespaces, databaseIdentity, databaseErrorCode, DatabaseError,
} from '../src/index.js';

const root = new URL('../../../', import.meta.url);
try { loadEnvFile(fileURLToPath(new URL('.env.database-admin', root))); } catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}
const quoteIdentifier = (value: string) => `"${value.replaceAll('"', '""')}"`;
const quoteLiteral = (value: string) => `'${value.replaceAll("'", "''")}'`;

async function bootstrap() {
  const config = parseDatabaseConfig({
    ...process.env,
    DATABASE_MIGRATION_URL: process.env.DATABASE_ADMIN_URL,
    DATABASE_CONNECT_TIMEOUT_MS: '10000',
  }, 'migration');
  const client = new pg.Client(connectionOptions(config, 'my-sp-pr-bootstrap'));
  client.on('error', () => { /* Query/connect report failures; never print driver messages. */ });
  const staged: { destination: URL; temporary: URL; contents: string }[] = [];
  let committed = false;
  let transactionStarted = false;
  try {
    // Prepare all credentials before SQL, preserving unrelated local environment entries.
    const roles: { name: string; password: string; migrator: boolean }[] = [];
    for (const namespace of databaseNamespaces) {
      const identity = databaseIdentity(namespace);
      const destination = new URL(`backend/pr-${namespace}/.env`, root);
      let existing = '';
      try { existing = await readFile(destination, 'utf8'); } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      const old = parseEnv(existing);
      if (old.DATABASE_URL || old.DATABASE_MIGRATION_URL || old.DATABASE_SSL_MODE) {
        throw new DatabaseError('BOOTSTRAP_ENV_ALREADY_CONFIGURED');
      }
      const urls: string[] = [];
      for (const [name, migrator] of [[identity.appRole, false], [identity.migratorRole, true]] as const) {
        const password = randomBytes(32).toString('base64url');
        const url = new URL(config.connectionString);
        url.username = name;
        url.password = password;
        roles.push({ name, password, migrator });
        urls.push(url.toString());
      }
      const sslLines = [
        `DATABASE_SSL_MODE=${config.ssl ? 'verify-full' : 'disable'}`,
        process.env.DATABASE_SSL_CA_FILE
          ? `DATABASE_SSL_CA_FILE=${process.env.DATABASE_SSL_CA_FILE}` : undefined,
        process.env.DATABASE_SSL_SERVERNAME
          ? `DATABASE_SSL_SERVERNAME=${process.env.DATABASE_SSL_SERVERNAME}` : undefined,
      ].filter((line): line is string => Boolean(line));
      const contents = `${existing}${existing.endsWith('\n') || !existing ? '' : '\n'}`
        + `DATABASE_URL=${urls[0]}\nDATABASE_MIGRATION_URL=${urls[1]}\n`
        + `${sslLines.join('\n')}\n`;
      const temporary = new URL(`.env.bootstrap-${randomBytes(6).toString('hex')}`, destination);
      staged.push({ destination, temporary, contents });
    }
    await client.connect();
    await client.query('BEGIN');
    transactionStarted = true;
    const preflight = await client.query<{ version: number; allowed: boolean; empty: boolean; roles_free: boolean }>(`
      SELECT current_setting('server_version_num')::int AS version,
        (r.rolcreaterole AND d.datdba = r.oid) AS allowed,
        NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname NOT IN ('public', 'information_schema')
          AND nspname NOT LIKE 'pg_%') AND
        NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public') AS empty,
        NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ANY($1::text[])) AS roles_free
      FROM pg_roles r JOIN pg_database d ON d.datname=current_database() WHERE r.rolname=current_user`,
    [roles.map((role) => role.name)]);
    const state = preflight.rows[0];
    if (!state || Math.floor(state.version / 10000) !== 18 || !state.allowed) throw new DatabaseError('BOOTSTRAP_ADMIN_OR_VERSION_INVALID');
    if (!state.empty || !state.roles_free) throw new DatabaseError('BOOTSTRAP_EXISTING_OBJECTS');
    for (const file of staged) await writeFile(file.temporary, file.contents, { flag: 'wx', mode: 0o600 });
    const database = quoteIdentifier(config.databaseName);
    for (const role of roles) {
      const name = quoteIdentifier(role.name);
      await client.query(`CREATE ROLE ${name} LOGIN PASSWORD ${quoteLiteral(role.password)}
        NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
      await client.query(`GRANT CONNECT${role.migrator ? ', CREATE' : ''} ON DATABASE ${database} TO ${name}`);
    }
    await client.query(`REVOKE CONNECT, TEMPORARY ON DATABASE ${database} FROM PUBLIC`);
    await client.query('REVOKE ALL ON SCHEMA public FROM PUBLIC');
    await client.query('COMMIT');
    committed = true;
    for (const file of staged) await rename(file.temporary, file.destination);
    console.log('PG18 初始化完成：六个独立账号已创建，凭据写入各服务 .env（0600）。下一步执行 pnpm db:migrate。');
  } finally {
    if (!committed) {
      if (transactionStarted) await client.query('ROLLBACK').catch(() => undefined);
      for (const file of staged) await unlink(file.temporary).catch(() => undefined);
    }
    // If renaming fails after commit, retain the ignored .env.bootstrap-* recovery files.
    await client.end();
  }
}

try { await bootstrap(); } catch (error) {
  console.error(`数据库初始化失败：${databaseErrorCode(error)}。请核对配置及已有对象；提交后的凭据保留在服务 .env.bootstrap-* 文件中。`);
  process.exitCode = 1;
}
