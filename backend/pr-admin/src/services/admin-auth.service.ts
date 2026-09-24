import type { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import * as oidc from 'openid-client';
import type { AuthUser } from '../api/index.js';
import { browserSecurity } from '../auth/browser-security.js';
import type { env } from '../config/env.js';
import { adminSessions } from '../db/schema/index.js';
import type { AdminOidcClient } from '../auth/oidc-client.js';
import type { AdminSessionRepository } from '../repositories/admin-session.repository.js';
import { AppError } from '../utils/app-error.js';

const accessExpiry = (expiresIn: number | undefined, now: Date) => {
  if (!Number.isFinite(expiresIn) || expiresIn === undefined || expiresIn <= 0) {
    throw new AppError(400, 'AUTH_FLOW_INVALID', '身份服务未返回有效令牌期限');
  }
  return new Date(now.getTime() + expiresIn * 1000);
};

export type AdminPrincipal = {
  user: AuthUser & { role: 'super' | 'admin' };
  sessionTokenHash: string;
  csrfSecret: string;
  browserBinding: string;
  expiresAt: Date;
  idleExpiresAt: Date;
  idToken: string;
};

export function adminAuthService(
  config: typeof env,
  sessions: AdminSessionRepository,
  identityProvider: AdminOidcClient,
) {
  const browser = browserSecurity(config);

  async function readSession(request: Request, response: Response): Promise<AdminPrincipal | undefined> {
    const token = browser.getCookie(request, browser.names.session);
    const binding = browser.getCookie(request, browser.names.binding);
    if (!token || !binding) return undefined;
    const result = await sessions.withSession(token, binding, async (tx, session) => {
      let accessToken = config.authCrypto.open(
        session.accessTokenCiphertext,
        `admin-session:${session.tokenHash}:access`,
      );
      let refreshToken = config.authCrypto.open(
        session.refreshTokenCiphertext,
        `admin-session:${session.tokenHash}:refresh`,
      );
      let idToken = config.authCrypto.open(session.idTokenCiphertext, `admin-session:${session.tokenHash}:id`);
      let expiresAt = session.accessTokenExpiresAt;
      let refreshed = false;
      try {
        if (expiresAt.getTime() <= sessions.now().getTime() + 30_000) {
          const tokens = await identityProvider.refresh(refreshToken);
          accessToken = tokens.access_token;
          refreshToken = tokens.refresh_token ?? refreshToken;
          idToken = tokens.id_token ?? idToken;
          expiresAt = accessExpiry(tokens.expiresIn(), sessions.now());
          refreshed = true;
        }
        const user = await identityProvider.identity(accessToken, session.ssoSubject);
        const lastActivityAt = sessions.now();
        const idleExpiresAt = new Date(Math.min(
          lastActivityAt.getTime() + 24 * 60 * 60 * 1000,
          session.absoluteExpiresAt.getTime(),
        ));
        await tx.update(adminSessions).set({
          username: user.username,
          displayName: user.displayName,
          role: user.role,
          accessTokenCiphertext: config.authCrypto.seal(
            accessToken,
            `admin-session:${session.tokenHash}:access`,
          ),
          refreshTokenCiphertext: config.authCrypto.seal(
            refreshToken,
            `admin-session:${session.tokenHash}:refresh`,
          ),
          idTokenCiphertext: config.authCrypto.seal(idToken, `admin-session:${session.tokenHash}:id`),
          accessTokenExpiresAt: expiresAt,
          lastActivityAt,
          idleExpiresAt,
        }).where(eq(adminSessions.tokenHash, session.tokenHash));
        return {
          kind: 'valid' as const,
          principal: {
            user,
            sessionTokenHash: session.tokenHash,
            csrfSecret: session.csrfSecret,
            browserBinding: binding,
            expiresAt: session.absoluteExpiresAt,
            idleExpiresAt,
            idToken,
          },
        };
      } catch (error) {
        if (identityProvider.isRejected(error)
          || (error instanceof AppError && ['UNAUTHENTICATED', 'FORBIDDEN'].includes(error.code))) {
          await tx.update(adminSessions).set({ revokedAt: sessions.now() })
            .where(eq(adminSessions.tokenHash, session.tokenHash));
          return { kind: 'invalid' as const };
        }
        if (refreshed) {
          await tx.update(adminSessions).set({
            accessTokenCiphertext: config.authCrypto.seal(
              accessToken,
              `admin-session:${session.tokenHash}:access`,
            ),
            refreshTokenCiphertext: config.authCrypto.seal(
              refreshToken,
              `admin-session:${session.tokenHash}:refresh`,
            ),
            idTokenCiphertext: config.authCrypto.seal(idToken, `admin-session:${session.tokenHash}:id`),
            accessTokenExpiresAt: expiresAt,
          }).where(eq(adminSessions.tokenHash, session.tokenHash));
        }
        return { kind: 'unavailable' as const };
      }
    });
    if (!result || result.kind === 'invalid') {
      browser.clearCookie(response, browser.names.session);
      return undefined;
    }
    if (result.kind === 'unavailable') {
      throw new AppError(503, 'AUTH_UNAVAILABLE', '身份服务暂时不可用，请稍后重试');
    }
    return result.principal;
  }
  async function requireSession(request: Request, response: Response) {
    const principal = await readSession(request, response);
    if (!principal) throw new AppError(401, 'UNAUTHENTICATED', '请先登录');
    return principal;
  }
  function verifyCsrf(request: Request, principal: AdminPrincipal, token: string) {
    browser.requireOrigin(request);
    browser.verifyCsrf(
      token,
      `admin-session:${principal.sessionTokenHash}:${principal.csrfSecret}`,
      principal.browserBinding,
    );
  }
  function csrf(principal: AdminPrincipal) {
    return browser.csrf(
      `admin-session:${principal.sessionTokenHash}:${principal.csrfSecret}`,
      principal.browserBinding,
    );
  }

  return {
    browser,
    async start(request: Request, response: Response, returnTo: unknown) {
      const binding = browser.binding(request, response);
      const state = oidc.randomState();
      const nonce = oidc.randomNonce();
      const verifier = oidc.randomPKCECodeVerifier();
      const url = await identityProvider.authorizationUrl({ state, nonce, verifier });
      const flowToken = await sessions.createFlow({
        state, nonce, verifier, binding, returnPath: browser.returnPath(returnTo),
      });
      browser.setCookie(response, browser.names.flow, flowToken, browser.flowSeconds);
      // #region debug-point B:login-start
      void fetch('http://127.0.0.1:7777/event', { method: 'POST', body: JSON.stringify({ sessionId: 'admin-login-no-redirect', runId: 'pre-fix', hypothesisId: 'B', location: 'admin-auth.service.ts:start', msg: '[DEBUG] Admin login flow created', data: { requestHost: request.headers.host ?? null, configuredOrigin: config.adminOrigin, returnPath: browser.returnPath(returnTo), bindingCookiePresent: Boolean(browser.getCookie(request, browser.names.binding)) }, ts: Date.now() }) }).catch(() => undefined);
      // #endregion
      return url.href;
    },
    async complete(request: Request, response: Response) {
      const stateValues = new URL(request.originalUrl, config.adminOrigin).searchParams.getAll('state');
      const flowToken = browser.getCookie(request, browser.names.flow);
      // #region debug-point B:callback-entry
      void fetch('http://127.0.0.1:7777/event', { method: 'POST', body: JSON.stringify({ sessionId: 'admin-login-no-redirect', runId: 'pre-fix', hypothesisId: 'B', location: 'admin-auth.service.ts:complete', msg: '[DEBUG] Admin callback received', data: { requestHost: request.headers.host ?? null, configuredOrigin: config.adminOrigin, stateCount: stateValues.length, flowCookiePresent: Boolean(flowToken), bindingCookiePresent: Boolean(browser.getCookie(request, browser.names.binding)) }, ts: Date.now() }) }).catch(() => undefined);
      // #endregion
      if (stateValues.length !== 1 || !flowToken) {
        throw new AppError(400, 'AUTH_FLOW_INVALID', '登录回调无效');
      }
      const flow = await sessions.consumeFlow({
        token: flowToken,
        state: stateValues[0]!,
        binding: browser.binding(request),
      });
      browser.clearCookie(response, browser.names.flow);
      if (!flow) throw new AppError(400, 'AUTH_FLOW_INVALID', '登录流程已失效，请重新开始');
      try {
        const tokens = await identityProvider.exchange(
          new URL(request.originalUrl, config.adminOrigin),
          { state: stateValues[0]!, nonce: flow.nonce, verifier: flow.verifier },
        );
        const claims = tokens.claims();
        if (!claims?.sub || !tokens.access_token || !tokens.refresh_token || !tokens.id_token) {
          throw new AppError(400, 'AUTH_FLOW_INVALID', '身份响应无效');
        }
        const user = await identityProvider.identity(tokens.access_token, claims.sub);
        const authenticationTime = claims.auth_time ?? claims.iat ?? Math.floor(sessions.now().getTime() / 1000);
        const absoluteExpiresAt = new Date(authenticationTime * 1000 + browser.sessionSeconds * 1000);
        if (absoluteExpiresAt <= sessions.now()) throw new AppError(401, 'UNAUTHENTICATED', '登录状态已失效');
        const sessionToken = await sessions.createSession({
          user,
          binding: browser.binding(request),
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          idToken: tokens.id_token,
          accessTokenExpiresAt: accessExpiry(tokens.expiresIn(), sessions.now()),
          absoluteExpiresAt,
        }, browser.getCookie(request, browser.names.session));
        browser.setCookie(response, browser.names.session, sessionToken, browser.sessionSeconds);
        // #region debug-point D:callback-complete
        void fetch('http://127.0.0.1:7777/event', { method: 'POST', body: JSON.stringify({ sessionId: 'admin-login-no-redirect', runId: 'pre-fix', hypothesisId: 'D', location: 'admin-auth.service.ts:complete', msg: '[DEBUG] Admin callback completed', data: { requestHost: request.headers.host ?? null, returnPath: flow.returnPath, sessionCreated: true }, ts: Date.now() }) }).catch(() => undefined);
        // #endregion
        return flow.returnPath;
      } catch (error) {
        if (error instanceof AppError) throw error;
        if (error instanceof oidc.AuthorizationResponseError || identityProvider.isRejected(error)) {
          throw new AppError(400, 'AUTH_FLOW_INVALID', '登录请求未完成，请重新开始');
        }
        throw new AppError(503, 'AUTH_UNAVAILABLE', '身份服务暂时不可用，请稍后重试');
      }
    },
    readSession,
    requireSession,
    verifyCsrf,
    csrf,
    async logout(request: Request, response: Response, csrfToken: string) {
      const principal = await requireSession(request, response);
      verifyCsrf(request, principal, csrfToken);
      const token = browser.getCookie(request, browser.names.session)!;
      await sessions.revoke(token);
      browser.clearCookie(response, browser.names.session);
      return identityProvider.logoutUrl(principal.idToken).href;
    },
  };
}

export type AdminAuthService = ReturnType<typeof adminAuthService>;
