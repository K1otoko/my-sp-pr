-- Additive compatibility migration. Unknown GitHub/Agent facts remain unknown.
INSERT INTO admin.deploy_repositories (
  github_repository_id, full_name, owner, html_url, manifest_version, control_sha, created_at, updated_at
)
SELECT DISTINCT ON (repository_id)
  repository_id, repository_full_name, split_part(repository_full_name, '/', 1),
  'https://github.com/' || repository_full_name, manifest_version, manifest_sha, created_at, updated_at
FROM admin.deploy_projects
ORDER BY repository_id, updated_at DESC, id;
--> statement-breakpoint
UPDATE admin.deploy_projects p
SET repository_record_id = r.id,
    target_role = CASE WHEN p.kind = 'frontend' THEN 'frontend' ELSE 'backend' END
FROM admin.deploy_repositories r
WHERE p.repository_id = r.github_repository_id;
--> statement-breakpoint
INSERT INTO admin.deploy_targets (key, name, role, environment, runner_label, legacy, enabled, agent_status)
SELECT DISTINCT
  'legacy-' || md5(p.target_role || ':' || e.name || ':' || e.runner_target),
  'Legacy ' || e.runner_target || ' (' || p.target_role || '/' || e.name || ')',
  p.target_role, e.name,
  'legacy-' || md5(p.target_role || ':' || e.name || ':' || e.runner_target),
  true, false, 'pending'
FROM admin.deploy_environments e
JOIN admin.deploy_projects p ON p.id = e.project_id;
--> statement-breakpoint
UPDATE admin.deploy_environments e SET target_id = t.id
FROM admin.deploy_projects p, admin.deploy_targets t
WHERE p.id = e.project_id
  AND t.key = 'legacy-' || md5(p.target_role || ':' || e.name || ':' || e.runner_target);
--> statement-breakpoint
-- Existing per-unit active releases must not be merged or rejected by the new batch constraint.
INSERT INTO admin.deploy_release_batches (
  id, repository_id, environment_name, mode, requested_ref, resolved_sha, control_sha,
  actor_subject, actor_username, status, legacy, failure_stage, failure_code,
  created_at, started_at, finished_at
)
SELECT d.id, p.repository_record_id, e.name, 'single', d.requested_ref, d.resolved_sha, p.manifest_sha,
  d.actor_subject, d.actor_username,
  CASE WHEN d.status = 'in_progress' THEN 'running'
       WHEN d.status IN ('succeeded', 'inactive') THEN 'succeeded'
       WHEN d.status IN ('failed', 'error') THEN 'failed'
       ELSE 'queued' END,
  true, d.failure_stage, d.failure_code, d.created_at, d.started_at, d.finished_at
FROM admin.deployments d
JOIN admin.deploy_projects p ON p.id = d.project_id
JOIN admin.deploy_environments e ON e.id = d.environment_id;
--> statement-breakpoint
INSERT INTO admin.deploy_release_items (
  id, batch_id, project_id, environment_id, target_id, desired_sha, status,
  migration_required, migration_gate_status, current_deployment_id, created_at, started_at, finished_at
)
SELECT d.id, d.id, d.project_id, d.environment_id, e.target_id, d.resolved_sha,
  CASE WHEN d.status = 'requested' THEN 'waiting'
       WHEN d.status = 'in_progress' THEN 'deploying'
       WHEN d.status = 'error' THEN 'failed'
       ELSE d.status END,
  d.migration_requested, CASE WHEN d.migration_requested THEN 'legacy_unknown' ELSE 'not_required' END,
  d.id, d.created_at, d.started_at, d.finished_at
FROM admin.deployments d
JOIN admin.deploy_environments e ON e.id = d.environment_id;
--> statement-breakpoint
UPDATE admin.deployments d
SET release_item_id = d.id, target_id = e.target_id, attempt_number = 1,
    action = CASE WHEN d.rollback_of_id IS NOT NULL THEN 'rollback' ELSE 'deploy' END,
    source_deployment_id = (SELECT old.id FROM admin.deployments old WHERE old.id = d.rollback_of_id),
    phase = CASE WHEN d.status IN ('succeeded', 'failed', 'error', 'inactive') THEN 'complete' ELSE 'requested' END
FROM admin.deploy_environments e WHERE e.id = d.environment_id;
--> statement-breakpoint
UPDATE admin.deployment_events event
SET target_id = d.target_id,
    phase = CASE WHEN event.status IN ('succeeded', 'failed', 'error', 'inactive') THEN 'complete' ELSE NULL END
FROM admin.deployments d WHERE event.deployment_id = d.id;
--> statement-breakpoint
-- Explicit DML grants, including installations whose earlier default privileges were customized.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  admin.deploy_repositories, admin.deploy_targets, admin.deploy_target_credentials,
  admin.deploy_target_snapshots, admin.deploy_release_batches, admin.deploy_release_items,
  admin.deploy_migration_gates TO my_sp_pr_admin_app;
