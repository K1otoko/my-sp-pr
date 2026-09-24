CREATE TABLE "admin"."deploy_migration_gates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"release_item_id" uuid NOT NULL,
	"unit_id" text NOT NULL,
	"base_sha" text,
	"target_sha" text NOT NULL,
	"changed_paths" jsonb NOT NULL,
	"status" text DEFAULT 'required' NOT NULL,
	"workflow_run_id" text,
	"workflow_run_url" text,
	"verified_actor" uuid,
	"verified_at" timestamp with time zone,
	"note" text,
	CONSTRAINT "deploy_migration_gates_status_check" CHECK ("admin"."deploy_migration_gates"."status" in ('required', 'verified', 'waived'))
);
--> statement-breakpoint
CREATE TABLE "admin"."deploy_release_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repository_id" uuid NOT NULL,
	"environment_name" text NOT NULL,
	"mode" text NOT NULL,
	"requested_ref" text NOT NULL,
	"resolved_sha" text NOT NULL,
	"control_sha" text NOT NULL,
	"actor_subject" uuid NOT NULL,
	"actor_username" text NOT NULL,
	"status" text NOT NULL,
	"legacy" boolean DEFAULT false NOT NULL,
	"confirmation_verified" boolean DEFAULT false NOT NULL,
	"migration_risk_acknowledged" boolean DEFAULT false NOT NULL,
	"failure_stage" text,
	"failure_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "deploy_release_batches_mode_check" CHECK ("admin"."deploy_release_batches"."mode" in ('single', 'full', 'rollback')),
	CONSTRAINT "deploy_release_batches_status_check" CHECK ("admin"."deploy_release_batches"."status" in ('blocked', 'queued', 'running', 'succeeded', 'partial', 'failed', 'cancelling', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "admin"."deploy_release_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"wave" integer DEFAULT 0 NOT NULL,
	"dependencies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"desired_sha" text NOT NULL,
	"status" text NOT NULL,
	"migration_required" boolean DEFAULT false NOT NULL,
	"migration_gate_status" text DEFAULT 'not_required' NOT NULL,
	"current_deployment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "deploy_release_items_wave_check" CHECK ("admin"."deploy_release_items"."wave" >= 0),
	CONSTRAINT "deploy_release_items_status_check" CHECK ("admin"."deploy_release_items"."status" in ('waiting', 'queued', 'building', 'deploying', 'verifying', 'succeeded', 'failed', 'skipped', 'cancelled', 'inactive')),
	CONSTRAINT "deploy_release_items_gate_check" CHECK ("admin"."deploy_release_items"."migration_gate_status" in ('not_required', 'required', 'verified', 'waived', 'legacy_unknown'))
);
--> statement-breakpoint
CREATE TABLE "admin"."deploy_repositories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"github_repository_id" text NOT NULL,
	"full_name" text NOT NULL,
	"owner" text NOT NULL,
	"installation_id" text,
	"default_branch" text,
	"html_url" text NOT NULL,
	"manifest_path" text DEFAULT 'deploy.manifest.json' NOT NULL,
	"manifest_version" integer,
	"control_sha" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"synchronized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin"."deploy_target_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "admin"."deploy_target_snapshots" (
	"target_id" uuid PRIMARY KEY NOT NULL,
	"agent_version" text NOT NULL,
	"hostname" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"sampled_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin"."deploy_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"environment" text NOT NULL,
	"runner_label" text NOT NULL,
	"expected_os" text DEFAULT 'linux' NOT NULL,
	"expected_arch" text DEFAULT 'x64' NOT NULL,
	"deploy_root" text DEFAULT '/srv/my-sp-pr' NOT NULL,
	"config_root" text DEFAULT '/etc/my-sp-pr' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"legacy" boolean DEFAULT false NOT NULL,
	"agent_status" text DEFAULT 'pending' NOT NULL,
	"last_seen_at" timestamp with time zone,
	"last_snapshot_at" timestamp with time zone,
	"last_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deploy_targets_role_check" CHECK ("admin"."deploy_targets"."role" in ('frontend', 'backend')),
	CONSTRAINT "deploy_targets_status_check" CHECK ("admin"."deploy_targets"."agent_status" in ('pending', 'online', 'degraded', 'offline', 'disabled'))
);
--> statement-breakpoint
ALTER TABLE "admin"."audit_logs" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "admin"."deploy_environments" ADD COLUMN "target_id" uuid;--> statement-breakpoint
ALTER TABLE "admin"."deploy_projects" ADD COLUMN "repository_record_id" uuid;--> statement-breakpoint
ALTER TABLE "admin"."deploy_projects" ADD COLUMN "target_role" text;--> statement-breakpoint
ALTER TABLE "admin"."deployment_events" ADD COLUMN "phase" text;--> statement-breakpoint
ALTER TABLE "admin"."deployment_events" ADD COLUMN "target_id" uuid;--> statement-breakpoint
ALTER TABLE "admin"."deployment_events" ADD COLUMN "workflow_run_id" text;--> statement-breakpoint
ALTER TABLE "admin"."deployment_events" ADD COLUMN "code" text;--> statement-breakpoint
ALTER TABLE "admin"."deployments" ADD COLUMN "release_item_id" uuid;--> statement-breakpoint
ALTER TABLE "admin"."deployments" ADD COLUMN "target_id" uuid;--> statement-breakpoint
ALTER TABLE "admin"."deployments" ADD COLUMN "attempt_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."deployments" ADD COLUMN "action" text DEFAULT 'deploy' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."deployments" ADD COLUMN "source_deployment_id" uuid;--> statement-breakpoint
ALTER TABLE "admin"."deployments" ADD COLUMN "workflow_run_id" text;--> statement-breakpoint
ALTER TABLE "admin"."deployments" ADD COLUMN "phase" text DEFAULT 'requested' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."deployments" ADD COLUMN "artifact_name" text;--> statement-breakpoint
ALTER TABLE "admin"."deployments" ADD COLUMN "artifact_digest" text;--> statement-breakpoint
ALTER TABLE "admin"."deployments" ADD COLUMN "artifact_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admin"."deployments" ADD COLUMN "config_fingerprint" text;--> statement-breakpoint
ALTER TABLE "admin"."deploy_migration_gates" ADD CONSTRAINT "deploy_migration_gates_release_item_id_deploy_release_items_id_fk" FOREIGN KEY ("release_item_id") REFERENCES "admin"."deploy_release_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."deploy_release_batches" ADD CONSTRAINT "deploy_release_batches_repository_id_deploy_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "admin"."deploy_repositories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."deploy_release_items" ADD CONSTRAINT "deploy_release_items_batch_id_deploy_release_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "admin"."deploy_release_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."deploy_release_items" ADD CONSTRAINT "deploy_release_items_project_id_deploy_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "admin"."deploy_projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."deploy_release_items" ADD CONSTRAINT "deploy_release_items_environment_id_deploy_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "admin"."deploy_environments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."deploy_release_items" ADD CONSTRAINT "deploy_release_items_target_id_deploy_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "admin"."deploy_targets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."deploy_release_items" ADD CONSTRAINT "deploy_release_items_current_deployment_id_deployments_id_fk" FOREIGN KEY ("current_deployment_id") REFERENCES "admin"."deployments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."deploy_target_credentials" ADD CONSTRAINT "deploy_target_credentials_target_id_deploy_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "admin"."deploy_targets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."deploy_target_snapshots" ADD CONSTRAINT "deploy_target_snapshots_target_id_deploy_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "admin"."deploy_targets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deploy_migration_gates_item_unique" ON "admin"."deploy_migration_gates" USING btree ("release_item_id");--> statement-breakpoint
CREATE INDEX "deploy_release_batches_created_idx" ON "admin"."deploy_release_batches" USING btree ("created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "deploy_release_batches_active_unique" ON "admin"."deploy_release_batches" USING btree ("repository_id","environment_name") WHERE not "admin"."deploy_release_batches"."legacy" and "admin"."deploy_release_batches"."status" in ('blocked', 'queued', 'running', 'cancelling');--> statement-breakpoint
CREATE UNIQUE INDEX "deploy_release_items_unit_target_unique" ON "admin"."deploy_release_items" USING btree ("batch_id","project_id","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "deploy_repositories_github_unique" ON "admin"."deploy_repositories" USING btree ("github_repository_id");--> statement-breakpoint
CREATE UNIQUE INDEX "deploy_repositories_name_unique" ON "admin"."deploy_repositories" USING btree (lower("full_name"));--> statement-breakpoint
CREATE UNIQUE INDEX "deploy_target_credentials_hash_unique" ON "admin"."deploy_target_credentials" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "deploy_target_credentials_active_unique" ON "admin"."deploy_target_credentials" USING btree ("target_id") WHERE "admin"."deploy_target_credentials"."revoked_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "deploy_targets_key_unique" ON "admin"."deploy_targets" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "deploy_targets_label_unique" ON "admin"."deploy_targets" USING btree ("runner_label");--> statement-breakpoint
ALTER TABLE "admin"."deploy_environments" ADD CONSTRAINT "deploy_environments_target_id_deploy_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "admin"."deploy_targets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."deploy_projects" ADD CONSTRAINT "deploy_projects_repository_record_id_deploy_repositories_id_fk" FOREIGN KEY ("repository_record_id") REFERENCES "admin"."deploy_repositories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."deployment_events" ADD CONSTRAINT "deployment_events_target_id_deploy_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "admin"."deploy_targets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."deployments" ADD CONSTRAINT "deployments_release_item_id_deploy_release_items_id_fk" FOREIGN KEY ("release_item_id") REFERENCES "admin"."deploy_release_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."deployments" ADD CONSTRAINT "deployments_target_id_deploy_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "admin"."deploy_targets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."deployments" ADD CONSTRAINT "deployments_source_deployment_id_deployments_id_fk" FOREIGN KEY ("source_deployment_id") REFERENCES "admin"."deployments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deploy_projects_record_unit_unique" ON "admin"."deploy_projects" USING btree ("repository_record_id","unit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "deployments_item_attempt_unique" ON "admin"."deployments" USING btree ("release_item_id","attempt_number");--> statement-breakpoint
ALTER TABLE "admin"."deploy_projects" ADD CONSTRAINT "deploy_projects_target_role_check" CHECK ("admin"."deploy_projects"."target_role" in ('frontend', 'backend'));--> statement-breakpoint
ALTER TABLE "admin"."deployments" ADD CONSTRAINT "deployments_attempt_check" CHECK ("admin"."deployments"."attempt_number" > 0);--> statement-breakpoint
ALTER TABLE "admin"."deployments" ADD CONSTRAINT "deployments_action_check" CHECK ("admin"."deployments"."action" in ('deploy', 'retry', 'rollback'));--> statement-breakpoint
ALTER TABLE "admin"."deployments" ADD CONSTRAINT "deployments_phase_check" CHECK ("admin"."deployments"."phase" in ('requested', 'build', 'artifact', 'target_preflight', 'install', 'activate', 'verify', 'complete'));