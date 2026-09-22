import { readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import type { ClientConfig } from 'pg';
import { z } from 'zod';

export const databaseNamespaces = ['auth', 'chat', 'admin'] as const;
export type DatabaseNamespace = typeof databaseNamespaces[number];
export type DatabaseMode = 'runtime' | 'migration';

export function databaseIdentity(namespace: DatabaseNamespace) {
  return {
    service: `pr-${namespace}`,
    appRole: `my_sp_pr_${namespace}_app`,
    migratorRole: `my_sp_pr_${namespace}_migrator`,
    migrationsSchema: `${namespace}_migrations`,
    lockId: databaseNamespaces.indexOf(namespace) + 1,
  };
}

export class DatabaseError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'DatabaseError';
  }
}

// Never log driver messages, SQL, URLs or nested causes: they may contain credentials.
export function databaseErrorCode(error: unknown): string {
  if (error instanceof DatabaseError) return error.code;
  if (typeof error === 'object' && error !== null && 'code' in error
    && typeof error.code === 'string' && /^[A-Z0-9_]{2,50}$/u.test(error.code)) return error.code;
  return 'DATABASE_OPERATION_FAILED';
}

function invalid(key: string, reason: string): never {
  throw new Error(`数据库配置错误：${key} ${reason}`);
}

const settingsSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_SSL_MODE: z.enum(['disable', 'verify-full']).optional(),
  DATABASE_SSL_CA_FILE: z.string().min(1).optional(),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(20).default(5),
  DATABASE_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(100).max(10_000).default(2000),
  DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(100).max(6000).default(3000),
  DATABASE_QUERY_TIMEOUT_MS: z.coerce.number().int().min(200).max(6500).default(4000),
  DATABASE_IDLE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300_000).default(30_000),
});

export interface DatabaseConfig {
  mode: DatabaseMode;
  connectionString: string;
  databaseName: string;
  ssl: ClientConfig['ssl'];
  enableChannelBinding: boolean;
  poolMax: number;
  connectTimeoutMs: number;
  statementTimeoutMs: number;
  queryTimeoutMs: number;
  idleTimeoutMs: number;
}

export function parseDatabaseConfig(
  input: Readonly<Record<string, string | undefined>>,
  mode: DatabaseMode,
): DatabaseConfig {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) {
    invalid(parsed.error.issues.map((issue) => issue.path.join('.')).join(', '), '取值无效');
  }
  const settings = parsed.data;
  const key = mode === 'runtime' ? 'DATABASE_URL' : 'DATABASE_MIGRATION_URL';
  let url: URL;
  try {
    url = new URL(input[key] ?? '');
  } catch {
    invalid(key, '必须是有效的 PostgreSQL URL');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname
    || !url.username || !url.password || url.hash || !/^\/[^/]+$/u.test(url.pathname)) {
    invalid(key, '必须显式提供 PostgreSQL 主机、数据库和账号密码');
  }
  let databaseName: string;
  try { databaseName = decodeURIComponent(url.pathname.slice(1)); } catch { invalid(key, '数据库名编码无效'); }
  const sslmode = url.searchParams.get('sslmode');
  const binding = url.searchParams.get('channel_binding');
  for (const name of url.searchParams.keys()) {
    if (!['sslmode', 'channel_binding'].includes(name) || url.searchParams.getAll(name).length !== 1) {
      invalid(key, '仅支持单个 sslmode / channel_binding 查询参数');
    }
  }
  if (sslmode !== null && !['disable', 'require', 'verify-full'].includes(sslmode)) invalid(key, 'sslmode 不受支持');
  if (binding !== null && !['disable', 'prefer', 'require'].includes(binding)) invalid(key, 'channel_binding 不受支持');
  if (settings.NODE_ENV === 'production' && !settings.DATABASE_SSL_MODE) invalid('DATABASE_SSL_MODE', '生产环境必须显式设置');
  const urlSslMode = sslmode === null ? undefined : sslmode === 'disable' ? 'disable' : 'verify-full';
  if (urlSslMode && settings.DATABASE_SSL_MODE && urlSslMode !== settings.DATABASE_SSL_MODE) {
    invalid('DATABASE_SSL_MODE', '与 URL 的 sslmode 冲突');
  }
  const sslMode = settings.DATABASE_SSL_MODE ?? urlSslMode ?? 'disable';
  if (binding === 'require' && sslMode === 'disable') invalid(key, 'channel_binding=require 需要 TLS');
  if (settings.DATABASE_SSL_CA_FILE && (sslMode !== 'verify-full' || !isAbsolute(settings.DATABASE_SSL_CA_FILE))) {
    invalid('DATABASE_SSL_CA_FILE', '需要 verify-full 和绝对路径');
  }
  let ca: string | undefined;
  if (settings.DATABASE_SSL_CA_FILE) {
    try { ca = readFileSync(settings.DATABASE_SSL_CA_FILE, 'utf8'); } catch { invalid('DATABASE_SSL_CA_FILE', '无法读取'); }
  }
  // Neon transaction pooling cannot preserve session options or advisory locks.
  if (url.hostname.endsWith('.neon.tech')) url.hostname = url.hostname.replace('-pooler.', '.');
  url.search = '';
  if (mode === 'runtime' && (settings.DATABASE_QUERY_TIMEOUT_MS <= settings.DATABASE_STATEMENT_TIMEOUT_MS
    || settings.DATABASE_CONNECT_TIMEOUT_MS + settings.DATABASE_QUERY_TIMEOUT_MS > 7000)) {
    invalid('DATABASE_*_TIMEOUT_MS', 'query 必须大于 statement，connect + query 必须不超过 7000ms');
  }
  return {
    mode,
    connectionString: url.toString(),
    databaseName,
    ssl: sslMode === 'disable' ? false : { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
    // pg negotiates SCRAM-SHA-256-PLUS where offered; this is not a strict require policy.
    enableChannelBinding: sslMode === 'verify-full' && binding !== 'disable',
    poolMax: settings.DATABASE_POOL_MAX,
    connectTimeoutMs: settings.DATABASE_CONNECT_TIMEOUT_MS,
    statementTimeoutMs: mode === 'runtime' ? settings.DATABASE_STATEMENT_TIMEOUT_MS : 60_000,
    queryTimeoutMs: mode === 'runtime' ? settings.DATABASE_QUERY_TIMEOUT_MS : 65_000,
    idleTimeoutMs: settings.DATABASE_IDLE_TIMEOUT_MS,
  };
}

export function connectionOptions(config: DatabaseConfig, applicationName: string, namespace?: DatabaseNamespace): ClientConfig {
  return {
    connectionString: config.connectionString,
    ssl: config.ssl,
    enableChannelBinding: config.enableChannelBinding,
    connectionTimeoutMillis: config.connectTimeoutMs,
    query_timeout: config.queryTimeoutMs,
    application_name: applicationName,
    options: [
      `-c search_path=pg_catalog${namespace ? `,${namespace}` : ''}`,
      '-c timezone=UTC',
      `-c statement_timeout=${config.statementTimeoutMs}`,
      `-c lock_timeout=${config.mode === 'runtime' ? 1000 : 5000}`,
      '-c idle_in_transaction_session_timeout=10000',
    ].join(' '),
  };
}
