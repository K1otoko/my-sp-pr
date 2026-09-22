import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import {
  connectionOptions, databaseErrorCode, databaseIdentity, DatabaseError,
  type DatabaseConfig, type DatabaseNamespace, type DatabaseMode,
} from './config.js';

export async function checkIdentity(
  client: pg.ClientBase,
  config: DatabaseConfig,
  namespace: DatabaseNamespace,
  mode: DatabaseMode,
) {
  const identity = databaseIdentity(namespace);
  const result = await client.query<{
    version: number; database: string; role: string; privileged: boolean;
    usage: boolean | null; create_schema: boolean; create_objects: boolean | null;
  }>(`SELECT current_setting('server_version_num')::int AS version,
    current_database() AS database, current_user AS role,
    (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls) AS privileged,
    has_database_privilege(current_user, current_database(), 'CREATE') AS create_schema,
    has_schema_privilege(current_user, to_regnamespace($1), 'USAGE') AS usage,
    has_schema_privilege(current_user, to_regnamespace($1), 'CREATE') AS create_objects
    FROM pg_roles WHERE rolname = current_user`, [namespace]);
  const row = result.rows[0];
  if (!row || Math.floor(row.version / 10000) !== 18) throw new DatabaseError('DATABASE_VERSION_MISMATCH');
  if (row.database !== config.databaseName) throw new DatabaseError('DATABASE_TARGET_MISMATCH');
  if (row.role !== (mode === 'runtime' ? identity.appRole : identity.migratorRole) || row.privileged) {
    throw new DatabaseError('DATABASE_ROLE_MISMATCH');
  }
  if (mode === 'runtime' && (!row.usage || row.create_objects || row.create_schema)) {
    throw new DatabaseError('DATABASE_SCHEMA_NOT_READY');
  }
  if (mode === 'migration' && !row.create_schema) throw new DatabaseError('DATABASE_MIGRATION_PERMISSION');
}

export function createDatabase<TSchema extends Record<string, unknown>>({
  config, schema, namespace,
}: {
  config: DatabaseConfig;
  schema: TSchema;
  namespace: DatabaseNamespace;
}) {
  if (config.mode !== 'runtime') throw new DatabaseError('DATABASE_CONFIG_MODE');
  const { service } = databaseIdentity(namespace);
  const pool = new pg.Pool({
    ...connectionOptions(config, service, namespace),
    max: config.poolMax,
    idleTimeoutMillis: config.idleTimeoutMs,
  });
  pool.on('error', (error) => {
    console.error(`[${service}] 数据库空闲连接异常：${databaseErrorCode(error)}`);
  });
  let closing: Promise<void> | undefined;
  return {
    db: drizzle({ client: pool, schema }),
    async checkReady(): Promise<void> {
      if (closing) throw new DatabaseError('DATABASE_CLOSING');
      const client = await pool.connect();
      let failed = false;
      try {
        await checkIdentity(client, config, namespace, 'runtime');
        if (closing) throw new DatabaseError('DATABASE_CLOSING');
      } catch (error) {
        failed = true;
        throw error;
      } finally {
        // A client-side timeout can leave a query in flight. Never reuse that connection.
        client.release(failed);
      }
    },
    close(): Promise<void> {
      closing ??= pool.end();
      return closing;
    },
  };
}
