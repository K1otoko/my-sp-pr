import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import pg from 'pg';
import { connectionOptions, databaseErrorCode, parseDatabaseConfig, runMigrations, type DatabaseConfig } from '../src/index.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const name = `my_sp_pr_verify_auth_${Date.now()}_${randomBytes(4).toString('hex')}`;
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
let stage = 'configuration';
let temporary: string | undefined;
const connections: pg.Client[] = [];
function move(config: DatabaseConfig): DatabaseConfig {
  const url = new URL(config.connectionString);
  url.pathname = `/${name}`;
  return { ...config, databaseName: name, connectionString: url.href };
}
async function connect(config: DatabaseConfig) {
  const client = new pg.Client(connectionOptions(config, 'sso-verify-provision'));
  client.on('error', () => { /* Errors are handled without printing connection details. */ });
  connections.push(client);
  await client.connect();
  return client;
}
async function verify() {
  assert(process.env.DATABASE_VERIFY_ADMIN_URL, 'explicit verification administrator required');
  const source = parseEnv(await readFile(join(root, 'backend/pr-auth/.env'), 'utf8'));
  const environment = {
    ...source,
    DATABASE_URL: process.env.DATABASE_VERIFY_AUTH_URL ?? source.DATABASE_URL,
    DATABASE_MIGRATION_URL: process.env.DATABASE_VERIFY_AUTH_MIGRATION_URL ?? source.DATABASE_MIGRATION_URL,
    DATABASE_SSL_MODE: process.env.DATABASE_VERIFY_SSL_MODE ?? source.DATABASE_SSL_MODE,
  };
  const runtime = parseDatabaseConfig(environment, 'runtime');
  const migration = parseDatabaseConfig(environment, 'migration');
  const adminConfig = parseDatabaseConfig({ ...environment, DATABASE_MIGRATION_URL: process.env.DATABASE_VERIFY_ADMIN_URL }, 'migration');
  assert([runtime, migration].every((config) => new URL(config.connectionString).host === new URL(adminConfig.connectionString).host
    && config.databaseName === adminConfig.databaseName), 'verification credentials must share a target');
  const admin = await connect(adminConfig);
  let created = false;
  try {
    stage = 'isolated database creation';
    const version = await admin.query<{ version: number }>("SELECT current_setting('server_version_num')::int AS version");
    assert.equal(Math.floor(version.rows[0]!.version / 10000), 18);
    await admin.query(`CREATE DATABASE ${quote(name)}`);
    created = true;
    const provision = await connect(move(adminConfig));
    await provision.query(`REVOKE ALL ON DATABASE ${quote(name)} FROM PUBLIC`);
    await provision.query('REVOKE ALL ON SCHEMA public FROM PUBLIC');
    await provision.query(`GRANT CONNECT ON DATABASE ${quote(name)} TO my_sp_pr_auth_app`);
    await provision.query(`GRANT CONNECT, CREATE ON DATABASE ${quote(name)} TO my_sp_pr_auth_migrator`);
    await mkdir(join(root, '.verification'), { recursive: true });
    temporary = await mkdtemp(join(root, '.verification/auth-migrations-'));
    const folder = join(root, 'backend/pr-auth/drizzle');
    await cp(folder, temporary, { recursive: true });
    const journalPath = join(temporary, 'meta/_journal.json');
    const journal = JSON.parse(await readFile(journalPath, 'utf8')) as { entries: { idx: number }[] };
    journal.entries = journal.entries.filter((entry) => entry.idx < 2);
    await writeFile(journalPath, JSON.stringify(journal));
    stage = 'namespace upgrade and repeat migration';
    await runMigrations({ config: move(migration), namespace: 'auth', migrationsFolder: temporary });
    assert.equal((await provision.query("SELECT to_regclass('auth.users') AS users")).rows[0].users, null);
    await runMigrations({ config: move(migration), namespace: 'auth', migrationsFolder: folder });
    await runMigrations({ config: move(migration), namespace: 'auth', migrationsFolder: folder });
    assert.equal((await provision.query('SELECT count(*)::int AS count FROM auth_migrations.__drizzle_migrations')).rows[0].count, 3);
    console.log('[sso-verify] PASS PG18 identity migration from existing namespace and repeat.');
    stage = 'protocol and session verification';
    const childEnv: NodeJS.ProcessEnv = {
      ...process.env, NODE_ENV: 'test', DATABASE_URL: move(runtime).connectionString, DATABASE_MIGRATION_URL: '',
      DATABASE_SSL_MODE: runtime.ssl ? 'verify-full' : 'disable', AUTH_VERIFY_DATABASE: name,
    };
    delete childEnv.DATABASE_VERIFY_ADMIN_URL;
    delete childEnv.DATABASE_ADMIN_URL;
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/tests/verify-auth.ts'], {
      cwd: join(root, 'backend/pr-auth'), env: childEnv, stdio: ['ignore', 'inherit', 'inherit'],
    });
    const status = await new Promise<number | null>((resolve, reject) => {
      child.once('error', reject); child.once('close', resolve);
    });
    assert.equal(status, 0, 'authentication verification failed');
  } finally {
    for (const client of connections.filter((client) => client !== admin)) await client.end().catch(() => undefined);
    if (created) {
      await admin.query(`DROP DATABASE ${quote(name)} WITH (FORCE)`);
      console.log('[sso-verify] Temporary authentication database removed.');
    }
    await admin.end();
  }
}
try { await verify(); }
catch (error) {
  console.error(`[sso-verify] FAIL ${stage}: ${databaseErrorCode(error)}`);
  process.exitCode = 1;
} finally {
  for (const client of connections) await client.end().catch(() => undefined);
  if (temporary) await rm(temporary, { recursive: true, force: true });
}
