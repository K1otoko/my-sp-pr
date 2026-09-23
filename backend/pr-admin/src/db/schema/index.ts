import { sql } from 'drizzle-orm';
import {
  boolean, check, index, integer, jsonb, pgSchema, text, timestamp, uniqueIndex, uuid,
} from 'drizzle-orm/pg-core';

export const adminSchema = pgSchema('admin');
const time = (name: string) => timestamp(name, { withTimezone: true });

export const adminAuthFlows = adminSchema.table('auth_flows', {
  tokenHash: text('token_hash').primaryKey(),
  stateHash: text('state_hash').notNull(),
  browserBindingHash: text('browser_binding_hash').notNull(),
  nonceCiphertext: text('nonce_ciphertext').notNull(),
  verifierCiphertext: text('verifier_ciphertext').notNull(),
  returnPath: text('return_path').notNull(),
  createdAt: time('created_at').notNull().defaultNow(),
  expiresAt: time('expires_at').notNull(),
  consumedAt: time('consumed_at'),
}, (table) => [
  uniqueIndex('auth_flows_state_unique').on(table.stateHash),
  index('auth_flows_expiry_idx').on(table.expiresAt),
]);

export const adminSessions = adminSchema.table('sessions', {
  tokenHash: text('token_hash').primaryKey(),
  browserBindingHash: text('browser_binding_hash').notNull(),
  ssoSubject: uuid('sso_subject').notNull(),
  username: text('username').notNull(),
  displayName: text('display_name').notNull(),
  role: text('role', { enum: ['super', 'admin'] }).notNull(),
  accessTokenCiphertext: text('access_token_ciphertext').notNull(),
  refreshTokenCiphertext: text('refresh_token_ciphertext').notNull(),
  idTokenCiphertext: text('id_token_ciphertext').notNull(),
  accessTokenExpiresAt: time('access_token_expires_at').notNull(),
  csrfSecret: text('csrf_secret').notNull(),
  createdAt: time('created_at').notNull().defaultNow(),
  lastActivityAt: time('last_activity_at').notNull(),
  idleExpiresAt: time('idle_expires_at').notNull(),
  absoluteExpiresAt: time('absolute_expires_at').notNull(),
  revokedAt: time('revoked_at'),
}, (table) => [
  index('sessions_subject_idx').on(table.ssoSubject),
  index('sessions_expiry_idx').on(table.absoluteExpiresAt),
  check('sessions_role_check', sql`${table.role} in ('super', 'admin')`),
]);

export type ManifestVariable = {
  name: string;
  scope: 'build' | 'runtime' | 'migration';
  required: boolean;
  sensitive: boolean;
  description: string;
};

export type ManifestUnitSnapshot = {
  migration: boolean;
  healthPath: string;
  internalReadyPath?: string;
  variables: ManifestVariable[];
};

export const deployProjects = adminSchema.table('deploy_projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  kind: text('kind', { enum: ['frontend', 'service'] }).notNull(),
  repositoryId: text('repository_id').notNull(),
  repositoryFullName: text('repository_full_name').notNull(),
  unitId: text('unit_id').notNull(),
  preset: text('preset', { enum: ['pnpm-vite-static-v1', 'pnpm-node-service-v1'] }).notNull(),
  packageName: text('package_name').notNull(),
  packagePath: text('package_path').notNull(),
  artifactPath: text('artifact_path').notNull(),
  defaultRef: text('default_ref').notNull(),
  manifest: jsonb('manifest').$type<ManifestUnitSnapshot>().notNull(),
  manifestSha: text('manifest_sha').notNull(),
  manifestVersion: integer('manifest_version').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: time('created_at').notNull().defaultNow(),
  updatedAt: time('updated_at').notNull().defaultNow(),
}, (table) => [
  uniqueIndex('deploy_projects_slug_unique').on(table.slug),
  uniqueIndex('deploy_projects_repository_unit_unique').on(table.repositoryId, table.unitId),
  check('deploy_projects_kind_check', sql`${table.kind} in ('frontend', 'service')`),
  check('deploy_projects_preset_check',
    sql`${table.preset} in ('pnpm-vite-static-v1', 'pnpm-node-service-v1')`),
]);

