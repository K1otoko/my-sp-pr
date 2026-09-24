import type { RequestHandler } from 'express';
import { apiContract, csrfInputSchema } from '../api/index.js';
import type { AdminAuthService } from '../services/admin-auth.service.js';
import { AppError } from '../utils/app-error.js';

export function adminAuthHandlers(auth: AdminAuthService) {
  const getSession: RequestHandler = async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    const principal = await auth.readSession(request, response);
    // #region debug-point E:session-read
    void fetch('http://127.0.0.1:7777/event', { method: 'POST', body: JSON.stringify({ sessionId: 'admin-login-no-redirect', runId: 'pre-fix', hypothesisId: 'E', location: 'auth.controller.ts:getSession', msg: '[DEBUG] Admin session checked', data: { requestHost: request.headers.host ?? null, sessionCookiePresent: Boolean(auth.browser.getCookie(request, auth.browser.names.session)), bindingCookiePresent: Boolean(auth.browser.getCookie(request, auth.browser.names.binding)), authenticated: Boolean(principal) }, ts: Date.now() }) }).catch(() => undefined);
    // #endregion
    const data = principal ? {
      authenticated: true as const,
      user: principal.user,
      expiresAt: principal.expiresAt.toISOString(),
      idleExpiresAt: principal.idleExpiresAt.toISOString(),
      csrfToken: auth.csrf(principal),
    } : { authenticated: false as const };
    response.json(apiContract.getAdminAuthSession.responses[200].content['application/json'].schema.parse({
      success: true,
      data,
    }));
  };
  const startLogin: RequestHandler = async (request, response) => {
    const parsed = apiContract.startAdminAuthLogin.request.query.safeParse(request.query);
    if (!parsed.success) throw new AppError(400, 'INVALID_INPUT', '登录请求无效');
    response.redirect(302, await auth.start(request, response, parsed.data.returnTo));
  };
  const completeLogin: RequestHandler = async (request, response) => {
    try {
      response.redirect(303, await auth.complete(request, response));
    } catch (error) {
      console.error('[pr-admin] 登录回调未完成', {
        requestId: response.locals.requestId,
        code: error instanceof AppError ? error.code : 'INTERNAL_ERROR',
        type: error instanceof Error ? error.name : 'UnknownError',
      });
      // #region debug-point C:callback-error
      void fetch('http://127.0.0.1:7777/event', { method: 'POST', body: JSON.stringify({ sessionId: 'admin-login-no-redirect', runId: 'pre-fix', hypothesisId: 'C', location: 'auth.controller.ts:completeLogin', msg: '[DEBUG] Admin callback failed', data: { requestHost: request.headers.host ?? null, code: error instanceof AppError ? error.code : 'INTERNAL_ERROR', type: error instanceof Error ? error.name : 'UnknownError' }, ts: Date.now() }) }).catch(() => undefined);
      // #endregion
      const code = error instanceof AppError ? error.code : 'AUTH_FLOW_INVALID';
      response.redirect(303, `/auth/error?code=${encodeURIComponent(code)}`);
    }
  };
  const startLogout: RequestHandler = async (request, response) => {
    const input = csrfInputSchema.safeParse(request.body);
    if (!request.is('application/json') || !input.success) {
      throw new AppError(400, 'INVALID_INPUT', '退出请求无效');
    }
    const resumeUrl = await auth.logout(request, response, input.data.csrfToken);
    response.json(apiContract.startAdminAuthLogout.responses[200].content['application/json'].schema.parse({
      success: true,
      data: { resumeUrl },
    }));
  };
  return { getSession, startLogin, completeLogin, startLogout };
}
