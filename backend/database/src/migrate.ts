import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { checkIdentity } from './client.js';
import {
  connectionOptions, databaseIdentity, DatabaseError,
  type DatabaseConfig, type DatabaseNamespace,
} from './config.js';

export async function runMigrations({
  config, migrationsFolder, namespace,
}: {
  config: DatabaseConfig;
  migrationsFolder: string;
  namespace: DatabaseNamespace;
}): Promise<void> {
  if (config.mode !== 'migration') throw new DatabaseError('DATABASE_CONFIG_MODE');
  const identity = databaseIdentity(namespace);
  const client = new pg.Client(connectionOptions(config, `${identity.service}-migrate`, namespace));
  // Network errors between queries must not become unhandled EventEmitter errors.
  let connectionError: Error | undefined;
  client.on('error', (error) => { connectionError = error; });
  let locked = false;
  try {
    await client.connect();
    await checkIdentity(client, config, namespace, 'migration');
    const result = await client.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock($1, $2) AS locked', [20260922, identity.lockId],
    );
    locked = result.rows[0]?.locked === true;
    if (!locked) throw new DatabaseError('DATABASE_MIGRATION_LOCKED');
    await migrate(drizzle(client), {
      migrationsFolder,
      migrationsSchema: identity.migrationsSchema,
      migrationsTable: '__drizzle_migrations',
    });
    if (connectionError) throw connectionError;
  } finally {
    try {
      if (locked && !connectionError) await client.query('SELECT pg_advisory_unlock($1, $2)', [20260922, identity.lockId]);
    } finally {
      await client.end();
    }
  }
}
