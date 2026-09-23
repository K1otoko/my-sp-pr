import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { AdminIdentity } from '../auth/oidc-client.js';
import type { DeployManifestUnit } from '../deploy/manifest.js';
import type { db as databaseType } from '../db/index.js';
import {
  adminAuditLogs, deployEnvironments, deploymentEvents, deployments, deployProjects,
} from '../db/schema/index.js';

type AdminDatabase = typeof databaseType;
type Transaction = Parameters<Parameters<AdminDatabase['transaction']>[0]>[0];
type Project = typeof deployProjects.$inferSelect;
type Environment = typeof deployEnvironments.$inferSelect;
type Deployment = typeof deployments.$inferSelect;
type DeploymentStatus = Deployment['status'];

type Actor = Pick<AdminIdentity, 'id' | 'username'>;
type EnvironmentInput = Pick<typeof deployEnvironments.$inferInsert,
  'name' | 'githubEnvironmentName' | 'runnerTarget' | 'publicOrigin' | 'healthUrl'
  | 'allowedBranches' | 'allowedTagPattern' | 'production' | 'migrationsAllowed'>;

const terminalStatuses: DeploymentStatus[] = ['succeeded', 'failed', 'error', 'inactive'];

function deploymentSummary(row: Deployment, project: Project, environment: Environment) {
  return {
    id: row.id,
    projectId: row.projectId,
    environmentId: row.environmentId,
    projectSlug: project.slug,
    environmentName: environment.name,
    requestedRef: row.requestedRef,
    resolvedSha: row.resolvedSha,
    status: row.status,
    actorUsername: row.actorUsername,
    migrationRequested: row.migrationRequested,
    migrationPerformed: row.migrationPerformed,
    githubDeploymentId: row.githubDeploymentId,
    logUrl: row.logUrl,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

function environmentData(row: Environment) {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    githubEnvironmentName: row.githubEnvironmentName,
    runnerTarget: row.runnerTarget,
    publicOrigin: row.publicOrigin,
    healthUrl: row.healthUrl,
    allowedBranches: row.allowedBranches,
    allowedTagPattern: row.allowedTagPattern,
    production: row.production,
    migrationsAllowed: row.migrationsAllowed,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function deployRepository(database: AdminDatabase, now = () => new Date()) {
  async function audit(tx: Transaction, input: {
    actor?: Actor;
    action: string;
    resourceType: string;
    resourceId?: string;
    outcome: 'success' | 'failure';
    reason: string;
    requestId?: string;
  }) {
    await tx.insert(adminAuditLogs).values({
      actorSubject: input.actor?.id,
      actorUsername: input.actor?.username,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      outcome: input.outcome,
      reason: input.reason,
      requestId: input.requestId,
      createdAt: now(),
    });
  }

  async function deploymentById(id: string) {
    const [row] = await database.select({ deployment: deployments, project: deployProjects, environment: deployEnvironments })
      .from(deployments)
      .innerJoin(deployProjects, eq(deployments.projectId, deployProjects.id))
      .innerJoin(deployEnvironments, eq(deployments.environmentId, deployEnvironments.id))
      .where(eq(deployments.id, id));
    return row;
  }

  async function projectData(project: Project) {
    const [environmentCount, latest] = await Promise.all([
      database.select({ count: sql<number>`count(*)::int` }).from(deployEnvironments)
        .where(eq(deployEnvironments.projectId, project.id)),
      database.select({ deployment: deployments, environment: deployEnvironments }).from(deployments)
        .innerJoin(deployEnvironments, eq(deployments.environmentId, deployEnvironments.id))
        .where(eq(deployments.projectId, project.id)).orderBy(desc(deployments.createdAt)).limit(1),
    ]);
    return {
      id: project.id,
      slug: project.slug,
      name: project.name,
      kind: project.kind,
      repositoryFullName: project.repositoryFullName,
      unitId: project.unitId,
      preset: project.preset,
      packageName: project.packageName,
      packagePath: project.packagePath,
      artifactPath: project.artifactPath,
      defaultRef: project.defaultRef,
      migrationSupported: project.manifest.migration,
      enabled: project.enabled,
      manifestSha: project.manifestSha,
      manifestVersion: project.manifestVersion,
      environmentCount: environmentCount[0]?.count ?? 0,
      latestDeployment: latest[0]
        ? deploymentSummary(latest[0].deployment, project, latest[0].environment) : null,
      updatedAt: project.updatedAt.toISOString(),
    };
  }

  return {
    now,
    async synchronizeProjects(input: {
      repositoryId: string;
      repositoryFullName: string;
      manifestSha: string;
      manifestVersion: number;
      units: DeployManifestUnit[];
      actor: Actor;
      requestId: string;
    }) {
      return database.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(731924, 2)`);
        for (const unit of input.units) {
          await tx.insert(deployProjects).values({
            slug: unit.id,
            name: unit.name,
            kind: unit.kind,
            repositoryId: input.repositoryId,
            repositoryFullName: input.repositoryFullName,
            unitId: unit.id,
            preset: unit.preset,
            packageName: unit.packageName,
            packagePath: unit.packagePath,
            artifactPath: unit.artifactPath,
            defaultRef: unit.defaultRef,
            manifest: {
              migration: unit.migration,
              healthPath: unit.healthPath,
              internalReadyPath: unit.internalReadyPath,
              variables: unit.variables,
            },
            manifestSha: input.manifestSha,
            manifestVersion: input.manifestVersion,
            enabled: true,
            updatedAt: now(),
          }).onConflictDoUpdate({
            target: [deployProjects.repositoryId, deployProjects.unitId],
            set: {
              slug: unit.id,
              name: unit.name,
              kind: unit.kind,
              repositoryFullName: input.repositoryFullName,
              preset: unit.preset,
              packageName: unit.packageName,
              packagePath: unit.packagePath,
              artifactPath: unit.artifactPath,
              defaultRef: unit.defaultRef,
              manifest: {
                migration: unit.migration,
                healthPath: unit.healthPath,
                internalReadyPath: unit.internalReadyPath,
                variables: unit.variables,
              },
              manifestSha: input.manifestSha,
              manifestVersion: input.manifestVersion,
              enabled: true,
              updatedAt: now(),
            },
          });
        }
        await tx.update(deployProjects).set({ enabled: false, updatedAt: now() }).where(and(
          eq(deployProjects.repositoryId, input.repositoryId),
          ne(deployProjects.manifestSha, input.manifestSha),
        ));
        await audit(tx, {
          actor: input.actor,
          action: 'deploy.projects.sync',
          resourceType: 'repository',
          resourceId: input.repositoryId,
          outcome: 'success',
          reason: `manifest_v${input.manifestVersion}`,
          requestId: input.requestId,
        });
        return input.units.length;
      });
    },
    async listProjects() {
      const rows = await database.select().from(deployProjects)
        .where(eq(deployProjects.enabled, true)).orderBy(deployProjects.name);
      return Promise.all(rows.map(projectData));
    },
    async getProject(id: string) {
      const [project] = await database.select().from(deployProjects).where(eq(deployProjects.id, id));
      return project ? { row: project, data: await projectData(project) } : undefined;
    },
    async listEnvironments(projectId: string) {
      const rows = await database.select().from(deployEnvironments)
        .where(eq(deployEnvironments.projectId, projectId)).orderBy(deployEnvironments.name);
      return rows.map(environmentData);
    },
    async getEnvironment(id: string) {
      const [environment] = await database.select().from(deployEnvironments).where(eq(deployEnvironments.id, id));
      return environment;
    },
    async createEnvironment(projectId: string, input: EnvironmentInput, actor: Actor, requestId: string) {
      return database.transaction(async (tx) => {
        const [environment] = await tx.insert(deployEnvironments).values({
          projectId,
          ...input,
          updatedAt: now(),
        }).returning();
        await audit(tx, {
          actor, action: 'deploy.environment.create', resourceType: 'environment',
          resourceId: environment!.id, outcome: 'success', reason: environment!.name, requestId,
        });
        return environmentData(environment!);
      });
    },
    async updateEnvironment(id: string, input: Partial<EnvironmentInput>, actor: Actor, requestId: string) {
      return database.transaction(async (tx) => {
        const [environment] = await tx.update(deployEnvironments).set({
          ...input,
          updatedAt: now(),
        }).where(eq(deployEnvironments.id, id)).returning();
        if (!environment) return undefined;
        await audit(tx, {
          actor, action: 'deploy.environment.update', resourceType: 'environment',
          resourceId: id, outcome: 'success', reason: environment.name, requestId,
        });
        return environmentData(environment);
      });
    },
    async listDeployments(filters: {
      projectId?: string;
      environmentId?: string;
      status?: DeploymentStatus;
      limit: number;
    }) {
      const predicates = [
        filters.projectId ? eq(deployments.projectId, filters.projectId) : undefined,
        filters.environmentId ? eq(deployments.environmentId, filters.environmentId) : undefined,
        filters.status ? eq(deployments.status, filters.status) : undefined,
      ].filter((value) => value !== undefined);
      const rows = await database.select({ deployment: deployments, project: deployProjects, environment: deployEnvironments })
        .from(deployments)
        .innerJoin(deployProjects, eq(deployments.projectId, deployProjects.id))
        .innerJoin(deployEnvironments, eq(deployments.environmentId, deployEnvironments.id))
        .where(predicates.length ? and(...predicates) : undefined)
        .orderBy(desc(deployments.createdAt)).limit(filters.limit);
      return rows.map((row) => deploymentSummary(row.deployment, row.project, row.environment));
    },
    async getDeployment(id: string) {
      const row = await deploymentById(id);
      if (!row) return undefined;
      const events = await database.select().from(deploymentEvents)
        .where(eq(deploymentEvents.deploymentId, id)).orderBy(deploymentEvents.receivedAt);
      return {
        row,
        data: {
          ...deploymentSummary(row.deployment, row.project, row.environment),
          commitUrl: row.deployment.commitUrl,
          commitMessage: row.deployment.commitMessage,
          failureStage: row.deployment.failureStage,
          failureCode: row.deployment.failureCode,
          events: events.map((event) => ({
            id: event.id,
            status: event.status,
            description: event.description,
            logUrl: event.logUrl,
            receivedAt: event.receivedAt.toISOString(),
          })),
        },
      };
    },
    async createRequestedDeployment(input: {
      project: Project;
      environment: Environment;
      actor: Actor;
      requestedRef: string;
      resolvedSha: string;
      commitUrl: string;
      commitMessage: string;
      migrationRequested: boolean;
      rollbackOfId?: string;
      requestId: string;
    }) {
      return database.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${input.project.id}:${input.environment.id}`}))`);
        const active = await tx.select({ id: deployments.id }).from(deployments).where(and(
          eq(deployments.projectId, input.project.id),
          eq(deployments.environmentId, input.environment.id),
          inArray(deployments.status, ['requested', 'queued', 'in_progress']),
        )).limit(1);
        if (active.length) return undefined;
        const [deployment] = await tx.insert(deployments).values({
          projectId: input.project.id,
          environmentId: input.environment.id,
          actorSubject: input.actor.id,
          actorUsername: input.actor.username,
          requestedRef: input.requestedRef,
          resolvedSha: input.resolvedSha,
          commitUrl: input.commitUrl,
          commitMessage: input.commitMessage,
          migrationRequested: input.migrationRequested,
          rollbackOfId: input.rollbackOfId,
          createdAt: now(),
        }).returning();
        await audit(tx, {
          actor: input.actor,
          action: input.rollbackOfId ? 'deploy.rollback.request' : 'deploy.request',
          resourceType: 'deployment',
          resourceId: deployment!.id,
          outcome: 'success',
          reason: input.environment.name,
          requestId: input.requestId,
        });
        return deployment!;
      });
    },
    async markQueued(id: string, githubDeploymentId: string) {
      await database.update(deployments).set({
        githubDeploymentId,
        status: 'queued',
        queuedAt: now(),
      }).where(eq(deployments.id, id));
    },
    async markError(id: string, stage: string, code: string) {
      await database.transaction(async (tx) => {
        const [deployment] = await tx.update(deployments).set({
          status: 'error',
          failureStage: stage,
          failureCode: code,
          finishedAt: now(),
        }).where(eq(deployments.id, id)).returning();
        if (deployment) {
          await audit(tx, {
            actor: { id: deployment.actorSubject, username: deployment.actorUsername },
            action: 'deploy.error',
            resourceType: 'deployment',
            resourceId: id,
            outcome: 'failure',
            reason: `${stage}:${code}`,
          });
        }
      });
    },
    async applyEvent(input: {
      deliveryId: string;
      repositoryId: string;
      githubDeploymentId: string;
      githubStatusId: string;
      localDeploymentId: string;
      unitId: string;
      environment: string;
      sha: string;
      status: DeploymentStatus;
      description: string | null;
      logUrl: string | null;
    }) {
      return database.transaction(async (tx) => {
        const [matched] = await tx.select({ deployment: deployments, project: deployProjects, environment: deployEnvironments })
          .from(deployments)
          .innerJoin(deployProjects, eq(deployments.projectId, deployProjects.id))
          .innerJoin(deployEnvironments, eq(deployments.environmentId, deployEnvironments.id))
          .where(and(
            eq(deployments.id, input.localDeploymentId),
            eq(deployments.githubDeploymentId, input.githubDeploymentId),
            eq(deployments.resolvedSha, input.sha),
            eq(deployProjects.repositoryId, input.repositoryId),
            eq(deployProjects.unitId, input.unitId),
            eq(deployEnvironments.githubEnvironmentName, input.environment),
          ));
        if (!matched) return 'mismatch' as const;
        const inserted = await tx.insert(deploymentEvents).values({
          deploymentId: matched.deployment.id,
          deliveryId: input.deliveryId,
          githubStatusId: input.githubStatusId,
          status: input.status,
          description: input.description,
          logUrl: input.logUrl,
          receivedAt: now(),
        }).onConflictDoNothing({ target: deploymentEvents.deliveryId }).returning({ id: deploymentEvents.id });
        if (!inserted.length) return 'duplicate' as const;
        const terminal = terminalStatuses.includes(matched.deployment.status);
        if (!terminal || (matched.deployment.status === 'succeeded' && input.status === 'inactive')) {
          await tx.update(deployments).set({
            status: input.status,
            logUrl: input.logUrl ?? matched.deployment.logUrl,
            migrationPerformed: input.status === 'succeeded' && matched.deployment.migrationRequested
              ? true : matched.deployment.migrationPerformed,
            startedAt: input.status === 'in_progress'
              ? matched.deployment.startedAt ?? now() : matched.deployment.startedAt,
            finishedAt: terminalStatuses.includes(input.status) ? now() : null,
            failureStage: ['failed', 'error'].includes(input.status) ? 'workflow' : null,
            failureCode: ['failed', 'error'].includes(input.status) ? input.status.toUpperCase() : null,
          }).where(eq(deployments.id, matched.deployment.id));
        }
        return 'updated' as const;
      });
    },
  };
}

export type DeployRepository = ReturnType<typeof deployRepository>;
