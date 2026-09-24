import { Router } from 'express';
import { apiContract, expressPath, fullPath, serviceContract } from '../api/index.js';
import type { deployHandlers } from '../controllers/deploy.controller.js';
import type { deployCatalogHandlers } from '../controllers/deploy-catalog.controller.js';
import { requireAuth } from '../middlewares/require-auth.js';
import { requireSuper } from '../middlewares/require-super.js';
import type { AdminAuthService } from '../services/admin-auth.service.js';

export function deployRouter(
  auth: AdminAuthService,
  handlers: ReturnType<typeof deployHandlers>,
  catalog: ReturnType<typeof deployCatalogHandlers>,
) {
  const router = Router();
  router.use(requireAuth(auth), requireSuper);
  const entries = [
    [apiContract.listAvailableDeployRepositories, handlers.availableRepositories],
    [apiContract.importDeployRepository, handlers.importRepository],
    [apiContract.syncDeployRepository, handlers.synchronizeRepository],
    [apiContract.listDeployRepositories, catalog.listRepositories],
    [apiContract.getDeployRepository, catalog.getRepository],
    [apiContract.listDeployTargets, catalog.listTargets],
    [apiContract.getDeployTarget, catalog.getTarget],
    [apiContract.listDeployReleases, catalog.listReleases],
    [apiContract.getDeployRelease, catalog.getRelease],
    [apiContract.listDeployAudit, catalog.listAudit],
    [apiContract.syncDeployProjects, handlers.synchronizeProjects],
    [apiContract.listDeployProjects, handlers.listProjects],
    [apiContract.getDeployProject, handlers.getProject],
    [apiContract.listDeployEnvironments, handlers.listEnvironments],
    [apiContract.createDeployEnvironment, handlers.createEnvironment],
    [apiContract.updateDeployEnvironment, handlers.updateEnvironment],
    [apiContract.getDeployEnvironmentConfiguration, handlers.getConfiguration],
    [apiContract.listDeployRefs, handlers.listRefs],
    [apiContract.listDeployments, handlers.listDeployments],
    [apiContract.getDeployment, handlers.getDeployment],
    [apiContract.createDeployment, handlers.createDeployment],
    [apiContract.rollbackDeployment, handlers.rollbackDeployment],
  ] as const;
  for (const [operation, handler] of entries) {
    router[operation.method](expressPath(fullPath(serviceContract, operation)), handler);
  }
  return router;
}
