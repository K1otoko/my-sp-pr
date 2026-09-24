import { sql } from 'drizzle-orm';
import {
  boolean, check, index, integer, jsonb, pgSchema, text, timestamp, uniqueIndex, uuid,
} from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

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
  health?: { publicPath: string; internalReadyPath?: string | undefined };
  healthPath: string;
  internalReadyPath?: string;
  dependencies?: string[];
  migrationPaths?: string[];
  variables: ManifestVariable[];
};

export const deployRepositories = adminSchema.table('deploy_repositories', {
  id: uuid('id').primaryKey().defaultRandom(),
  githubRepositoryId: text('github_repository_id').notNull(),
  fullName: text('full_name').notNull(),
  owner: text('owner').notNull(),
  installationId: text('installation_id'),
  defaultBranch: text('default_branch'),
  htmlUrl: text('html_url').notNull(),
  manifestPath: text('manifest_path').notNull().default('deploy.manifest.json'),
  manifestVersion: integer('manifest_version'),
  controlSha: text('control_sha'),
  enabled: boolean('enabled').notNull().default(true),
  synchronizedAt: time('synchronized_at'),
  createdAt: time('created_at').notNull().defaultNow(),
  updatedAt: time('updated_at').notNull().defaultNow(),
}, (table) => [
  uniqueIndex('deploy_repositories_github_unique').on(table.githubRepositoryId),
  uniqueIndex('deploy_repositories_name_unique').on(sql`lower(${table.fullName})`),
]);

export const deployTargets = adminSchema.table('deploy_targets', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull(),
  name: text('name').notNull(),
  role: text('role', { enum: ['frontend', 'backend'] }).notNull(),
  environment: text('environment').notNull(),
  runnerLabel: text('runner_label').notNull(),
  expectedOs: text('expected_os').notNull().default('linux'),
  expectedArch: text('expected_arch').notNull().default('x64'),
  deployRoot: text('deploy_root').notNull().default('/srv/my-sp-pr'),
  configRoot: text('config_root').notNull().default('/etc/my-sp-pr'),
  enabled: boolean('enabled').notNull().default(false),
  legacy: boolean('legacy').notNull().default(false),
  agentStatus: text('agent_status', {
    enum: ['pending', 'online', 'degraded', 'offline', 'disabled'],
  }).notNull().default('pending'),
  lastSeenAt: time('last_seen_at'),
  lastSnapshotAt: time('last_snapshot_at'),
  lastErrorCode: text('last_error_code'),
  createdAt: time('created_at').notNull().defaultNow(),
  updatedAt: time('updated_at').notNull().defaultNow(),
}, (table) => [
  uniqueIndex('deploy_targets_key_unique').on(table.key),
  uniqueIndex('deploy_targets_label_unique').on(table.runnerLabel),
  check('deploy_targets_role_check', sql`${table.role} in ('frontend', 'backend')`),
  check('deploy_targets_status_check', sql`${table.agentStatus} in ('pending', 'online', 'degraded', 'offline', 'disabled')`),
]);

export const deployTargetCredentials = adminSchema.table('deploy_target_credentials', {
  id: uuid('id').primaryKey().defaultRandom(),
  targetId: uuid('target_id').notNull().references(() => deployTargets.id),
  tokenHash: text('token_hash').notNull(),
  createdAt: time('created_at').notNull().defaultNow(),
  lastUsedAt: time('last_used_at'),
  revokedAt: time('revoked_at'),
}, (table) => [
  uniqueIndex('deploy_target_credentials_hash_unique').on(table.tokenHash),
  uniqueIndex('deploy_target_credentials_active_unique').on(table.targetId).where(sql`${table.revokedAt} is null`),
]);

export type TargetSnapshot = {
  os: string;
  arch: string;
  nodeVersion: string | null;
  services: { name: string; state: 'running' | 'stopped' | 'unknown'; version: string | null }[];
  disk: { totalBytes: number; availableBytes: number };
  memory: { totalBytes: number; availableBytes: number };
  loadAverage: number[];
  releases: { unitId: string; environment: string; sha: string; current: boolean; previous: boolean }[];
  processes: { name: string; status: string; pid: number | null; restarts: number; memoryBytes: number }[];
};

export const deployTargetSnapshots = adminSchema.table('deploy_target_snapshots', {
  targetId: uuid('target_id').primaryKey().references(() => deployTargets.id),
  agentVersion: text('agent_version').notNull(),
  hostname: text('hostname').notNull(),
  snapshot: jsonb('snapshot').$type<TargetSnapshot>().notNull(),
  sampledAt: time('sampled_at').notNull(),
  receivedAt: time('received_at').notNull().defaultNow(),
});