export const deployEnvironments = adminSchema.table('deploy_environments', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => deployProjects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  githubEnvironmentName: text('github_environment_name').notNull(),
  runnerTarget: text('runner_target').notNull(),
  publicOrigin: text('public_origin'),
  healthUrl: text('health_url').notNull(),
  allowedBranches: jsonb('allowed_branches').$type<string[]>().notNull(),
  allowedTagPattern: text('allowed_tag_pattern'),
  production: boolean('production').notNull().default(false),
  migrationsAllowed: boolean('migrations_allowed').notNull().default(false),
  createdAt: time('created_at').notNull().defaultNow(),
  updatedAt: time('updated_at').notNull().defaultNow(),
}, (table) => [
  uniqueIndex('deploy_environments_project_name_unique').on(table.projectId, table.name),
  index('deploy_environments_project_idx').on(table.projectId),
]);

export const deployments = adminSchema.table('deployments', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => deployProjects.id),
  environmentId: uuid('environment_id').notNull().references(() => deployEnvironments.id),
  actorSubject: uuid('actor_subject').notNull(),
  actorUsername: text('actor_username').notNull(),
  requestedRef: text('requested_ref').notNull(),
  resolvedSha: text('resolved_sha').notNull(),
  commitUrl: text('commit_url').notNull(),
  commitMessage: text('commit_message').notNull(),
  githubDeploymentId: text('github_deployment_id'),
  status: text('status', {
    enum: ['requested', 'queued', 'in_progress', 'succeeded', 'failed', 'error', 'inactive'],
  }).notNull().default('requested'),
  logUrl: text('log_url'),
  migrationRequested: boolean('migration_requested').notNull().default(false),
  migrationPerformed: boolean('migration_performed').notNull().default(false),
  failureStage: text('failure_stage'),
  failureCode: text('failure_code'),
  rollbackOfId: uuid('rollback_of_id'),
  createdAt: time('created_at').notNull().defaultNow(),
  queuedAt: time('queued_at'),
  startedAt: time('started_at'),
  finishedAt: time('finished_at'),
}, (table) => [
  index('deployments_project_created_idx').on(table.projectId, table.createdAt),
  index('deployments_environment_created_idx').on(table.environmentId, table.createdAt),
  uniqueIndex('deployments_github_id_unique').on(table.githubDeploymentId),
  uniqueIndex('deployments_active_environment_unique').on(table.projectId, table.environmentId)
    .where(sql`${table.status} in ('requested', 'queued', 'in_progress')`),
  check('deployments_status_check',
    sql`${table.status} in ('requested', 'queued', 'in_progress', 'succeeded', 'failed', 'error', 'inactive')`),
]);

export const deploymentEvents = adminSchema.table('deployment_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  deploymentId: uuid('deployment_id').notNull().references(() => deployments.id, { onDelete: 'cascade' }),
  deliveryId: text('delivery_id').notNull(),
  githubStatusId: text('github_status_id').notNull(),
  status: text('status', {
    enum: ['requested', 'queued', 'in_progress', 'succeeded', 'failed', 'error', 'inactive'],
  }).notNull(),
  description: text('description'),
  logUrl: text('log_url'),
  receivedAt: time('received_at').notNull().defaultNow(),
}, (table) => [
  uniqueIndex('deployment_events_delivery_unique').on(table.deliveryId),
  index('deployment_events_deployment_idx').on(table.deploymentId, table.receivedAt),
  check('deployment_events_status_check',
    sql`${table.status} in ('requested', 'queued', 'in_progress', 'succeeded', 'failed', 'error', 'inactive')`),
]);

export const adminAuditLogs = adminSchema.table('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorSubject: uuid('actor_subject'),
  actorUsername: text('actor_username'),
  action: text('action').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: text('resource_id'),
  outcome: text('outcome', { enum: ['success', 'failure'] }).notNull(),
  reason: text('reason').notNull(),
  requestId: text('request_id'),
  createdAt: time('created_at').notNull().defaultNow(),
}, (table) => [
  index('audit_logs_actor_idx').on(table.actorSubject, table.createdAt),
  index('audit_logs_created_idx').on(table.createdAt),
  check('audit_logs_outcome_check', sql`${table.outcome} in ('success', 'failure')`),
]);
