REVOKE ALL ON SCHEMA "auth" FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA "auth" TO "my_sp_pr_auth_app";
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA "auth" GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "my_sp_pr_auth_app";
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA "auth" GRANT USAGE, SELECT ON SEQUENCES TO "my_sp_pr_auth_app";
--> statement-breakpoint
REVOKE ALL ON SCHEMA "auth_migrations" FROM PUBLIC;
