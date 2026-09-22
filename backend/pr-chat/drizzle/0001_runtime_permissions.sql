REVOKE ALL ON SCHEMA "chat" FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA "chat" TO "my_sp_pr_chat_app";
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA "chat" GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "my_sp_pr_chat_app";
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA "chat" GRANT USAGE, SELECT ON SEQUENCES TO "my_sp_pr_chat_app";
--> statement-breakpoint
REVOKE ALL ON SCHEMA "chat_migrations" FROM PUBLIC;
