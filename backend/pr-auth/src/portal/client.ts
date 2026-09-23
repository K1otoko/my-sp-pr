import * as oidc from 'openid-client';
import type Provider from 'oidc-provider';
import type { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { oidcPaths, type AuthUser } from '../api/index.js';
import { publicUser, SESSION_SECONDS } from '../auth/policy.js';
import { digest, randomToken } from '../auth/storage-crypto.js';
import { browserSecurity } from '../auth/csrf.js';
import type { AuthConfig } from '../config/auth.js';
import { portalSessions } from '../db/schema/index.js';
import type { AuthStore } from '../repositories/auth-store.js';
import { flowStore, type LoginFlow } from '../repositories/flow-store.js';
import { AppError } from '../utils/app-error.js';

const protocolRequestTimeoutMs = 7_500;

export function portalClient(config: AuthConfig, store: AuthStore, provider: Provider) {
  const browser = browserSecurity(config);
  const flows = flowStore(store);
  const callbackUri = `${config.origin}/api/auth/portal/callback`;
  function client(signal?: AbortSignal) {
    const clientConfig = new oidc.Configuration({
      issuer: config.origin,
      authorization_endpoint: `${config.origin}${oidcPaths.authorization}`,
      token_endpoint: `${config.origin}${oidcPaths.token}`,
      userinfo_endpoint: `${config.origin}${oidcPaths.userinfo}`,
      jwks_uri: `${config.origin}${oidcPaths.jwks}`,
      end_session_endpoint: `${config.origin}${oidcPaths.endSession}`,
      authorization_response_iss_parameter_supported: true,
      id_token_signing_alg_values_supported: ['RS256'],
    }, 'pr-sso-portal', { client_secret: config.portalSecret, id_token_signed_response_alg: 'RS256' },
    oidc.ClientSecretBasic(config.portalSecret));
    if (!config.secure) oidc.allowInsecureRequests(clientConfig);
    oidc.enableNonRepudiationChecks(clientConfig);
    clientConfig.timeout = protocolRequestTimeoutMs / 1000;
    clientConfig[oidc.customFetch] = (url, options) => {
      const target = new URL(url);
      if (target.origin !== config.origin || ![oidcPaths.token, oidcPaths.userinfo, oidcPaths.jwks].some((path) => target.pathname === path)) {
        throw new AppError(503, 'AUTH_UNAVAILABLE', '身份服务配置不可用');
      }
      const signals = [AbortSignal.timeout(protocolRequestTimeoutMs)];
      if (signal) signals.push(signal);
      if (options?.signal) signals.push(options.signal);
      return fetch(target, { ...options, redirect: 'error', signal: AbortSignal.any(signals) });
    };
    return clientConfig;
  }
  async function readSession(request: Request, response: Response) {
    const token = browser.getCookie(request, browser.names.portal);
    const binding = browser.getCookie(request, browser.names.binding);
    if (!token || !binding) return undefined;
    return store.write(async (tx) => {
      const [portal] = await tx.select().from(portalSessions).where(eq(portalSessions.tokenHash, digest(token)));
      if (!portal || portal.expiresAt <= store.now()) {
        browser.setCookie(response, browser.names.portal, '', 0);
        return undefined;
      }
      const { authSessions } = await import('../db/schema/index.js');
      const [central] = await tx.select().from(authSessions).where(eq(authSessions.id, portal.authSessionId));
      const valid = central ? await store.touchSession(tx, central.providerUidHash) : undefined;
      if (!valid) {
        await tx.delete(portalSessions).where(eq(portalSessions.tokenHash, portal.tokenHash));
        browser.setCookie(response, browser.names.portal, '', 0);
        return undefined;
      }
      return { ...valid, portal, binding, csrfSubject: `portal:${portal.tokenHash}:${portal.csrfSecret}` };
    });
  }
  return {
    readSession,
    async start(request: Request, response: Response) {
      const binding = browser.binding(request, response);
      const state = oidc.randomState();
      const nonce = oidc.randomNonce();
      const verifier = oidc.randomPKCECodeVerifier();
      await flows.create('login', binding, callbackUri, { state, nonce, verifier });
      return oidc.buildAuthorizationUrl(client(), {
        redirect_uri: callbackUri, scope: 'openid profile roles', state, nonce,
        code_challenge: await oidc.calculatePKCECodeChallenge(verifier), code_challenge_method: 'S256',
      }).href;
    },
    async complete(request: Request, response: Response): Promise<AuthUser> {
      const url = new URL(request.originalUrl, config.origin);
      const state = url.searchParams.get('state');
      if (!state || url.searchParams.getAll('state').length !== 1) throw new AppError(400, 'AUTH_FLOW_INVALID', '登录回调无效');
      const binding = browser.binding(request);
      const flow = await flows.read<LoginFlow>('login', state, binding, true);
      const abort = new AbortController();
      const onClose = () => { if (!response.writableFinished) abort.abort(); };
      response.once('close', onClose);
      try {
        const oidcClient = client(abort.signal);
        const tokens = await oidc.authorizationCodeGrant(oidcClient, url, {
          expectedState: flow.data.state, expectedNonce: flow.data.nonce, pkceCodeVerifier: flow.data.verifier,
          idTokenExpected: true,
        });
        const claims = tokens.claims();
        if (!claims?.sub) throw new AppError(400, 'AUTH_FLOW_INVALID', '身份响应无效');
        await oidc.fetchUserInfo(oidcClient, tokens.access_token, claims.sub);
        const accessToken = await provider.AccessToken.find(tokens.access_token);
        if (!accessToken?.sessionUid || accessToken.clientId !== 'pr-sso-portal' || accessToken.accountId !== claims.sub) {
          throw new AppError(400, 'AUTH_FLOW_INVALID', '身份会话无效');
        }
        const sessionUidHash = digest(accessToken.sessionUid);
        const portalToken = randomToken();
        const user = await store.write(async (tx) => {
          const valid = await store.validSession(tx, sessionUidHash);
          if (!valid || valid.user.id !== claims.sub) throw new AppError(401, 'UNAUTHENTICATED', '登录状态已失效');
          const previous = browser.getCookie(request, browser.names.portal);
          if (previous) await tx.delete(portalSessions).where(eq(portalSessions.tokenHash, digest(previous)));
          await tx.insert(portalSessions).values({
            tokenHash: digest(portalToken), userId: valid.user.id, authSessionId: valid.session.id,
            csrfSecret: randomToken(), expiresAt: valid.session.absoluteExpiresAt,
          });
          return publicUser(valid.user);
        });
        await accessToken.destroy();
        browser.setCookie(response, browser.names.portal, portalToken, SESSION_SECONDS);
        return user;
      } finally {
        response.off('close', onClose);
      }
    },
    async sessionData(request: Request, response: Response) {
      const valid = await readSession(request, response);
      if (!valid) return { authenticated: false as const };
      return {
        authenticated: true as const, user: publicUser(valid.user),
        expiresAt: valid.session.absoluteExpiresAt.toISOString(), idleExpiresAt: valid.session.idleExpiresAt.toISOString(),
        csrfToken: browser.csrf(valid.csrfSubject, valid.binding),
      };
    },
    async logoutUrl(request: Request, response: Response, csrfToken: string) {
      browser.requireOrigin(request);
      const valid = await readSession(request, response);
      if (!valid) throw new AppError(401, 'UNAUTHENTICATED', '请重新登录');
      browser.verifyCsrf(csrfToken, valid.csrfSubject, valid.binding);
      return oidc.buildEndSessionUrl(client(), {
        client_id: 'pr-sso-portal', post_logout_redirect_uri: `${config.origin}/?signed_out=1`,
      }).href;
    },
  };
}
