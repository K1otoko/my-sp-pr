REVOKE ALL ON SCHEMA "admin" FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA "admin" TO "my_sp_pr_admin_app";
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA "admin" GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "my_sp_pr_admin_app";
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA "admin" GRANT USAGE, SELECT ON SEQUENCES TO "my_sp_pr_admin_app";
--> statement-breakpoint
REVOKE ALL ON SCHEMA "admin_migrations" FROM PUBLIC;