export const deployProjects = adminSchema.table('deploy_projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  kind: text('kind', { enum: ['frontend', 'service'] }).notNull(),
  repositoryId: text('repository_id').notNull(),
  repositoryFullName: text('repository_full_name').notNull(),
  repositoryRecordId: uuid('repository_record_id').references(() => deployRepositories.id),
  targetRole: text('target_role', { enum: ['frontend', 'backend'] }),
  unitId: text('unit_id').notNull(),
  preset: text('preset', { enum: ['pnpm-vite-static-v1', 'pnpm-node-service-v1'] }).notNull(),
  packageName: text('package_name').notNull(),
  packagePath: text('package_path').notNull(),
  artifactPath: text('artifact_path').notNull(),
  defaultRef: text('default_ref'),
  manifest: jsonb('manifest').$type<ManifestUnitSnapshot>().notNull(),
  manifestSha: text('manifest_sha').notNull(),
  manifestVersion: integer('manifest_version').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: time('created_at').notNull().defaultNow(),
  updatedAt: time('updated_at').notNull().defaultNow(),
}, (table) => [
  uniqueIndex('deploy_projects_slug_unique').on(table.slug),
  uniqueIndex('deploy_projects_record_unit_unique').on(table.repositoryRecordId, table.unitId),
  check('deploy_projects_target_role_check', sql`${table.targetRole} in ('frontend', 'backend')`),
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
  targetId: uuid('target_id').references(() => deployTargets.id),
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

export const deployReleaseBatches = adminSchema.table('deploy_release_batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  repositoryId: uuid('repository_id').notNull().references(() => deployRepositories.id),
  environmentName: text('environment_name').notNull(),
  mode: text('mode', { enum: ['single', 'full', 'rollback'] }).notNull(),
  requestedRef: text('requested_ref').notNull(),
  resolvedSha: text('resolved_sha').notNull(),
  controlSha: text('control_sha').notNull(),
  actorSubject: uuid('actor_subject').notNull(),
  actorUsername: text('actor_username').notNull(),
  status: text('status', {
    enum: ['blocked', 'queued', 'running', 'succeeded', 'partial', 'failed', 'cancelling', 'cancelled'],
  }).notNull(),
  legacy: boolean('legacy').notNull().default(false),
  confirmationVerified: boolean('confirmation_verified').notNull().default(false),
  migrationRiskAcknowledged: boolean('migration_risk_acknowledged').notNull().default(false),
  failureStage: text('failure_stage'),
  failureCode: text('failure_code'),
  createdAt: time('created_at').notNull().defaultNow(),
  startedAt: time('started_at'),
  finishedAt: time('finished_at'),
}, (table) => [
  index('deploy_release_batches_created_idx').on(table.createdAt, table.id),
  // Legacy MVP allowed simultaneous deployments of different units in the same repository.
  uniqueIndex('deploy_release_batches_active_unique').on(table.repositoryId, table.environmentName)
    .where(sql`not ${table.legacy} and ${table.status} in ('blocked', 'queued', 'running', 'cancelling')`),
  check('deploy_release_batches_mode_check', sql`${table.mode} in ('single', 'full', 'rollback')`),
  check('deploy_release_batches_status_check',
    sql`${table.status} in ('blocked', 'queued', 'running', 'succeeded', 'partial', 'failed', 'cancelling', 'cancelled')`),
]);

export const deployReleaseItems = adminSchema.table('deploy_release_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  batchId: uuid('batch_id').notNull().references(() => deployReleaseBatches.id),
  projectId: uuid('project_id').notNull().references(() => deployProjects.id),
  environmentId: uuid('environment_id').notNull().references(() => deployEnvironments.id),
  targetId: uuid('target_id').notNull().references(() => deployTargets.id),
  wave: integer('wave').notNull().default(0),
  dependencies: jsonb('dependencies').$type<string[]>().notNull().default([]),
  desiredSha: text('desired_sha').notNull(),
  status: text('status', {
    enum: ['waiting', 'queued', 'building', 'deploying', 'verifying', 'succeeded', 'failed', 'skipped', 'cancelled', 'inactive'],
  }).notNull(),
  migrationRequired: boolean('migration_required').notNull().default(false),
  migrationGateStatus: text('migration_gate_status', {
    enum: ['not_required', 'required', 'verified', 'waived', 'legacy_unknown'],
  }).notNull().default('not_required'),
  currentDeploymentId: uuid('current_deployment_id').references((): AnyPgColumn => deployments.id),
  createdAt: time('created_at').notNull().defaultNow(),
  startedAt: time('started_at'),
  finishedAt: time('finished_at'),
}, (table) => [
  uniqueIndex('deploy_release_items_unit_target_unique').on(table.batchId, table.projectId, table.targetId),
  check('deploy_release_items_wave_check', sql`${table.wave} >= 0`),
  check('deploy_release_items_status_check',
    sql`${table.status} in ('waiting', 'queued', 'building', 'deploying', 'verifying', 'succeeded', 'failed', 'skipped', 'cancelled', 'inactive')`),
  check('deploy_release_items_gate_check',
    sql`${table.migrationGateStatus} in ('not_required', 'required', 'verified', 'waived', 'legacy_unknown')`),
]);

