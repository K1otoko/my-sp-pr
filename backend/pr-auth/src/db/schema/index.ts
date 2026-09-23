import { sql } from 'drizzle-orm';
import { check, index, integer, pgSchema, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const authSchema = pgSchema('auth');
const time = (name: string) => timestamp(name, { withTimezone: true });

export const users = authSchema.table('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  usernameNormalized: text('username_normalized').notNull(),
  displayName: text('display_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['super', 'admin', 'user'] }).notNull().default('user'),
  status: text('status', { enum: ['active', 'disabled'] }).notNull().default('active'),
  authVersion: integer('auth_version').notNull().default(1),
  passwordChangedAt: time('password_changed_at').notNull().defaultNow(),
  lastLoginAt: time('last_login_at'),
  createdAt: time('created_at').notNull().defaultNow(),
  updatedAt: time('updated_at').notNull().defaultNow(),
}, (table) => [
  uniqueIndex('users_username_unique').on(table.usernameNormalized),
  check('users_role_check', sql`${table.role} in ('super', 'admin', 'user')`),
  check('users_status_check', sql`${table.status} in ('active', 'disabled')`),
  check('users_version_check', sql`${table.authVersion} > 0`),
  check('users_username_check', sql`${table.usernameNormalized} ~ '^[a-z][a-z0-9._-]{2,31}$'`),
]);

export const authSessions = authSchema.table('auth_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  providerUidHash: text('provider_uid_hash').notNull(),
  userId: uuid('user_id').notNull().references(() => users.id),
  authVersion: integer('auth_version').notNull(),
  authenticatedAt: time('authenticated_at').notNull(),
  lastActivityAt: time('last_activity_at').notNull(),
  idleExpiresAt: time('idle_expires_at').notNull(),
  absoluteExpiresAt: time('absolute_expires_at').notNull(),
  revokedAt: time('revoked_at'),
}, (table) => [
  uniqueIndex('auth_sessions_uid_unique').on(table.providerUidHash),
  index('auth_sessions_user_idx').on(table.userId),
  index('auth_sessions_expiry_idx').on(table.absoluteExpiresAt),
]);

export const oidcArtifacts = authSchema.table('oidc_artifacts', {
  model: text('model').notNull(),
  idHash: text('id_hash').notNull(),
  payload: text('payload').notNull(),
  uidHash: text('uid_hash'),
  grantIdHash: text('grant_id_hash'),
  sessionUidHash: text('session_uid_hash'),
  userId: uuid('user_id').references(() => users.id),
  clientId: text('client_id'),
  expiresAt: time('expires_at').notNull(),
  consumedAt: time('consumed_at'),
  revokedAt: time('revoked_at'),
}, (table) => [
  primaryKey({ columns: [table.model, table.idHash] }),
  uniqueIndex('oidc_artifacts_uid_unique').on(table.model, table.uidHash),
  index('oidc_artifacts_grant_idx').on(table.grantIdHash),
  index('oidc_artifacts_session_idx').on(table.sessionUidHash),
  index('oidc_artifacts_user_idx').on(table.userId),
  index('oidc_artifacts_expiry_idx').on(table.expiresAt),
]);

export const browserTransactions = authSchema.table('browser_transactions', {
  idHash: text('id_hash').primaryKey(),
  kind: text('kind', { enum: ['login', 'logout'] }).notNull(),
  stateHash: text('state_hash'),
  browserBindingHash: text('browser_binding_hash').notNull(),
  payload: text('payload').notNull(),
  redirectUri: text('redirect_uri').notNull(),
  expiresAt: time('expires_at').notNull(),
  consumedAt: time('consumed_at'),
}, (table) => [
  uniqueIndex('browser_transactions_state_unique').on(table.stateHash),
  index('browser_transactions_expiry_idx').on(table.expiresAt),
  check('browser_transactions_kind_check', sql`${table.kind} in ('login', 'logout')`),
]);

export const portalSessions = authSchema.table('portal_sessions', {
  tokenHash: text('token_hash').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  authSessionId: uuid('auth_session_id').notNull().references(() => authSessions.id),
  csrfSecret: text('csrf_secret').notNull(),
  createdAt: time('created_at').notNull().defaultNow(),
  expiresAt: time('expires_at').notNull(),
}, (table) => [
  index('portal_sessions_auth_idx').on(table.authSessionId),
  index('portal_sessions_expiry_idx').on(table.expiresAt),
]);

export const loginRateLimits = authSchema.table('login_rate_limits', {
  bucketType: text('bucket_type', { enum: ['username', 'ip'] }).notNull(),
  bucketHash: text('bucket_hash').notNull(),
  windowStart: time('window_start').notNull(),
  count: integer('count').notNull(),
  blockedUntil: time('blocked_until'),
  expiresAt: time('expires_at').notNull(),
}, (table) => [
  primaryKey({ columns: [table.bucketType, table.bucketHash] }),
  index('login_rate_limits_expiry_idx').on(table.expiresAt),
  check('login_rate_limits_type_check', sql`${table.bucketType} in ('username', 'ip')`),
  check('login_rate_limits_count_check', sql`${table.count} >= 0`),
]);

export const authAuditLogs = authSchema.table('auth_audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  event: text('event').notNull(),
  userId: uuid('user_id').references(() => users.id),
  clientId: text('client_id'),
  requestId: text('request_id'),
  outcome: text('outcome', { enum: ['success', 'failure'] }).notNull(),
  reason: text('reason').notNull(),
  ipHash: text('ip_hash'),
  userAgent: text('user_agent'),
  createdAt: time('created_at').notNull().defaultNow(),
}, (table) => [
  index('auth_audit_logs_user_idx').on(table.userId, table.createdAt),
  index('auth_audit_logs_created_idx').on(table.createdAt),
]);
