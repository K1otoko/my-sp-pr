DROP INDEX "admin"."deploy_projects_repository_unit_unique";--> statement-breakpoint
ALTER TABLE "admin"."deploy_projects" ALTER COLUMN "default_ref" DROP NOT NULL;