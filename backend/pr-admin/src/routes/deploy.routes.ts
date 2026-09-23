import { Router } from 'express';
import { apiContract, expressPath, fullPath, serviceContract } from '../api/index.js';
import type { deployHandlers } from '../controllers/deploy.controller.js';
import { requireAuth } from '../middlewares/require-auth.js';
import { requireSuper } from '../middlewares/require-super.js';
import type { AdminAuthService } from '../services/admin-auth.service.js';

export function deployRouter(auth: AdminAuthService, handlers: ReturnType<typeof deployHandlers>) {
  const router = Router();
  router.use(requireAuth(auth), requireSuper);
  const entries = [
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
