import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type pg from 'pg';
import { databaseErrorCode, runMigrations, type DatabaseConfig } from '../src/index.js';

const actor = '11111111-1111-4111-8111-111111111111';
const statuses = ['requested', 'queued', 'in_progress', 'succeeded', 'failed', 'error', 'inactive'];
const unitIds = ['pr-chat-web', 'pr-admin-web', 'pr-sso-web', 'gateway', 'pr-chat-api', 'pr-auth-api', 'pr-admin-api'];
const tables = ['deploy_projects', 'deploy_environments', 'deployments', 'deployment_events', 'audit_logs'];

export async function verifyAdminUpgrade(input: {
  root: string; migration: DatabaseConfig; client: pg.Client;
}) {
  const { root, migration, client } = input;
  assert(migration.databaseName.startsWith('my_sp_pr_verify_admin_'));
  const folder = join(root, 'backend/pr-admin/drizzle');
  await mkdir(join(root, '.deploy'), { recursive: true });
  const baseline = await mkdtemp(join(root, '.deploy/admin-migration-'));
  try {
    const journal = JSON.parse(await readFile(join(folder, 'meta/_journal.json'), 'utf8')) as {
      entries: { idx: number; tag: string }[];
    };
    journal.entries = journal.entries.filter((entry) => entry.idx <= 2);
    await mkdir(join(baseline, 'meta'));
    await writeFile(join(baseline, 'meta/_journal.json'), JSON.stringify(journal));
    for (const entry of journal.entries) await copyFile(join(folder, `${entry.tag}.sql`), join(baseline, `${entry.tag}.sql`));
    await runMigrations({ config: migration, namespace: 'admin', migrationsFolder: baseline });
  } finally {
    await rm(baseline, { recursive: true, force: true });
  }
  const projects = unitIds.map(() => randomUUID());
  const environments = unitIds.map(() => randomUUID());
  const deployments = unitIds.map(() => randomUUID());
  for (const [i, unit] of unitIds.entries()) {
    const kind = i < 3 ? 'frontend' : 'service';
    await client.query(`INSERT INTO admin.deploy_projects
      (id, slug, name, kind, repository_id, repository_full_name, unit_id, preset, package_name,
       package_path, artifact_path, default_ref, manifest, manifest_sha, manifest_version)
      VALUES ($1,$2,$2,$3,'legacy-123','legacy/my-sp-pr',$2,$4,$2,$2,'dist','master',$5,$6,1)`,
    [projects[i], unit, kind, i < 3 ? 'pnpm-vite-static-v1' : 'pnpm-node-service-v1',
      JSON.stringify({ migration: i > 3, healthPath: '/api/health', variables: [] }), 'b'.repeat(40)]);
    await client.query(`INSERT INTO admin.deploy_environments
      (id, project_id, name, github_environment_name, runner_target, health_url, allowed_branches, production)
      VALUES ($1,$2,'production',$3,'production','https://legacy.invalid/health','["master"]',true)`,
    [environments[i], projects[i], `${unit}-production`]);
    await client.query(`INSERT INTO admin.deployments
      (id, project_id, environment_id, actor_subject, actor_username, requested_ref, resolved_sha,
       commit_url, commit_message, status, migration_requested, migration_performed,
       rollback_of_id, started_at, finished_at)
      VALUES ($1,$2,$3,$4,'legacy-owner','master',$5,'https://github.com/legacy/commit/a','old commit',
        $6,$7,$8,$9,CASE WHEN $10 THEN now() ELSE NULL END,CASE WHEN $11 THEN now() ELSE NULL END)`,
    [deployments[i], projects[i], environments[i], actor, 'a'.repeat(40), statuses[i],
      i > 3, i === 6, i === 6 ? deployments[3] : i === 5 ? randomUUID() : null, i >= 2, i >= 3]);
    await client.query(`INSERT INTO admin.deployment_events
      (deployment_id, delivery_id, github_status_id, status) VALUES ($1,$2,$2,$3)`,
    [deployments[i], `legacy-delivery-${i}`, statuses[i]]);
    await client.query(`INSERT INTO admin.audit_logs
      (actor_subject, actor_username, action, resource_type, resource_id, outcome, reason)
      VALUES ($1,'legacy-owner','legacy.request','deployment',$2,'success','legacy fixture')`, [actor, deployments[i]]);
  }
  const before = new Map<string, Record<string, unknown>[]>();
  for (const table of tables) before.set(table, (await client.query(`SELECT * FROM admin.${table} ORDER BY id`)).rows);
  await runMigrations({ config: migration, namespace: 'admin', migrationsFolder: folder });
  for (const table of tables) {
    const after = (await client.query(`SELECT * FROM admin.${table} ORDER BY id`)).rows as Record<string, unknown>[];
    const old = before.get(table)!;
    assert.equal(after.length, old.length, `${table} row count`);
    for (const [i, row] of old.entries()) {
      for (const key of Object.keys(row)) assert.deepEqual(after[i]![key], row[key], `${table}.${key} preserved`);
    }
  }
  const repositories = (await client.query('SELECT * FROM admin.deploy_repositories')).rows;
  assert.equal(repositories.length, 1);
  assert.equal(repositories[0].default_branch, null);
  assert.equal(repositories[0].installation_id, null);
  const targets = (await client.query('SELECT * FROM admin.deploy_targets')).rows;
  assert.equal(targets.length, 2);
  assert(targets.every((row) => row.legacy && !row.enabled && row.agent_status === 'pending'));
  const links = (await client.query(`SELECT d.id, d.status, d.phase, d.attempt_number, d.rollback_of_id, d.source_deployment_id,
    b.status AS batch_status, b.legacy, b.confirmation_verified, i.status AS item_status, i.migration_gate_status,
    d.migration_requested, i.current_deployment_id, i.target_id = e.target_id AS target_matches
    FROM admin.deployments d JOIN admin.deploy_release_items i ON i.id = d.release_item_id
    JOIN admin.deploy_release_batches b ON b.id = i.batch_id
    JOIN admin.deploy_environments e ON e.id = d.environment_id`)).rows;
  assert.equal(links.length, 7);
  const expected: Record<string, [string, string]> = {
    requested: ['queued', 'waiting'], queued: ['queued', 'queued'], in_progress: ['running', 'deploying'],
    succeeded: ['succeeded', 'succeeded'], failed: ['failed', 'failed'], error: ['failed', 'failed'],
    inactive: ['succeeded', 'inactive'],
  };
  for (const row of links) {
    assert.deepEqual([row.batch_status, row.item_status], expected[row.status]);
    assert.equal(row.phase, ['requested', 'queued', 'in_progress'].includes(row.status) ? 'requested' : 'complete');
    assert.equal(row.attempt_number, 1);
    assert(row.legacy && !row.confirmation_verified && row.target_matches);
    assert.equal(row.current_deployment_id, row.id);
    assert.equal(row.migration_gate_status, row.migration_requested ? 'legacy_unknown' : 'not_required');
    if (row.status === 'error') assert.equal(row.source_deployment_id, null);
    if (row.status === 'inactive') assert.equal(row.source_deployment_id, row.rollback_of_id);
  }
  assert.equal((await client.query('SELECT count(*)::int AS count FROM admin.deploy_migration_gates')).rows[0].count, 0);
  const batchColumns = `repository_id, environment_name, mode, requested_ref, resolved_sha, control_sha,
    actor_subject, actor_username, status`;
  await client.query(`INSERT INTO admin.deploy_release_batches (${batchColumns})
    SELECT ${batchColumns} FROM admin.deploy_release_batches WHERE id = $1`, [deployments[0]]);
  await assert.rejects(() => client.query(`INSERT INTO admin.deploy_release_batches (${batchColumns})
    SELECT ${batchColumns} FROM admin.deploy_release_batches WHERE id = $1`, [deployments[0]]),
  (error: unknown) => databaseErrorCode(error) === '23505');
  const itemColumns = 'batch_id, project_id, environment_id, target_id, desired_sha, status';
  await assert.rejects(() => client.query(`INSERT INTO admin.deploy_release_items (${itemColumns})
    SELECT ${itemColumns} FROM admin.deploy_release_items LIMIT 1`),
  (error: unknown) => databaseErrorCode(error) === '23505');
  await assert.rejects(() => client.query(`INSERT INTO admin.deployments
    (project_id, environment_id, actor_subject, actor_username, requested_ref, resolved_sha,
      commit_url, commit_message, status, release_item_id)
    SELECT project_id, environment_id, actor_subject, actor_username, requested_ref, resolved_sha,
      commit_url, commit_message, status, release_item_id FROM admin.deployments WHERE status = 'failed'`),
  (error: unknown) => databaseErrorCode(error) === '23505');
  await client.query("INSERT INTO admin.deploy_target_credentials (target_id, token_hash) VALUES ($1,'hash-one')", [targets[0].id]);
  await assert.rejects(() => client.query(
    "INSERT INTO admin.deploy_target_credentials (target_id, token_hash) VALUES ($1,'hash-two')", [targets[0].id]),
  (error: unknown) => databaseErrorCode(error) === '23505');
  await assert.rejects(() => client.query('CREATE TABLE admin.unpermitted (id int)'),
    (error: unknown) => databaseErrorCode(error) === '42501');
  await runMigrations({ config: migration, namespace: 'admin', migrationsFolder: folder });
  console.log('[admin-verify] PASS 0002 upgrade: seven units/all statuses, preserved rows, legacy mappings, constraints and DML-only access.');
}
