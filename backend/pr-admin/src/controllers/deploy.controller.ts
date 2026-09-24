import type { RequestHandler } from 'express';
import { apiContract } from '../api/index.js';
import type { AdminAuthService } from '../services/admin-auth.service.js';
import type { DeploymentService } from '../services/deployment.service.js';
import { AppError } from '../utils/app-error.js';
import { adminPrincipal } from '../middlewares/require-auth.js';

function success<T extends { parse: (value: unknown) => unknown }>(schema: T, data: unknown) {
  return schema.parse({ success: true, data });
}

export function deployHandlers(auth: AdminAuthService, deployments: DeploymentService) {
  const availableRepositories: RequestHandler = async (_request, response) => {
    response.json(success(
      apiContract.listAvailableDeployRepositories.responses[200].content['application/json'].schema,
      await deployments.availableRepositories(),
    ));
  };
  const importRepository: RequestHandler = async (request, response) => {
    const input = apiContract.importDeployRepository.request.body.content['application/json'].schema.safeParse(request.body);
    if (!request.is('application/json') || !input.success) throw new AppError(400, 'INVALID_INPUT', '导入请求无效');
    const principal = adminPrincipal(response);
    auth.verifyCsrf(request, principal, input.data.csrfToken);
    response.json(success(
      apiContract.importDeployRepository.responses[200].content['application/json'].schema,
      await deployments.importRepository(input.data, principal.user, String(response.locals.requestId)),
    ));
  };
  const synchronizeRepository: RequestHandler = async (request, response) => {
    const params = apiContract.syncDeployRepository.request.params.safeParse(request.params);
    const input = apiContract.syncDeployRepository.request.body.content['application/json'].schema.safeParse(request.body);
    if (!params.success || !request.is('application/json') || !input.success) {
      throw new AppError(400, 'INVALID_INPUT', '仓库同步请求无效');
    }
    const principal = adminPrincipal(response);
    auth.verifyCsrf(request, principal, input.data.csrfToken);
    response.json(success(
      apiContract.syncDeployRepository.responses[200].content['application/json'].schema,
      await deployments.synchronizeRepository(params.data.repositoryId, principal.user, String(response.locals.requestId)),
    ));
  };
  const listProjects: RequestHandler = async (_request, response) => {
    response.json(success(
      apiContract.listDeployProjects.responses[200].content['application/json'].schema,
      await deployments.listProjects(),
    ));
  };
  const getProject: RequestHandler = async (request, response) => {
    const params = apiContract.getDeployProject.request.params.safeParse(request.params);
    if (!params.success) throw new AppError(400, 'INVALID_INPUT', '项目 ID 无效');
    response.json(success(
      apiContract.getDeployProject.responses[200].content['application/json'].schema,
      await deployments.getProject(params.data.projectId),
    ));
  };
  const synchronizeProjects: RequestHandler = async (request, response) => {
    const input = apiContract.syncDeployProjects.request.body.content['application/json'].schema.safeParse(request.body);
    if (!request.is('application/json') || !input.success) throw new AppError(400, 'INVALID_INPUT', '同步请求无效');
    const actor = adminPrincipal(response).user;
    auth.verifyCsrf(request, adminPrincipal(response), input.data.csrfToken);
    response.json(success(
      apiContract.syncDeployProjects.responses[200].content['application/json'].schema,
      await deployments.synchronize(actor, String(response.locals.requestId)),
    ));
  };
  const listEnvironments: RequestHandler = async (request, response) => {
    const params = apiContract.listDeployEnvironments.request.params.safeParse(request.params);
    if (!params.success) throw new AppError(400, 'INVALID_INPUT', '项目 ID 无效');
    response.json(success(
      apiContract.listDeployEnvironments.responses[200].content['application/json'].schema,
      await deployments.listEnvironments(params.data.projectId),
    ));
  };
  const createEnvironment: RequestHandler = async (request, response) => {
    const params = apiContract.createDeployEnvironment.request.params.safeParse(request.params);
    const input = apiContract.createDeployEnvironment.request.body.content['application/json'].schema.safeParse(request.body);
    if (!params.success || !request.is('application/json') || !input.success) {
      throw new AppError(400, 'INVALID_INPUT', '发布环境信息无效');
    }
    const principal = adminPrincipal(response);
    auth.verifyCsrf(request, principal, input.data.csrfToken);
    const values = {
      name: input.data.name,
      githubEnvironmentName: input.data.githubEnvironmentName,
      runnerTarget: input.data.runnerTarget,
      publicOrigin: input.data.publicOrigin,
      healthUrl: input.data.healthUrl,
      allowedBranches: input.data.allowedBranches,
      allowedTagPattern: input.data.allowedTagPattern,
      production: input.data.production,
      migrationsAllowed: input.data.migrationsAllowed,
    };
    response.json(success(
      apiContract.createDeployEnvironment.responses[200].content['application/json'].schema,
      await deployments.createEnvironment(params.data.projectId, values, principal.user, String(response.locals.requestId)),
    ));
  };
  const updateEnvironment: RequestHandler = async (request, response) => {
    const params = apiContract.updateDeployEnvironment.request.params.safeParse(request.params);
    const input = apiContract.updateDeployEnvironment.request.body.content['application/json'].schema.safeParse(request.body);
    if (!params.success || !request.is('application/json') || !input.success) {
      throw new AppError(400, 'INVALID_INPUT', '发布环境信息无效');
    }
    const principal = adminPrincipal(response);
    auth.verifyCsrf(request, principal, input.data.csrfToken);
    const values = {
      name: input.data.name,
      githubEnvironmentName: input.data.githubEnvironmentName,
      runnerTarget: input.data.runnerTarget,
      publicOrigin: input.data.publicOrigin,
      healthUrl: input.data.healthUrl,
      allowedBranches: input.data.allowedBranches,
      allowedTagPattern: input.data.allowedTagPattern,
      production: input.data.production,
      migrationsAllowed: input.data.migrationsAllowed,
    };
    response.json(success(
      apiContract.updateDeployEnvironment.responses[200].content['application/json'].schema,
      await deployments.updateEnvironment(params.data.environmentId, values, principal.user, String(response.locals.requestId)),
    ));
  };
  const getConfiguration: RequestHandler = async (request, response) => {
    const params = apiContract.getDeployEnvironmentConfiguration.request.params.safeParse(request.params);
    if (!params.success) throw new AppError(400, 'INVALID_INPUT', '环境 ID 无效');
    response.json(success(
      apiContract.getDeployEnvironmentConfiguration.responses[200].content['application/json'].schema,
      await deployments.configuration(params.data.environmentId),
    ));
  };
  const listRefs: RequestHandler = async (request, response) => {
    const params = apiContract.listDeployRefs.request.params.safeParse(request.params);
    if (!params.success) throw new AppError(400, 'INVALID_INPUT', '项目 ID 无效');
    response.json(success(
      apiContract.listDeployRefs.responses[200].content['application/json'].schema,
      await deployments.refs(params.data.projectId),
    ));
  };
  const listDeployments: RequestHandler = async (request, response) => {
    const query = apiContract.listDeployments.request.query.safeParse(request.query);
    if (!query.success) throw new AppError(400, 'INVALID_INPUT', '发布记录筛选条件无效');
    response.json(success(
      apiContract.listDeployments.responses[200].content['application/json'].schema,
      await deployments.listDeployments(query.data),
    ));
  };
  const getDeployment: RequestHandler = async (request, response) => {
    const params = apiContract.getDeployment.request.params.safeParse(request.params);
    if (!params.success) throw new AppError(400, 'INVALID_INPUT', '发布记录 ID 无效');
    response.json(success(
      apiContract.getDeployment.responses[200].content['application/json'].schema,
      await deployments.getDeployment(params.data.deploymentId),
    ));
  };
  const createDeployment: RequestHandler = async (request, response) => {
    const params = apiContract.createDeployment.request.params.safeParse(request.params);
    const input = apiContract.createDeployment.request.body.content['application/json'].schema.safeParse(request.body);
    if (!params.success || !request.is('application/json') || !input.success) {
      throw new AppError(400, 'INVALID_INPUT', '发布请求无效');
    }
    const principal = adminPrincipal(response);
    auth.verifyCsrf(request, principal, input.data.csrfToken);
    response.json(success(
      apiContract.createDeployment.responses[200].content['application/json'].schema,
      await deployments.createDeployment({
        projectId: params.data.projectId,
        environmentId: input.data.environmentId,
        ref: input.data.ref,
        runMigration: input.data.runMigration,
        confirmation: input.data.confirmation,
        actor: principal.user,
        requestId: String(response.locals.requestId),
      }),
    ));
  };
  const rollbackDeployment: RequestHandler = async (request, response) => {
    const params = apiContract.rollbackDeployment.request.params.safeParse(request.params);
    const input = apiContract.rollbackDeployment.request.body.content['application/json'].schema.safeParse(request.body);
    if (!params.success || !request.is('application/json') || !input.success) {
      throw new AppError(400, 'INVALID_INPUT', '回滚请求无效');
    }
    const principal = adminPrincipal(response);
    auth.verifyCsrf(request, principal, input.data.csrfToken);
    response.json(success(
      apiContract.rollbackDeployment.responses[200].content['application/json'].schema,
      await deployments.rollback({
        deploymentId: params.data.deploymentId,
        confirmation: input.data.confirmation,
        actor: principal.user,
        requestId: String(response.locals.requestId),
      }),
    ));
  };
  return {
    availableRepositories,
    importRepository,
    synchronizeRepository,
    listProjects,
    getProject,
    synchronizeProjects,
    listEnvironments,
    createEnvironment,
    updateEnvironment,
    getConfiguration,
    listRefs,
    listDeployments,
    getDeployment,
    createDeployment,
    rollbackDeployment,
  };
}
