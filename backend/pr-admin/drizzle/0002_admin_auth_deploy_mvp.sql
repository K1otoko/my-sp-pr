CREATE TABLE "admin"."audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_subject" uuid,
	"actor_username" text,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"outcome" text NOT NULL,
	"reason" text NOT NULL,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_logs_outcome_check" CHECK ("admin"."audit_logs"."outcome" in ('success', 'failure'))
);
--> statement-breakpoint
CREATE TABLE "admin"."auth_flows" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"state_hash" text NOT NULL,
	"browser_binding_hash" text NOT NULL,
	"nonce_ciphertext" text NOT NULL,
	"verifier_ciphertext" text NOT NULL,
	"return_path" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "admin"."sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"browser_binding_hash" text NOT NULL,
	"sso_subject" uuid NOT NULL,
	"username" text NOT NULL,
	"display_name" text NOT NULL,
	"role" text NOT NULL,
	"access_token_ciphertext" text NOT NULL,
	"refresh_token_ciphertext" text NOT NULL,
	"id_token_ciphertext" text NOT NULL,
	"access_token_expires_at" timestamp with time zone NOT NULL,
	"csrf_secret" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_activity_at" timestamp with time zone NOT NULL,
	"idle_expires_at" timestamp with time zone NOT NULL,
	"absolute_expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "sessions_role_check" CHECK ("admin"."sessions"."role" in ('super', 'admin'))
);
--> statement-breakpoint
CREATE TABLE "admin"."deploy_environments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"github_environment_name" text NOT NULL,
	"runner_target" text NOT NULL,
	"public_origin" text,
	"health_url" text NOT NULL,
	"allowed_branches" jsonb NOT NULL,
	"allowed_tag_pattern" text,
	"production" boolean DEFAULT false NOT NULL,
	"migrations_allowed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin"."deploy_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"repository_id" text NOT NULL,
	"repository_full_name" text NOT NULL,
	"unit_id" text NOT NULL,
	"preset" text NOT NULL,
	"package_name" text NOT NULL,
	"package_path" text NOT NULL,
	"artifact_path" text NOT NULL,
	"default_ref" text NOT NULL,
	"manifest" jsonb NOT NULL,
	"manifest_sha" text NOT NULL,
	"manifest_version" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deploy_projects_kind_check" CHECK ("admin"."deploy_projects"."kind" in ('frontend', 'service')),
	CONSTRAINT "deploy_projects_preset_check" CHECK ("admin"."deploy_projects"."preset" in ('pnpm-vite-static-v1', 'pnpm-node-service-v1'))
);
--> statement-breakpoint
CREATE TABLE "admin"."deployment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deployment_id" uuid NOT NULL,
	"delivery_id" text NOT NULL,
	"github_status_id" text NOT NULL,
	"status" text NOT NULL,
	"description" text,
	"log_url" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deployment_events_status_check" CHECK ("admin"."deployment_events"."status" in ('requested', 'queued', 'in_progress', 'succeeded', 'failed', 'error', 'inactive'))
);
--> statement-breakpoint
CREATE TABLE "admin"."deployments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"actor_subject" uuid NOT NULL,
	"actor_username" text NOT NULL,
	"requested_ref" text NOT NULL,
	"resolved_sha" text NOT NULL,
	"commit_url" text NOT NULL,
	"commit_message" text NOT NULL,
	"github_deployment_id" text,
	"status" text DEFAULT 'requested' NOT NULL,
	"log_url" text,
	"migration_requested" boolean DEFAULT false NOT NULL,
	"migration_performed" boolean DEFAULT false NOT NULL,
	"failure_stage" text,
	"failure_code" text,
	"rollback_of_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"queued_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "deployments_status_check" CHECK ("admin"."deployments"."status" in ('requested', 'queued', 'in_progress', 'succeeded', 'failed', 'error', 'inactive'))
);
--> statement-breakpoint
ALTER TABLE "admin"."deploy_environments" ADD CONSTRAINT "deploy_environments_project_id_deploy_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "admin"."deploy_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."deployment_events" ADD CONSTRAINT "deployment_events_deployment_id_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "admin"."deployments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."deployments" ADD CONSTRAINT "deployments_project_id_deploy_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "admin"."deploy_projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."deployments" ADD CONSTRAINT "deployments_environment_id_deploy_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "admin"."deploy_environments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "admin"."audit_logs" USING btree ("actor_subject","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "admin"."audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_flows_state_unique" ON "admin"."auth_flows" USING btree ("state_hash");--> statement-breakpoint
CREATE INDEX "auth_flows_expiry_idx" ON "admin"."auth_flows" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "sessions_subject_idx" ON "admin"."sessions" USING btree ("sso_subject");--> statement-breakpoint
CREATE INDEX "sessions_expiry_idx" ON "admin"."sessions" USING btree ("absolute_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "deploy_environments_project_name_unique" ON "admin"."deploy_environments" USING btree ("project_id","name");--> statement-breakpoint
CREATE INDEX "deploy_environments_project_idx" ON "admin"."deploy_environments" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "deploy_projects_slug_unique" ON "admin"."deploy_projects" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "deploy_projects_repository_unit_unique" ON "admin"."deploy_projects" USING btree ("repository_id","unit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "deployment_events_delivery_unique" ON "admin"."deployment_events" USING btree ("delivery_id");--> statement-breakpoint
CREATE INDEX "deployment_events_deployment_idx" ON "admin"."deployment_events" USING btree ("deployment_id","received_at");--> statement-breakpoint
CREATE INDEX "deployments_project_created_idx" ON "admin"."deployments" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "deployments_environment_created_idx" ON "admin"."deployments" USING btree ("environment_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "deployments_github_id_unique" ON "admin"."deployments" USING btree ("github_deployment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "deployments_active_environment_unique" ON "admin"."deployments" USING btree ("project_id","environment_id") WHERE "admin"."deployments"."status" in ('requested', 'queued', 'in_progress');