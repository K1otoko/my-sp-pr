import type { RequestHandler } from 'express';
import { apiContract } from '../api/index.js';
import type { DeployCatalogService } from '../services/deploy-catalog.service.js';
import { AppError } from '../utils/app-error.js';

export function deployCatalogHandlers(service: DeployCatalogService) {
  const listRepositories: RequestHandler = async (_request, response) => {
    response.json(apiContract.listDeployRepositories.responses[200].content['application/json'].schema
      .parse({ success: true, data: await service.listRepositories() }));
  };
  const getRepository: RequestHandler = async (request, response) => {
    const input = apiContract.getDeployRepository.request.params.safeParse(request.params);
    if (!input.success) throw new AppError(400, 'INVALID_INPUT', '仓库 ID 无效');
    response.json(apiContract.getDeployRepository.responses[200].content['application/json'].schema
      .parse({ success: true, data: await service.getRepository(input.data.repositoryId) }));
  };
  const listTargets: RequestHandler = async (_request, response) => {
    response.json(apiContract.listDeployTargets.responses[200].content['application/json'].schema
      .parse({ success: true, data: await service.listTargets() }));
  };
  const getTarget: RequestHandler = async (request, response) => {
    const input = apiContract.getDeployTarget.request.params.safeParse(request.params);
    if (!input.success) throw new AppError(400, 'INVALID_INPUT', '目标 ID 无效');
    response.json(apiContract.getDeployTarget.responses[200].content['application/json'].schema
      .parse({ success: true, data: await service.getTarget(input.data.targetId) }));
  };
  const listReleases: RequestHandler = async (request, response) => {
    const input = apiContract.listDeployReleases.request.query.safeParse(request.query);
    if (!input.success) throw new AppError(400, 'INVALID_INPUT', '发布查询条件无效');
    response.json(apiContract.listDeployReleases.responses[200].content['application/json'].schema
      .parse({ success: true, data: await service.listReleases(input.data) }));
  };
  const getRelease: RequestHandler = async (request, response) => {
    const input = apiContract.getDeployRelease.request.params.safeParse(request.params);
    if (!input.success) throw new AppError(400, 'INVALID_INPUT', '批次 ID 无效');
    response.json(apiContract.getDeployRelease.responses[200].content['application/json'].schema
      .parse({ success: true, data: await service.getRelease(input.data.releaseId) }));
  };
  const listAudit: RequestHandler = async (request, response) => {
    const input = apiContract.listDeployAudit.request.query.safeParse(request.query);
    if (!input.success) throw new AppError(400, 'INVALID_INPUT', '审计查询条件无效');
    response.json(apiContract.listDeployAudit.responses[200].content['application/json'].schema
      .parse({ success: true, data: await service.listAudit(input.data) }));
  };
  return { listRepositories, getRepository, listTargets, getTarget, listReleases, getRelease, listAudit };
}
