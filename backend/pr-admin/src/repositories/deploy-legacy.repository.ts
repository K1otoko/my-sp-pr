import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { db } from '../db/index.js';
import {
  deployEnvironments, deployments, deployProjects, deployReleaseBatches, deployReleaseItems, deployTargets,
} from '../db/schema/index.js';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Deployment = typeof deployments.$inferSelect;

// Compatibility records do not authorize target routing or attest migration evidence.
export async function legacyTarget(tx: Transaction, input: {
  role: 'frontend' | 'backend'; environment: string; runnerTarget: string;
}) {
  const key = `legacy-${createHash('md5')
    .update(`${input.role}:${input.environment}:${input.runnerTarget}`).digest('hex')}`;
  const [target] = await tx.insert(deployTargets).values({
    key,
    name: `Legacy ${input.runnerTarget} (${input.role}/${input.environment})`,
    role: input.role,
    environment: input.environment,
    runnerLabel: key,
    legacy: true,
    enabled: false,
    agentStatus: 'pending',
  }).onConflictDoUpdate({ target: deployTargets.key, set: { key } }).returning();
  return target!.id;
}

export function legacyStatus(status: Deployment['status']) {
  const terminal = ['succeeded', 'inactive', 'failed', 'error'].includes(status);
  return {
    batch: status === 'in_progress' ? 'running' as const
      : status === 'succeeded' || status === 'inactive' ? 'succeeded' as const
        : status === 'failed' || status === 'error' ? 'failed' as const : 'queued' as const,
    item: status === 'requested' ? 'waiting' as const : status === 'in_progress' ? 'deploying' as const
      : status === 'error' ? 'failed' as const : status,
    phase: terminal ? 'complete' as const : 'requested' as const,
  };
}

export async function linkLegacyDeployment(tx: Transaction, deployment: Deployment) {
  const [project] = await tx.select().from(deployProjects).where(eq(deployProjects.id, deployment.projectId));
  const [environment] = await tx.select().from(deployEnvironments).where(eq(deployEnvironments.id, deployment.environmentId));
  if (!project?.repositoryRecordId || !environment?.targetId) {
    throw new Error('Deployment catalog migration is required');
  }
  const status = legacyStatus(deployment.status);
  await tx.insert(deployReleaseBatches).values({
    id: deployment.id,
    repositoryId: project.repositoryRecordId,
    environmentName: environment.name,
    mode: 'single',
    requestedRef: deployment.requestedRef,
    resolvedSha: deployment.resolvedSha,
    controlSha: project.manifestSha,
    actorSubject: deployment.actorSubject,
    actorUsername: deployment.actorUsername,
    status: status.batch,
    legacy: true,
    createdAt: deployment.createdAt,
    startedAt: deployment.startedAt,
    finishedAt: deployment.finishedAt,
  });
  await tx.insert(deployReleaseItems).values({
    id: deployment.id,
    batchId: deployment.id,
    projectId: project.id,
    environmentId: environment.id,
    targetId: environment.targetId,
    desiredSha: deployment.resolvedSha,
    status: status.item,
    migrationRequired: deployment.migrationRequested,
    migrationGateStatus: deployment.migrationRequested ? 'legacy_unknown' : 'not_required',
    currentDeploymentId: deployment.id,
    createdAt: deployment.createdAt,
    startedAt: deployment.startedAt,
    finishedAt: deployment.finishedAt,
  });
  await tx.update(deployments).set({
    releaseItemId: deployment.id,
    targetId: environment.targetId,
    action: deployment.rollbackOfId ? 'rollback' : 'deploy',
    sourceDeploymentId: deployment.rollbackOfId,
    phase: status.phase,
  }).where(eq(deployments.id, deployment.id));
}

export async function syncLegacyDeployment(tx: Transaction, deployment: Deployment) {
  if (!deployment.releaseItemId) return;
  const [item] = await tx.select({ batchId: deployReleaseItems.batchId }).from(deployReleaseItems)
    .where(eq(deployReleaseItems.id, deployment.releaseItemId));
  if (!item) return;
  const [batch] = await tx.select({ legacy: deployReleaseBatches.legacy }).from(deployReleaseBatches)
    .where(eq(deployReleaseBatches.id, item.batchId));
  if (!batch?.legacy) return;
  const status = legacyStatus(deployment.status);
  await tx.update(deployReleaseItems).set({
    status: status.item,
    startedAt: deployment.startedAt,
    finishedAt: deployment.finishedAt,
  }).where(eq(deployReleaseItems.id, deployment.releaseItemId));
  await tx.update(deployReleaseBatches).set({
    status: status.batch,
    failureStage: deployment.failureStage,
    failureCode: deployment.failureCode,
    startedAt: deployment.startedAt,
    finishedAt: deployment.finishedAt,
  }).where(eq(deployReleaseBatches.id, item.batchId));
  await tx.update(deployments).set({ phase: status.phase }).where(eq(deployments.id, deployment.id));
}
