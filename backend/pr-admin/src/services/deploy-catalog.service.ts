import { z } from 'zod';
import type { AuditFilters, DeployCatalogRepository, ReleaseFilters } from '../repositories/deploy-catalog.repository.js';
import { AppError } from '../utils/app-error.js';

function cursor(value: string | undefined) {
  if (!value) return undefined;
  const parsed = z.tuple([z.iso.datetime(), z.uuid()]).safeParse(value.split('_'));
  if (!parsed.success) throw new AppError(400, 'INVALID_INPUT', '分页游标无效');
  return { time: parsed.data[0], id: parsed.data[1] };
}

async function found<T>(query: Promise<T | undefined>) {
  const value = await query;
  if (!value) throw new AppError(404, 'NOT_FOUND', '部署资源不存在');
  return value;
}

export function deployCatalogService(repository: DeployCatalogRepository) {
  return {
    listRepositories: repository.listRepositories,
    getRepository: (id: string) => found(repository.getRepository(id)),
    listTargets: repository.listTargets,
    getTarget: (id: string) => found(repository.getTarget(id)),
    listReleases: (filters: ReleaseFilters) => repository.listReleases(filters, cursor(filters.cursor)),
    getRelease: (id: string) => found(repository.getRelease(id)),
    listAudit(filters: AuditFilters) {
      if (filters.from && filters.to && Date.parse(filters.from) > Date.parse(filters.to)) {
        throw new AppError(400, 'INVALID_INPUT', '开始时间不能晚于结束时间');
      }
      return repository.listAudit(filters, cursor(filters.cursor));
    },
  };
}

export type DeployCatalogService = ReturnType<typeof deployCatalogService>;