export const deployments = adminSchema.table('deployments', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => deployProjects.id),
  environmentId: uuid('environment_id').notNull().references(() => deployEnvironments.id),
  releaseItemId: uuid('release_item_id').references((): AnyPgColumn => deployReleaseItems.id),
  targetId: uuid('target_id').references(() => deployTargets.id),
  attemptNumber: integer('attempt_number').notNull().default(1),
  action: text('action', { enum: ['deploy', 'retry', 'rollback'] }).notNull().default('deploy'),
  sourceDeploymentId: uuid('source_deployment_id').references((): AnyPgColumn => deployments.id),
  workflowRunId: text('workflow_run_id'),
  phase: text('phase', {
    enum: ['requested', 'build', 'artifact', 'target_preflight', 'install', 'activate', 'verify', 'complete'],
  }).notNull().default('requested'),
  artifactName: text('artifact_name'),
  artifactDigest: text('artifact_digest'),
  artifactExpiresAt: time('artifact_expires_at'),
  configFingerprint: text('config_fingerprint'),
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
  uniqueIndex('deployments_item_attempt_unique').on(table.releaseItemId, table.attemptNumber),
  check('deployments_attempt_check', sql`${table.attemptNumber} > 0`),
  check('deployments_action_check', sql`${table.action} in ('deploy', 'retry', 'rollback')`),
  check('deployments_phase_check',
    sql`${table.phase} in ('requested', 'build', 'artifact', 'target_preflight', 'install', 'activate', 'verify', 'complete')`),
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
  phase: text('phase'),
  targetId: uuid('target_id').references(() => deployTargets.id),
  workflowRunId: text('workflow_run_id'),
  code: text('code'),
  receivedAt: time('received_at').notNull().defaultNow(),
}, (table) => [
  uniqueIndex('deployment_events_delivery_unique').on(table.deliveryId),
  index('deployment_events_deployment_idx').on(table.deploymentId, table.receivedAt),
  check('deployment_events_status_check',
    sql`${table.status} in ('requested', 'queued', 'in_progress', 'succeeded', 'failed', 'error', 'inactive')`),
]);

export const deployMigrationGates = adminSchema.table('deploy_migration_gates', {
  id: uuid('id').primaryKey().defaultRandom(),
  releaseItemId: uuid('release_item_id').notNull().references(() => deployReleaseItems.id),
  unitId: text('unit_id').notNull(),
  baseSha: text('base_sha'),
  targetSha: text('target_sha').notNull(),
  changedPaths: jsonb('changed_paths').$type<string[]>().notNull(),
  status: text('status', { enum: ['required', 'verified', 'waived'] }).notNull().default('required'),
  workflowRunId: text('workflow_run_id'),
  workflowRunUrl: text('workflow_run_url'),
  verifiedActor: uuid('verified_actor'),
  verifiedAt: time('verified_at'),
  note: text('note'),
}, (table) => [
  uniqueIndex('deploy_migration_gates_item_unique').on(table.releaseItemId),
  check('deploy_migration_gates_status_check', sql`${table.status} in ('required', 'verified', 'waived')`),
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
  metadata: jsonb('metadata').$type<{
    repositoryId?: string;
    targetId?: string;
    releaseId?: string;
    deploymentId?: string;
    code?: string;
  }>(),
  createdAt: time('created_at').notNull().defaultNow(),
}, (table) => [
  index('audit_logs_actor_idx').on(table.actorSubject, table.createdAt),
  index('audit_logs_created_idx').on(table.createdAt),
  check('audit_logs_outcome_check', sql`${table.outcome} in ('success', 'failure')`),
]);
