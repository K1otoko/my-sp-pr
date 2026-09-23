CREATE TABLE "auth"."auth_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event" text NOT NULL,
	"user_id" uuid,
	"client_id" text,
	"request_id" text,
	"outcome" text NOT NULL,
	"reason" text NOT NULL,
	"ip_hash" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_uid_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"auth_version" integer NOT NULL,
	"authenticated_at" timestamp with time zone NOT NULL,
	"last_activity_at" timestamp with time zone NOT NULL,
	"idle_expires_at" timestamp with time zone NOT NULL,
	"absolute_expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "auth"."browser_transactions" (
	"id_hash" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"state_hash" text,
	"browser_binding_hash" text NOT NULL,
	"payload" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "browser_transactions_kind_check" CHECK ("auth"."browser_transactions"."kind" in ('login', 'logout'))
);
--> statement-breakpoint
CREATE TABLE "auth"."login_rate_limits" (
	"bucket_type" text NOT NULL,
	"bucket_hash" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL,
	"blocked_until" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "login_rate_limits_bucket_type_bucket_hash_pk" PRIMARY KEY("bucket_type","bucket_hash"),
	CONSTRAINT "login_rate_limits_type_check" CHECK ("auth"."login_rate_limits"."bucket_type" in ('username', 'ip')),
	CONSTRAINT "login_rate_limits_count_check" CHECK ("auth"."login_rate_limits"."count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "auth"."oidc_artifacts" (
	"model" text NOT NULL,
	"id_hash" text NOT NULL,
	"payload" text NOT NULL,
	"uid_hash" text,
	"grant_id_hash" text,
	"session_uid_hash" text,
	"user_id" uuid,
	"client_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "oidc_artifacts_model_id_hash_pk" PRIMARY KEY("model","id_hash")
);
--> statement-breakpoint
CREATE TABLE "auth"."portal_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"auth_session_id" uuid NOT NULL,
	"csrf_secret" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username_normalized" text NOT NULL,
	"display_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"auth_version" integer DEFAULT 1 NOT NULL,
	"password_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_role_check" CHECK ("auth"."users"."role" in ('admin', 'user')),
	CONSTRAINT "users_status_check" CHECK ("auth"."users"."status" in ('active', 'disabled')),
	CONSTRAINT "users_version_check" CHECK ("auth"."users"."auth_version" > 0),
	CONSTRAINT "users_username_check" CHECK ("auth"."users"."username_normalized" ~ '^[a-z][a-z0-9._-]{2,31}$')
);
--> statement-breakpoint
ALTER TABLE "auth"."auth_audit_logs" ADD CONSTRAINT "auth_audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."oidc_artifacts" ADD CONSTRAINT "oidc_artifacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."portal_sessions" ADD CONSTRAINT "portal_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."portal_sessions" ADD CONSTRAINT "portal_sessions_auth_session_id_auth_sessions_id_fk" FOREIGN KEY ("auth_session_id") REFERENCES "auth"."auth_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_audit_logs_user_idx" ON "auth"."auth_audit_logs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "auth_audit_logs_created_idx" ON "auth"."auth_audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_sessions_uid_unique" ON "auth"."auth_sessions" USING btree ("provider_uid_hash");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth"."auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_expiry_idx" ON "auth"."auth_sessions" USING btree ("absolute_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "browser_transactions_state_unique" ON "auth"."browser_transactions" USING btree ("state_hash");--> statement-breakpoint
CREATE INDEX "browser_transactions_expiry_idx" ON "auth"."browser_transactions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "login_rate_limits_expiry_idx" ON "auth"."login_rate_limits" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "oidc_artifacts_uid_unique" ON "auth"."oidc_artifacts" USING btree ("model","uid_hash");--> statement-breakpoint
CREATE INDEX "oidc_artifacts_grant_idx" ON "auth"."oidc_artifacts" USING btree ("grant_id_hash");--> statement-breakpoint
CREATE INDEX "oidc_artifacts_session_idx" ON "auth"."oidc_artifacts" USING btree ("session_uid_hash");--> statement-breakpoint
CREATE INDEX "oidc_artifacts_user_idx" ON "auth"."oidc_artifacts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oidc_artifacts_expiry_idx" ON "auth"."oidc_artifacts" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "portal_sessions_auth_idx" ON "auth"."portal_sessions" USING btree ("auth_session_id");--> statement-breakpoint
CREATE INDEX "portal_sessions_expiry_idx" ON "auth"."portal_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_unique" ON "auth"."users" USING btree ("username_normalized");