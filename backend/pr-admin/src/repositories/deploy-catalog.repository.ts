import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { apiContract } from '../api/index.js';
import type { db } from '../db/index.js';
import {
  adminAuditLogs, deployMigrationGates, deployProjects, deployReleaseBatches,
  deployReleaseItems, deployRepositories, deployTargets,
} from '../db/schema/index.js';

export type ReleaseFilters = z.infer<typeof apiContract.listDeployReleases.request.query>;
export type AuditFilters = z.infer<typeof apiContract.listDeployAudit.request.query>;
export type Cursor = { time: string; id: string };
const iso = (value: Date | null) => value?.toISOString() ?? null;
function batchData(row: typeof deployReleaseBatches.$inferSelect) {
  return { ...row, createdAt: row.createdAt.toISOString(), startedAt: iso(row.startedAt), finishedAt: iso(row.finishedAt) };
}

export function deployCatalogRepository(database: typeof db) {
  async function repositories(id?: string) {
    const rows = await database.select({
      repository: deployRepositories,
      count: sql<number>`(select count(*)::int from ${deployProjects}
        where ${deployProjects.repositoryRecordId} = ${deployRepositories.id})`,
    }).from(deployRepositories).where(id ? eq(deployRepositories.id, id) : undefined)
      .orderBy(deployRepositories.fullName);
    return rows.map(({ repository, count }) => ({
      ...repository, projectCount: count, synchronizedAt: iso(repository.synchronizedAt),
      createdAt: repository.createdAt.toISOString(), updatedAt: repository.updatedAt.toISOString(),
    }));
  }

  async function targets(id?: string) {
    const rows = await database.select().from(deployTargets)
      .where(id ? eq(deployTargets.id, id) : undefined).orderBy(deployTargets.key);
    return rows.map((row) => ({
      ...row, lastSeenAt: iso(row.lastSeenAt), lastSnapshotAt: iso(row.lastSnapshotAt),
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
    }));
  }

  return {
    listRepositories: () => repositories(),
    async getRepository(id: string) { return (await repositories(id))[0]; },
    listTargets: () => targets(),
    async getTarget(id: string) { return (await targets(id))[0]; },
    async listReleases(filters: ReleaseFilters, cursor?: Cursor) {
      const table = deployReleaseBatches;
      const rows = await database.select({
        row: table,
        cursorTime: sql<string>`to_char(${table.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      }).from(table).where(and(
        filters.repositoryId ? eq(table.repositoryId, filters.repositoryId) : undefined,
        filters.environmentName ? eq(table.environmentName, filters.environmentName) : undefined,
        filters.status ? eq(table.status, filters.status) : undefined,
        cursor ? sql`(${table.createdAt}, ${table.id}) < (${cursor.time}::timestamptz, ${cursor.id}::uuid)` : undefined,
      )).orderBy(desc(table.createdAt), desc(table.id)).limit(filters.limit + 1);
      const items = rows.slice(0, filters.limit);
      const last = items.at(-1);
      return {
        items: items.map(({ row }) => batchData(row)),
        nextCursor: rows.length > filters.limit && last ? `${last.cursorTime}_${last.row.id}` : null,
      };
    },
    async getRelease(id: string) {
      const [batch] = await database.select().from(deployReleaseBatches).where(eq(deployReleaseBatches.id, id));
      if (!batch) return undefined;
      const rows = await database.select({ item: deployReleaseItems, gate: deployMigrationGates })
        .from(deployReleaseItems)
        .leftJoin(deployMigrationGates, eq(deployMigrationGates.releaseItemId, deployReleaseItems.id))
        .where(eq(deployReleaseItems.batchId, id)).orderBy(deployReleaseItems.wave, deployReleaseItems.id);
      return {
        ...batchData(batch),
        items: rows.map(({ item, gate }) => ({
          ...item, createdAt: item.createdAt.toISOString(), startedAt: iso(item.startedAt), finishedAt: iso(item.finishedAt),
          migrationGate: gate ? { ...gate, verifiedAt: iso(gate.verifiedAt) } : null,
        })),
      };
    },
    async listAudit(filters: AuditFilters, cursor?: Cursor) {
      const table = adminAuditLogs;
      const rows = await database.select({
        row: table,
        cursorTime: sql<string>`to_char(${table.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      }).from(table).where(and(
        filters.actor ? eq(table.actorUsername, filters.actor) : undefined,
        filters.action ? eq(table.action, filters.action) : undefined,
        filters.resourceType ? eq(table.resourceType, filters.resourceType) : undefined,
        filters.resourceId ? eq(table.resourceId, filters.resourceId) : undefined,
        filters.outcome ? eq(table.outcome, filters.outcome) : undefined,
        filters.from ? gte(table.createdAt, new Date(filters.from)) : undefined,
        filters.to ? lte(table.createdAt, new Date(filters.to)) : undefined,
        cursor ? sql`(${table.createdAt}, ${table.id}) < (${cursor.time}::timestamptz, ${cursor.id}::uuid)` : undefined,
      )).orderBy(desc(table.createdAt), desc(table.id)).limit(filters.limit + 1);
      const items = rows.slice(0, filters.limit);
      const last = items.at(-1);
      return {
        items: items.map(({ row }) => ({
          ...row, createdAt: row.createdAt.toISOString(),
          metadata: row.metadata ? {
            repositoryId: row.metadata.repositoryId, targetId: row.metadata.targetId,
            releaseId: row.metadata.releaseId, deploymentId: row.metadata.deploymentId, code: row.metadata.code,
          } : null,
        })),
        nextCursor: rows.length > filters.limit && last ? `${last.cursorTime}_${last.row.id}` : null,
      };
    },
  };
}

export type DeployCatalogRepository = ReturnType<typeof deployCatalogRepository>;
