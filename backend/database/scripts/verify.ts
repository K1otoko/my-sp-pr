import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type Socket } from 'node:net';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';
import { eq, sql } from 'drizzle-orm';
import { pgSchema, serial, text } from 'drizzle-orm/pg-core';
import pg from 'pg';
import { checkIdentity } from '../src/client.js';
import {
  connectionOptions, createDatabase, databaseErrorCode, databaseIdentity, databaseNamespaces,
  parseDatabaseConfig, runMigrations, type DatabaseConfig, type DatabaseNamespace,
} from '../src/index.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const databaseName = `my_sp_pr_verify_${Date.now()}_${randomBytes(4).toString('hex')}`;
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
const clients = new Set<pg.Client>();
const databases = new Set<ReturnType<typeof createDatabase>>();
interface Running {
  child: ChildProcess;
  exit: Promise<number | null>;
  output: () => string;
  exited: () => boolean;
}
const children: Running[] = [];
let temporary: string | undefined;
let stage = 'configuration';

function code(error: unknown): string {
  if (error instanceof Error && error.cause) return code(error.cause);
  return databaseErrorCode(error);
}

async function rejectsCode(action: () => Promise<unknown>, expected: string) {
  await assert.rejects(action, (error: unknown) => code(error) === expected);
}

async function bounded<T>(promise: Promise<T>, milliseconds = 15_000): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('VERIFY_TIMEOUT')), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function connect(config: DatabaseConfig, namespace?: DatabaseNamespace) {
  const client = new pg.Client(connectionOptions(config, 'my-sp-pr-verify', namespace));
  client.on('error', () => { /* Queries and assertions handle errors without exposing credentials. */ });
  clients.add(client);
  await client.connect();
  return client;
}

async function disconnect(client: pg.Client) {
  await client.end();
  clients.delete(client);
}

function start(file: string, environment: NodeJS.ProcessEnv, extraArguments: string[] = []): Running {
  const env = { ...process.env, ...environment };
  delete env.DATABASE_ADMIN_URL;
  delete env.DATABASE_VERIFY_ADMIN_URL;
  const child = spawn(process.execPath, [...extraArguments, file], {
    cwd: temporary ?? root, env, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk: Buffer) => { output += chunk.toString(); });
  let exited = false;
  const exit = new Promise<number | null>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (status) => { exited = true; resolve(status); });
  });
  const running = { child, exit, output: () => output, exited: () => exited };
  children.push(running);
  return running;
}

async function stop(running: ReturnType<typeof start>, signal: NodeJS.Signals = 'SIGTERM') {
  if (!running.exited()) running.child.kill(signal);
  return bounded(running.exit);
}

async function freePort() {
  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const address = listener.address();
  assert(address && typeof address !== 'string');
  await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function waitFor(condition: () => Promise<boolean>, milliseconds = 15_000) {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await delay(100);
  }
  throw new Error('VERIFY_WAIT_TIMEOUT');
}

async function response(port: number, path: string, expected: number) {
  const result = await fetch(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(7500) });
  assert.equal(result.status, expected, path);
  const body: unknown = await result.json();
  return { result, body };
}

async function waitHealthy(port: number, path: string, running: ReturnType<typeof start>) {
  await waitFor(async () => {
    assert(!running.exited(), 'HTTP process exited before listening');
    try {
      await response(port, path, 200);
      return true;
    } catch { return false; }
  });
}

function movedConfig(config: DatabaseConfig): DatabaseConfig {
  const url = new URL(config.connectionString);
  url.pathname = `/${databaseName}`;
  return { ...config, databaseName, connectionString: url.toString() };
}

