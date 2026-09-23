import type { RequestHandler } from 'express';
import type { AdminAuthService, AdminPrincipal } from '../services/admin-auth.service.js';

export function requireAuth(auth: AdminAuthService): RequestHandler {
  return async (request, response, next) => {
    response.locals.adminPrincipal = await auth.requireSession(request, response);
    next();
  };
}

export function adminPrincipal(response: Parameters<RequestHandler>[1]): AdminPrincipal {
  return response.locals.adminPrincipal as AdminPrincipal;
}
