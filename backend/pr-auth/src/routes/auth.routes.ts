import { Router } from 'express';
import { apiContract, expressPath, fullPath, serviceContract } from '../api/index.js';
import type { authHandlers } from '../controllers/auth.controller.js';

export function authRouter(handlers: ReturnType<typeof authHandlers>) {
  const router = Router();
  const entries = [
    [apiContract.getAuthInteraction, handlers.getInteraction],
    [apiContract.submitAuthLogin, handlers.submitLogin],
    [apiContract.getAuthSession, handlers.getSession],
    [apiContract.startAuthLogout, handlers.startLogout],
    [apiContract.getAuthLogoutContext, handlers.getLogoutContext],
    [apiContract.startAuthPortal, handlers.startPortal],
    [apiContract.completeAuthPortal, handlers.completePortal],
  ] as const;
  for (const [operation, handler] of entries) router[operation.method](expressPath(fullPath(serviceContract, operation)), handler);
  return router;
}
