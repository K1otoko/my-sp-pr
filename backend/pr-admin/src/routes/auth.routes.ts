import { Router } from 'express';
import { apiContract, expressPath, fullPath, serviceContract } from '../api/index.js';
import type { adminAuthHandlers } from '../controllers/auth.controller.js';

export function authRouter(handlers: ReturnType<typeof adminAuthHandlers>) {
  const router = Router();
  const entries = [
    [apiContract.getAdminAuthSession, handlers.getSession],
    [apiContract.startAdminAuthLogin, handlers.startLogin],
    [apiContract.completeAdminAuthLogin, handlers.completeLogin],
    [apiContract.startAdminAuthLogout, handlers.startLogout],
  ] as const;
  for (const [operation, handler] of entries) {
    router[operation.method](expressPath(fullPath(serviceContract, operation)), handler);
  }
  return router;
}
