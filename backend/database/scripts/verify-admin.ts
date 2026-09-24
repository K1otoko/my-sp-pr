import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import pg from 'pg';
import {
  connectionOptions, databaseErrorCode, parseDatabaseConfig, runMigrations, type DatabaseConfig,
} from '../src/index.js';
import { verifyAdminUpgrade } from './verify-admin-upgrade.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const name = `my_sp_pr_verify_admin_${Date.now()}_${randomBytes(4).toString('hex')}`;
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
const connections: pg.Client[] = [];
let created = false;
let upgradeCreated = false;
const upgradeName = `${name}_upgrade`;

function move(config: DatabaseConfig, databaseName = name): DatabaseConfig {
  const url = new URL(config.connectionString);
  url.pathname = `/${databaseName}`;
  return { ...config, databaseName, connectionString: url.href };
}

async function connect(config: DatabaseConfig) {
  const client = new pg.Client(connectionOptions(config, 'admin-verify-provision'));
  client.on('error', () => { /* Assertions report failures without connection details. */ });
  connections.push(client);
  await client.connect();
  return client;
}

async function verify() {
  assert(process.env.DATABASE_VERIFY_ADMIN_URL, 'explicit verification administrator required');
  const source = parseEnv(await readFile(join(root, 'backend/pr-admin/.env'), 'utf8'));
  const environment = {
    ...source,
    DATABASE_URL: process.env.DATABASE_VERIFY_ADMIN_RUNTIME_URL ?? source.DATABASE_URL,
    DATABASE_MIGRATION_URL: process.env.DATABASE_VERIFY_ADMIN_MIGRATION_URL ?? source.DATABASE_MIGRATION_URL,
    DATABASE_SSL_MODE: process.env.DATABASE_VERIFY_SSL_MODE ?? source.DATABASE_SSL_MODE,
  };
  const runtime = parseDatabaseConfig(environment, 'runtime');
  const migration = parseDatabaseConfig(environment, 'migration');
  const administrator = parseDatabaseConfig({
    ...environment,
    DATABASE_MIGRATION_URL: process.env.DATABASE_VERIFY_ADMIN_URL,
  }, 'migration');
  assert([runtime, migration].every((config) => new URL(config.connectionString).host === new URL(administrator.connectionString).host
    && config.databaseName === administrator.databaseName), 'verification credentials must share a target');
  const admin = await connect(administrator);
  try {
    const version = await admin.query<{ version: number }>("SELECT current_setting('server_version_num')::int AS version");
    assert.equal(Math.floor(version.rows[0]!.version / 10000), 18);
    await admin.query(`CREATE DATABASE ${quote(name)}`);
    created = true;
    const provision = await connect(move(administrator));
    await provision.query(`REVOKE ALL ON DATABASE ${quote(name)} FROM PUBLIC`);
    await provision.query('REVOKE ALL ON SCHEMA public FROM PUBLIC');
    await provision.query(`GRANT CONNECT ON DATABASE ${quote(name)} TO my_sp_pr_admin_app`);
    await provision.query(`GRANT CONNECT, CREATE ON DATABASE ${quote(name)} TO my_sp_pr_admin_migrator`);
    await runMigrations({
      config: move(migration),
      namespace: 'admin',
      migrationsFolder: join(root, 'backend/pr-admin/drizzle'),
    });
    console.log('[admin-verify] PASS empty database migration.');
    await admin.query(`CREATE DATABASE ${quote(upgradeName)}`);
    upgradeCreated = true;
    const upgradeProvision = await connect(move(administrator, upgradeName));
    await upgradeProvision.query(`REVOKE ALL ON DATABASE ${quote(upgradeName)} FROM PUBLIC`);
    await upgradeProvision.query('REVOKE ALL ON SCHEMA public FROM PUBLIC');
    await upgradeProvision.query(`GRANT CONNECT ON DATABASE ${quote(upgradeName)} TO my_sp_pr_admin_app`);
    await upgradeProvision.query(`GRANT CONNECT, CREATE ON DATABASE ${quote(upgradeName)} TO my_sp_pr_admin_migrator`);
    const upgradeRuntime = await connect(move(runtime, upgradeName));
    await verifyAdminUpgrade({
      root, migration: move(migration, upgradeName), client: upgradeRuntime,
    });
    const randomToken = () => randomBytes(32).toString('base64url');
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/tests/verify-admin.ts'], {
      cwd: join(root, 'backend/pr-admin'),
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DATABASE_URL: move(runtime).connectionString,
        DATABASE_MIGRATION_URL: '',
        DATABASE_SSL_MODE: runtime.ssl ? 'verify-full' : 'disable',
        ADMIN_VERIFY_DATABASE: name,
        ADMIN_PUBLIC_ORIGIN: 'http://localhost:5174',
        SSO_PUBLIC_ORIGIN: 'http://localhost:5175',
        ADMIN_OIDC_CLIENT_SECRET: randomToken(),
        ADMIN_TOKEN_ENCRYPTION_KEYS: JSON.stringify([{ id: 'test', key: randomToken() }]),
        ADMIN_CSRF_HMAC_KEY: randomToken(),
      },
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    const status = await new Promise<number | null>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });
    assert.equal(status, 0, 'admin verification failed');
  } finally {
    for (const client of connections.filter((client) => client !== admin)) await client.end().catch(() => undefined);
    if (created) {
      await admin.query(`DROP DATABASE ${quote(name)} WITH (FORCE)`);
      console.log('[admin-verify] Temporary admin database removed.');
    }
    if (upgradeCreated) {
      await admin.query(`DROP DATABASE ${quote(upgradeName)} WITH (FORCE)`);
      console.log('[admin-verify] Temporary upgrade database removed.');
    }
    await admin.end();
  }
}

try {
  await verify();
} catch (error) {
  console.error(`[admin-verify] FAIL: ${databaseErrorCode(error)}`);
  process.exitCode = 1;
} finally {
  for (const client of connections) await client.end().catch(() => undefined);
}
