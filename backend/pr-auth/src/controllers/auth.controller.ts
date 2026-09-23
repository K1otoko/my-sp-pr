import type { Request, RequestHandler, Response } from 'express';
import type Provider from 'oidc-provider';
import { errors } from 'oidc-provider';
import {
  apiContract, csrfInputSchema, loginInputSchema, oidcPaths,
} from '../api/index.js';
import { browserSecurity } from '../auth/csrf.js';
import { roleAllowed } from '../auth/policy.js';
import { digest } from '../auth/storage-crypto.js';
import type { AuthConfig } from '../config/auth.js';
import { portalClient } from '../portal/client.js';
import type { AuthStore } from '../repositories/auth-store.js';
import { flowStore, type LogoutFlow } from '../repositories/flow-store.js';
import { loginService } from '../services/login.service.js';
import { AppError } from '../utils/app-error.js';

export function authHandlers(config: AuthConfig, store: AuthStore, provider: Provider) {
  const browser = browserSecurity(config);
  const flows = flowStore(store);
  const portal = portalClient(config, store, provider);
  const login = loginService(store);
  async function interaction(request: Request, response: Response) {
    try {
      const details = await provider.interactionDetails(request, response);
      if (details.uid !== request.params.uid || details.exp * 1000 <= store.now().getTime()
        || details.prompt.name !== 'login' || details.result?.login) {
        throw new AppError(400, 'INVALID_INTERACTION', '此登录请求已失效，请重新开始');
      }
      const client = config.clients.find((item) => item.clientId === details.params.client_id);
      if (!client) throw new AppError(400, 'INVALID_INTERACTION', '登录应用未登记');
      return { details, client };
    } catch (error) {
      if (error instanceof errors.OIDCProviderError) {
        throw new AppError(400, 'INTERACTION_EXPIRED', '登录请求已过期，请重新开始');
      }
      throw error;
    }
  }
  const getInteraction: RequestHandler = async (request, response) => {
    response.vary('Accept');
    const { details, client } = await interaction(request, response);
    const binding = browser.binding(request, response);
    if (!request.get('accept')?.includes('application/json')) {
      response.redirect(303, `/login/${details.uid}`);
      return;
    }
    response.json(apiContract.getAuthInteraction.responses[200].content['application/json'].schema.parse({
      success: true,
      data: { clientName: client.name, prompt: 'login', expiresAt: new Date(details.exp * 1000).toISOString(),
        csrfToken: browser.csrf(`interaction:${details.uid}`, binding, details.exp * 1000) },
    }));
  };
  const submitLogin: RequestHandler = async (request, response) => {
    browser.requireOrigin(request);
    if (!request.is('application/json')) throw new AppError(400, 'INVALID_INPUT', '请使用 JSON 提交登录');
    const parsed = loginInputSchema.safeParse(request.body);
    if (!parsed.success) throw new AppError(400, 'INVALID_INPUT', '登录信息格式无效');
    const { details, client } = await interaction(request, response);
    browser.verifyCsrf(parsed.data.csrfToken, `interaction:${details.uid}`, browser.binding(request));
    const user = await login({
      username: parsed.data.username, password: parsed.data.password,
      ip: request.ip ?? request.socket.remoteAddress ?? 'unknown',
      clientId: client.clientId, requestId: String(response.locals.requestId), userAgent: request.get('user-agent'),
    });
    if (!roleAllowed(user, client.allowedRoles)) throw new AppError(403, 'FORBIDDEN', '当前账号无法访问此应用');
    let resumeUrl: string;
    try {
      resumeUrl = await provider.interactionResult(request, response, {
        login: {
          accountId: user.id, remember: true, ts: Math.floor(store.now().getTime() / 1000),
          amr: ['pwd'], acr: `urn:my-sp-pr:auth-version:${user.authVersion}`,
        },
      }, { mergeWithLastSubmission: false });
    } catch (error) {
      if (error instanceof errors.OIDCProviderError) throw new AppError(409, 'INVALID_INTERACTION', '登录请求已处理，请重新开始');
      throw error;
    }
    const target = new URL(resumeUrl, config.origin);
    if (target.origin !== config.origin || target.pathname !== `${oidcPaths.authorization}/${details.uid}`) {
      throw new AppError(503, 'AUTH_UNAVAILABLE', '登录服务返回了无效地址');
    }
    response.json(apiContract.submitAuthLogin.responses[200].content['application/json'].schema.parse({ success: true, data: { resumeUrl } }));
  };
  const getSession: RequestHandler = async (request, response) => {
    response.json(apiContract.getAuthSession.responses[200].content['application/json'].schema.parse({
      success: true, data: await portal.sessionData(request, response),
    }));
  };
  const startLogout: RequestHandler = async (request, response) => {
    const input = csrfInputSchema.safeParse(request.body);
    if (!request.is('application/json') || !input.success) throw new AppError(400, 'INVALID_INPUT', '退出请求无效');
    const resumeUrl = await portal.logoutUrl(request, response, input.data.csrfToken);
    response.json(apiContract.startAuthLogout.responses[200].content['application/json'].schema.parse({ success: true, data: { resumeUrl } }));
  };
  const getLogoutContext: RequestHandler = async (request, response) => {
    const flow = await flows.read<LogoutFlow>('logout', String(request.params.id), browser.binding(request), false);
    const session = await provider.Session.findByUid(flow.data.sessionUid);
    if (!session || session.state?.secret !== flow.data.xsrf
      || !await store.validSession(store.db, digest(flow.data.sessionUid))) {
      throw new AppError(400, 'AUTH_FLOW_INVALID', '退出确认已失效，请重新开始');
    }
    response.json(apiContract.getAuthLogoutContext.responses[200].content['application/json'].schema.parse({
      success: true, data: { xsrf: flow.data.xsrf, clientName: flow.data.clientName, action: oidcPaths.endSessionConfirm },
    }));
  };
  const startPortal: RequestHandler = async (request, response) => {
    response.redirect(302, await portal.start(request, response));
  };
  const completePortal: RequestHandler = async (request, response) => {
    try {
      await portal.complete(request, response);
      response.redirect(303, '/');
    } catch (error) {
      console.error('[pr-auth] 登录回调未完成', { requestId: response.locals.requestId, type: error instanceof Error ? error.name : 'UnknownError' });
      response.redirect(303, '/auth/error?code=AUTH_FLOW_INVALID');
    }
  };
  return { getInteraction, submitLogin, getSession, startLogout, getLogoutContext, startPortal, completePortal };
}