async function verify() {
  assert(process.env.DATABASE_VERIFY_ADMIN_URL, 'DATABASE_VERIFY_ADMIN_URL is required explicitly');
  const adminConfig = parseDatabaseConfig({
    DATABASE_MIGRATION_URL: process.env.DATABASE_VERIFY_ADMIN_URL,
    DATABASE_SSL_MODE: process.env.DATABASE_SSL_MODE,
    DATABASE_SSL_CA_FILE: process.env.DATABASE_SSL_CA_FILE,
    DATABASE_CONNECT_TIMEOUT_MS: '10000',
  }, 'migration');
  const services = [];
  for (const namespace of databaseNamespaces) {
    const env = parseEnv(await readFile(join(root, `backend/pr-${namespace}/.env`), 'utf8'));
    env.DATABASE_URL = process.env[`DATABASE_VERIFY_${namespace.toUpperCase()}_RUNTIME_URL`] ?? env.DATABASE_URL!;
    env.DATABASE_MIGRATION_URL = process.env[`DATABASE_VERIFY_${namespace.toUpperCase()}_MIGRATION_URL`] ?? env.DATABASE_MIGRATION_URL!;
    env.DATABASE_SSL_MODE = process.env.DATABASE_SSL_MODE ?? env.DATABASE_SSL_MODE!;
    const runtime = parseDatabaseConfig(env, 'runtime');
    const migration = parseDatabaseConfig(env, 'migration');
    for (const config of [runtime, migration]) {
      const target = new URL(config.connectionString);
      const adminTarget = new URL(adminConfig.connectionString);
      assert(target.host === adminTarget.host && config.databaseName === adminConfig.databaseName,
        'Verification credentials must refer to the same PostgreSQL cluster and database');
    }
    services.push({
      namespace, runtime: movedConfig(runtime), migration: movedConfig(migration),
      migrationsFolder: join(root, `backend/pr-${namespace}/drizzle`),
      server: join(root, `backend/pr-${namespace}/dist/server.js`),
      port: await freePort(),
      migrationCount: (JSON.parse(await readFile(join(root, `backend/pr-${namespace}/drizzle/meta/_journal.json`), 'utf8')) as { entries: unknown[] }).entries.length,
    });
  }
  const auth = services[0];
  assert(auth);
  for (const override of [
    { DATABASE_URL: '' }, { DATABASE_URL: 'https://invalid.example/' },
    { DATABASE_URL: `${auth.runtime.connectionString}?options=unsafe` },
    { DATABASE_POOL_MAX: '0' }, { DATABASE_QUERY_TIMEOUT_MS: '3000' },
    { NODE_ENV: 'production', DATABASE_SSL_MODE: '' },
  ]) {
    assert.throws(() => parseDatabaseConfig({
      DATABASE_URL: auth.runtime.connectionString,
      DATABASE_SSL_MODE: 'verify-full',
      ...override,
    }, 'runtime'));
  }
  // PG17 is deliberately a simulated identity row; all integration SQL below uses real PG18.
  const pg17 = { query: async () => ({ rows: [{ version: 170001 }] }) } as unknown as pg.ClientBase;
  await rejectsCode(() => checkIdentity(pg17, auth.runtime, 'auth', 'runtime'), 'DATABASE_VERSION_MISMATCH');
  await mkdir(join(root, '.verification'), { recursive: true });
  temporary = await mkdtemp(join(root, '.verification/database-'));
  const authConfigFile = join(temporary, 'auth.json');
  const keygen = start(join(root, 'backend/pr-auth/dist/scripts/generate-keys.js'), { AUTH_CONFIG_FILE: authConfigFile });
  assert.equal(await bounded(keygen.exit), 0);
  const admin = await connect(adminConfig);
  let created = false;
  try {
    stage = 'temporary database / migrations';
    const version = await admin.query<{ version: string }>("SELECT current_setting('server_version') AS version");
    console.log(`[verify] PostgreSQL ${version.rows[0]?.version}; creating isolated database.`);
    await admin.query(`CREATE DATABASE ${quote(databaseName)}`);
    created = true;
    const provision = await connect(movedConfig(adminConfig));
    await provision.query(`REVOKE ALL ON DATABASE ${quote(databaseName)} FROM PUBLIC`);
    await provision.query('REVOKE ALL ON SCHEMA public FROM PUBLIC');
    for (const service of services) {
      const identity = databaseIdentity(service.namespace);
      await provision.query(`GRANT CONNECT ON DATABASE ${quote(databaseName)} TO ${quote(identity.appRole)}`);
      await provision.query(`GRANT CONNECT, CREATE ON DATABASE ${quote(databaseName)} TO ${quote(identity.migratorRole)}`);
    }
    const unready = createDatabase({ config: auth.runtime, namespace: 'auth', schema: {} });
    databases.add(unready);
    await rejectsCode(() => unready.checkReady(), 'DATABASE_SCHEMA_NOT_READY');
    await unready.close();
    databases.delete(unready);
    const missingSchema = start(auth.server, {
      NODE_ENV: 'test', HOST: '127.0.0.1', PORT: String(auth.port),
      DATABASE_URL: auth.runtime.connectionString,
      DATABASE_SSL_MODE: auth.runtime.ssl ? 'verify-full' : 'disable',
      AUTH_CONFIG_FILE: authConfigFile,
    });
    assert.equal(await bounded(missingSchema.exit), 1);
    assert(!missingSchema.output().includes('服务已启动'));
    for (const service of services) {
      await runMigrations({ ...service, config: service.migration });
      await runMigrations({ ...service, config: service.migration });
      const migrator = await connect(service.migration, service.namespace);
      const history = quote(databaseIdentity(service.namespace).migrationsSchema);
      const records = await migrator.query<{ count: number }>(`SELECT count(*)::int AS count FROM ${history}.__drizzle_migrations`);
      assert.equal(records.rows[0]?.count, service.migrationCount);
      await migrator.query(`CREATE TABLE ${quote(service.namespace)}.verify_items (id serial PRIMARY KEY, value text NOT NULL)`);
      await disconnect(migrator);
    }
    const holder = await connect(auth.migration, 'auth');
    await holder.query('SELECT pg_advisory_lock(20260922, 1)');
    await rejectsCode(() => runMigrations({ ...auth, config: auth.migration }), 'DATABASE_MIGRATION_LOCKED');
    const chat = services[1];
    assert(chat);
    await runMigrations({ ...chat, config: chat.migration });
    await holder.query('SELECT pg_advisory_unlock(20260922, 1)');
    const fixture = join(temporary, 'failed-migration');
    await cp(auth.migrationsFolder, fixture, { recursive: true });
    const journalPath = join(fixture, 'meta/_journal.json');
    const journal = JSON.parse(await readFile(journalPath, 'utf8')) as {
      entries: { idx: number; version: string; when: number; tag: string; breakpoints: boolean }[];
    };
    const latest = Math.max(...journal.entries.map((entry) => entry.when));
    const failureTag = `${String(auth.migrationCount).padStart(4, '0')}_failure`;
    journal.entries.push({ idx: auth.migrationCount, version: '7', when: latest + 1, tag: failureTag, breakpoints: true });
    await writeFile(journalPath, JSON.stringify(journal));
    await writeFile(join(fixture, `${failureTag}.sql`),
      'CREATE TABLE auth.verify_rollback(id int);\n--> statement-breakpoint\nSELECT 1 / 0;');
    await rejectsCode(() => runMigrations({ ...auth, config: auth.migration, migrationsFolder: fixture }), '22012');
    const rollback = await holder.query<{ absent: boolean; count: number }>(
      "SELECT to_regclass('auth.verify_rollback') IS NULL AS absent, (SELECT count(*)::int FROM auth_migrations.__drizzle_migrations) AS count",
    );
    assert.deepEqual(rollback.rows, [{ absent: true, count: auth.migrationCount }]);
    await disconnect(holder);
    console.log('[verify] PASS migrations: repeat, separate histories, concurrent lock and transactional rollback.');

    stage = 'Drizzle / permissions / timeouts';
    for (const service of services) {
      stage = `Drizzle CRUD / ${service.namespace}`;
      const table = pgSchema(service.namespace).table('verify_items', { id: serial().primaryKey(), value: text().notNull() });
      const runtime = createDatabase({ config: service.runtime, namespace: service.namespace, schema: { table } });
      databases.add(runtime);
      await runtime.checkReady();
      const value = "'; DROP SCHEMA auth CASCADE; --";
      const [inserted] = await runtime.db.insert(table).values({ value }).returning();
      assert(inserted);
      assert.equal(inserted.value, value);
      const [selected] = await runtime.db.select().from(table).where(eq(table.id, inserted.id));
      assert.equal(selected?.value, value);
      await runtime.db.update(table).set({ value: 'updated' }).where(eq(table.id, inserted.id));
      await assert.rejects(() => runtime.db.transaction(async (transaction) => {
        await transaction.insert(table).values({ value: 'rolled back' });
        throw new Error('VERIFY_ROLLBACK');
      }), /VERIFY_ROLLBACK/u);
      assert.equal((await runtime.db.select().from(table)).length, 1);
      await runtime.db.delete(table).where(eq(table.id, inserted.id));
      assert.equal((await runtime.db.select().from(table)).length, 0);
      const other = service.namespace === 'chat' ? 'auth' : 'chat';
      for (const statement of [
        `CREATE TABLE ${service.namespace}.forbidden(id int)`,
        'CREATE SCHEMA forbidden', 'CREATE TEMP TABLE forbidden(id int)',
        `TRUNCATE ${service.namespace}.verify_items`,
        `SELECT * FROM ${other}.verify_items`,
        `INSERT INTO ${other}.verify_items(value) VALUES ('forbidden')`,
        `SELECT * FROM ${service.namespace}_migrations.__drizzle_migrations`,
        `DELETE FROM ${service.namespace}_migrations.__drizzle_migrations`,
      ]) {
        stage = `permissions / ${service.namespace} / ${statement.split(' ').slice(0, 3).join(' ')}`;
        await rejectsCode(() => runtime.db.execute(sql.raw(statement)), '42501');
      }
      stage = `identity / ${service.namespace}`;
      const app = await connect(service.runtime, service.namespace);
      await rejectsCode(() => checkIdentity(app, { ...service.runtime, databaseName: 'wrong' }, service.namespace, 'runtime'),
        'DATABASE_TARGET_MISMATCH');
      await rejectsCode(() => checkIdentity(app, service.runtime, other, 'runtime'), 'DATABASE_ROLE_MISMATCH');
      await disconnect(app);
      assert.equal(runtime.close(), runtime.close());
      await runtime.close();
      await rejectsCode(() => runtime.checkReady(), 'DATABASE_CLOSING');
      databases.delete(runtime);
      console.log(`[verify] PASS ${service.namespace}: ORM, isolation, identity and close.`);
    }
    stage = 'pool acquisition timeout';
    const timed = createDatabase({
      config: { ...auth.runtime, poolMax: 1, statementTimeoutMs: 500, queryTimeoutMs: 1200 },
      namespace: 'auth', schema: {},
    });
    databases.add(timed);
    await timed.checkReady();
    const held = await timed.db.$client.connect();
    try {
      const started = Date.now();
      await assert.rejects(() => timed.checkReady());
      assert(Date.now() - started < 4000, 'Pool acquisition is bounded');
    } finally { held.release(); }
    stage = 'statement timeout';
    await rejectsCode(() => timed.db.execute(sql`SELECT pg_sleep(2)`), '57014');
    // Disable only this temporary session's server limit to reach the driver timeout.
    await timed.db.execute(sql`SET statement_timeout = 0`);
    stage = 'driver query timeout';
    const started = Date.now();
    await assert.rejects(() => timed.db.execute(sql`SELECT pg_sleep(3)`));
    assert(Date.now() - started < 2500, 'Driver query timeout is bounded');
    await timed.checkReady();
    stage = 'failed readiness connection disposal';
    // PostgreSQL grants belong to their grantor; revoke as the migration role that granted USAGE.
    const grantor = await connect(auth.migration, 'auth');
    await grantor.query('REVOKE USAGE ON SCHEMA auth FROM my_sp_pr_auth_app');
    await rejectsCode(() => timed.checkReady(), 'DATABASE_SCHEMA_NOT_READY');
    assert.equal(timed.db.$client.totalCount, 0, 'Failed readiness destroys the connection');
    await grantor.query('GRANT USAGE ON SCHEMA auth TO my_sp_pr_auth_app');
    await disconnect(grantor);
    await timed.checkReady();
    await timed.close();
    databases.delete(timed);
    console.log('[verify] PASS Drizzle CRUD/parameters/rollback, permissions, timeout limits and pool recovery.');

    stage = 'HTTP / recovery / lifecycle';
    const environment = (service: typeof auth): NodeJS.ProcessEnv => ({
      NODE_ENV: 'test', HOST: '127.0.0.1', PORT: String(service.port),
      DATABASE_URL: service.runtime.connectionString, DATABASE_MIGRATION_URL: '',
      DATABASE_SSL_MODE: service.runtime.ssl ? 'verify-full' : 'disable',
      AUTH_CONFIG_FILE: authConfigFile, SSO_PUBLIC_ORIGIN: 'http://localhost:5175',
      ...(process.env.DATABASE_SSL_CA_FILE ? { DATABASE_SSL_CA_FILE: process.env.DATABASE_SSL_CA_FILE } : {}),
    });
    const runningServices = [];
    for (const service of services) {
      const running = start(service.server, environment(service));
      await waitHealthy(service.port, `/api/${service.namespace}/health`, running);
      const ready = await response(service.port, `/api/${service.namespace}/ready`, 200);
      assert.equal(ready.result.headers.get('cache-control'), 'no-store');
      assert(ready.body && typeof ready.body === 'object' && 'data' in ready.body);
      assert.deepEqual({ ...ready.body.data as object, timestamp: undefined }, {
        status: 'ready', service: `pr-${service.namespace}`, timestamp: undefined, checks: { database: 'ok' },
      });
      runningServices.push({ ...service, running });
    }
    const gatewayPort = await freePort();
    const upstreams = Object.fromEntries(services.map((service) => [
      `${service.namespace.toUpperCase()}_SERVICE_URL`, `http://127.0.0.1:${service.port}`,
    ]));
    const gateway = start(join(root, 'backend/gateway/dist/server.js'), {
      NODE_ENV: 'test', HOST: '127.0.0.1', PORT: String(gatewayPort), ...upstreams,
    });
    await waitHealthy(gatewayPort, '/api/health', gateway);
    for (const service of services) {
      await response(gatewayPort, `/api/${service.namespace}/health`, 200);
      await response(gatewayPort, `/api/${service.namespace}/ready`, 404);
    }
    for (const service of services) {
      const identity = databaseIdentity(service.namespace);
      await provision.query(`REVOKE CONNECT ON DATABASE ${quote(databaseName)} FROM ${quote(identity.appRole)}`);
      await provision.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND usename=$2',
        [databaseName, identity.appRole]);
      const unavailable = await response(service.port, `/api/${service.namespace}/ready`, 503);
      assert.deepEqual(unavailable.body, {
        success: false, error: { code: 'DATABASE_NOT_READY', message: '服务尚未就绪' },
      });
      await response(gatewayPort, `/api/${service.namespace}/health`, 200);
      if (service.namespace === 'auth') {
        const failedLogin = await fetch(`http://127.0.0.1:${gatewayPort}/api/auth/portal/start`, { redirect: 'manual' });
        assert.equal(failedLogin.status, 500, 'database outage must not start a successful identity flow');
      }
      await provision.query(`GRANT CONNECT ON DATABASE ${quote(databaseName)} TO ${quote(identity.appRole)}`);
      await response(service.port, `/api/${service.namespace}/ready`, 200);
    }
    for (const [index, service] of runningServices.entries()) {
      service.running.child.kill(index % 2 ? 'SIGINT' : 'SIGTERM');
      if (!service.running.exited()) service.running.child.kill('SIGTERM');
      assert.equal(await bounded(service.running.exit), 0);
    }
    assert.equal(await stop(gateway), 0);
    for (const [label, overrides] of [
      ['missing-url', { DATABASE_URL: '' }],
      ['wrong-role', { DATABASE_URL: auth.migration.connectionString }],
      ['wrong-password', { DATABASE_URL: (() => {
        const url = new URL(auth.runtime.connectionString);
        url.password = randomBytes(24).toString('hex');
        return url.toString();
      })() }],
      ['unreachable', { DATABASE_URL: 'postgresql://invalid:invalid@127.0.0.1:1/invalid', DATABASE_SSL_MODE: 'disable' }],
    ] as const) {
      const failed = start(auth.server, { ...environment(auth), ...overrides });
      assert.equal(await bounded(failed.exit), 1, label);
      assert(!failed.output().includes('服务已启动'), label);
    }
    const occupied = createServer();
    occupied.listen(auth.port, '127.0.0.1');
    await once(occupied, 'listening');
    try {
      const failed = start(auth.server, environment(auth));
      assert.equal(await bounded(failed.exit), 1);
      assert(failed.output().includes('已被占用'));
    } finally { await new Promise<void>((resolve) => occupied.close(() => resolve())); }
    // A local TCP listener deliberately never completes a PostgreSQL handshake.
    const sockets = new Set<Socket>();
    const stalled = createServer((socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
    });
    stalled.listen(0, '127.0.0.1');
    await once(stalled, 'listening');
    try {
      const address = stalled.address();
      assert(address && typeof address !== 'string');
      const starting = start(auth.server, {
        ...environment(auth), DATABASE_SSL_MODE: 'disable',
        DATABASE_URL: `postgresql://invalid:invalid@127.0.0.1:${address.port}/invalid`,
      });
      await waitFor(async () => sockets.size > 0);
      starting.child.kill('SIGINT');
      await delay(50);
      if (!starting.exited()) starting.child.kill('SIGTERM');
      assert.equal(await bounded(starting.exit), 0);
      assert(!starting.output().includes('服务已启动'));
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => stalled.close(() => resolve()));
    }
    stage = 'shutdown deadline';
    const heldPool = join(temporary, 'held-pool.mjs');
    const authDatabase = pathToFileURL(join(root, 'backend/pr-auth/dist/db/index.js')).href;
    await writeFile(heldPool, [
      `const { database } = await import(${JSON.stringify(authDatabase)});`,
      'await database.db.$client.connect();', // Intentionally unreleased fixture connection.
      `await import(${JSON.stringify(pathToFileURL(auth.server).href)});`,
    ].join('\n'));
    const stuck = start(heldPool, environment(auth));
    await waitHealthy(auth.port, '/api/auth/health', stuck);
    const shutdownStarted = Date.now();
    stuck.child.kill('SIGTERM');
    await delay(100);
    if (!stuck.exited()) stuck.child.kill('SIGINT');
    assert.equal(await bounded(stuck.exit, 13_000), 1);
    assert(Date.now() - shutdownStarted >= 9500 && Date.now() - shutdownStarted < 12_500);
    assert(stuck.output().includes('关闭超时'));

    const deployment = process.env.DATABASE_VERIFY_AUTH_DEPLOY_DIR;
    const gatewayDeployment = process.env.DATABASE_VERIFY_GATEWAY_DEPLOY_DIR;
    if (deployment && gatewayDeployment) {
      stage = 'standalone deployment';
      const migrated = start(join(deployment, 'dist/db/migrate.js'), {
        NODE_ENV: 'production', DATABASE_URL: '', DATABASE_MIGRATION_URL: auth.migration.connectionString,
        DATABASE_SSL_MODE: auth.runtime.ssl ? 'verify-full' : 'disable',
      });
      assert.equal(await bounded(migrated.exit), 0);
      const deployedAuth = start(join(deployment, 'dist/server.js'), {
        ...environment(auth), NODE_ENV: 'production', SSO_PUBLIC_ORIGIN: 'https://sso.verify.example.com',
      });
      await waitHealthy(auth.port, '/api/auth/ready', deployedAuth);
      const deployedGateway = start(join(gatewayDeployment, 'dist/server.js'), {
        NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(gatewayPort),
        ...upstreams, CORS_ORIGINS: 'https://verify.example.com', SSO_PUBLIC_ORIGIN: 'https://sso.verify.example.com',
      });
      await waitHealthy(gatewayPort, '/api/health', deployedGateway);
      await response(gatewayPort, '/api/auth/health', 200);
      await response(gatewayPort, '/api/auth/ready', 404);
      assert.equal(await stop(deployedAuth), 0);
      assert.equal(await stop(deployedGateway), 0);
      console.log('[verify] PASS standalone production deployment: migration, service and gateway.');
    }
    const connections = await provision.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=$1 AND application_name LIKE 'pr-%'", [databaseName],
    );
    assert.equal(connections.rows[0]?.count, 0, 'Service and migration connections must be closed');
    console.log('[verify] PASS HTTP health/ready, gateway isolation, outage/recovery, startup failures, signals and shutdown deadline.');
    console.log('[verify] PASS all database integration assertions (PG17 mismatch uses a simulated identity row).');
  } finally {
    stage += ' / cleanup';
    for (const child of children) {
      if (!child.exited()) {
        try { await stop(child); } catch {
          child.child.kill('SIGKILL');
          await child.exit.catch(() => undefined);
        }
      }
    }
    for (const database of databases) await database.close().catch(() => undefined);
    for (const client of clients) {
      if (client !== admin) await disconnect(client).catch(() => undefined);
    }
    if (created) {
      await admin.query(`DROP DATABASE ${quote(databaseName)} WITH (FORCE)`);
      console.log('[verify] Temporary database removed.');
    }
    await disconnect(admin);
  }
}

try {
  await verify();
} catch (error) {
  // Never print assertion objects, driver causes, child logs or environment contents.
  console.error(`[verify] FAIL ${stage}: ${code(error)}`);
  if (error instanceof Error) {
    const location = error.stack?.split('\n').find((line) => /^\s+at /u.test(line) && line.includes('/scripts/verify.ts:'));
    if (location) console.error(location.trim());
  }
  process.exitCode = 1;
} finally {
  for (const client of clients) await client.end().catch(() => undefined);
  if (temporary) await rm(temporary, { recursive: true, force: true });
}
