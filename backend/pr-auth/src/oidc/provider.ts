import { eq } from 'drizzle-orm';
import Provider, { errors, type Configuration, type KoaContextWithOIDC } from 'oidc-provider';
import { oidcPaths } from '../api/index.js';
import { FLOW_SECONDS, SESSION_SECONDS, TOKEN_SECONDS, roleAllowed } from '../auth/policy.js';
import { browserSecurity } from '../auth/csrf.js';
import { digest } from '../auth/storage-crypto.js';
import type { AuthConfig } from '../config/auth.js';
import { users } from '../db/schema/index.js';
import type { AuthStore } from '../repositories/auth-store.js';
import { flowStore } from '../repositories/flow-store.js';
import { createAdapter, oidcContext } from './adapter.js';

function remaining(authTime: number | undefined, ceiling = SESSION_SECONDS) {
  if (authTime === undefined) return ceiling;
  const seconds = Math.min(ceiling, authTime + SESSION_SECONDS - Math.floor(Date.now() / 1000));
  if (seconds <= 0) throw new errors.InvalidGrant('session expired');
  return seconds;
}

export function createProvider(config: AuthConfig, store: AuthStore) {
  const browser = browserSecurity(config);
  const flows = flowStore(store);
  const registry = new Map(config.clients.map((client) => [client.clientId, client]));
  const configuration: Configuration = {
    adapter: createAdapter(store),
    jwks: config.jwks,
    clients: config.clients.map((client) => ({
      client_id: client.clientId, client_name: client.name, client_secret: client.secret,
      redirect_uris: client.redirectUris, post_logout_redirect_uris: client.postLogoutRedirectUris,
      grant_types: client.refreshToken ? ['authorization_code', 'refresh_token'] : ['authorization_code'],
      response_types: ['code'], token_endpoint_auth_method: 'client_secret_basic',
      id_token_signed_response_alg: 'RS256', scope: client.scopes.join(' '),
    })),
    clientAuthMethods: ['client_secret_basic'],
    responseTypes: ['code'],
    scopes: ['openid', 'profile', 'roles'],
    claims: { openid: ['sub'], profile: ['preferred_username', 'name'], roles: ['roles'] },
    conformIdTokenClaims: false,
    pkce: { required: () => true },
    allowOmittingSingleRegisteredRedirectUri: false,
    acceptQueryParamAccessTokens: false,
    clientBasedCORS: () => false,
    enabledJWA: { idTokenSigningAlgValues: ['RS256'] },
    cookies: {
      keys: config.cookieKeys,
      names: {
        session: config.secure ? '__Host-sso' : 'dev_sso',
        interaction: config.secure ? '__Secure-sso_interaction' : 'dev_sso_interaction',
        resume: config.secure ? '__Secure-sso_resume' : 'dev_sso_resume',
      },
      long: { httpOnly: true, sameSite: 'lax', secure: config.secure, path: '/' },
      short: { httpOnly: true, sameSite: 'lax', secure: config.secure },
    },
    routes: {
      authorization: oidcPaths.authorization, token: oidcPaths.token, userinfo: oidcPaths.userinfo,
      jwks: oidcPaths.jwks, introspection: oidcPaths.introspection,
      revocation: oidcPaths.revocation, end_session: oidcPaths.endSession,
    },
    features: {
      devInteractions: { enabled: false },
      dPoP: { enabled: false }, pushedAuthorizationRequests: { enabled: false },
      resourceIndicators: { enabled: false }, requestObjects: { enabled: false },
      registration: { enabled: false }, deviceFlow: { enabled: false }, clientCredentials: { enabled: false },
      userinfo: { enabled: true },
      introspection: {
        enabled: true,
        async allowedPolicy(_ctx, client, token) {
          if (client.clientId !== token.clientId || !('sessionUid' in token) || !token.sessionUid) return false;
          const valid = await store.validSession(store.db, digest(token.sessionUid));
          const registered = registry.get(client.clientId);
          return Boolean(valid && registered && roleAllowed(valid.user, registered.allowedRoles));
        },
      },
      revocation: { enabled: true, allowedPolicy: (_ctx, client, token) => client.clientId === token.clientId },
      rpInitiatedLogout: {
        enabled: true,
        async logoutSource(ctx) {
          const session = ctx.oidc.session;
          const xsrf = session?.state?.secret;
          if (!session || typeof xsrf !== 'string') throw new errors.InvalidRequest('logout state unavailable');
          const binding = browser.binding(ctx.req, ctx.res);
          const flow = await flows.create('logout', binding, oidcPaths.endSessionConfirm, {
            sessionUid: session.uid, xsrf,
            clientName: registry.get(ctx.oidc.client?.clientId ?? '')?.name ?? '所有已登录应用',
          });
          ctx.status = 303;
          ctx.redirect(`/logout?flow=${flow}`);
        },
        postLogoutSuccessSource(ctx) { ctx.status = 303; ctx.redirect('/?signed_out=1'); },
      },
    },
    interactions: { url: (_ctx, interaction) => `/api/auth/interactions/${interaction.uid}` },
    expiresWithSession: () => true,
    issueRefreshToken: (_ctx, client) => registry.get(client.clientId)?.refreshToken === true,
    rotateRefreshToken: true,
    revokeGrantPolicy: () => true,
    ttl: {
      AuthorizationCode: 60, Interaction: FLOW_SECONDS, IdToken: TOKEN_SECONDS,
      Session: (_ctx, session) => remaining(session.loginTs),
      Grant: (ctx) => remaining(ctx.oidc.session?.loginTs),
      RefreshToken: (_ctx, token) => remaining(token.authTime),
      AccessToken: (ctx) => remaining(ctx.oidc.entities.RefreshToken?.authTime
        ?? ctx.oidc.entities.AuthorizationCode?.authTime ?? ctx.oidc.session?.loginTs, TOKEN_SECONDS),
    },
    async findAccount(ctx, accountId, token) {
      const registered = registry.get(ctx.oidc.client?.clientId ?? token?.clientId ?? '');
      const [user] = await store.db.select().from(users).where(eq(users.id, accountId));
      if (!user || !registered || !roleAllowed(user, registered.allowedRoles)) {
        throw new errors.AccessDenied('account is not permitted');
      }
      if (token && 'sessionUid' in token && token.sessionUid && !await store.validSession(store.db, digest(token.sessionUid))) {
        throw new errors.InvalidGrant('session expired');
      }
      return {
        accountId: user.id,
        claims: () => ({ sub: user.id, preferred_username: user.usernameNormalized, name: user.displayName, roles: [user.role] }),
      };
    },
    async loadExistingGrant(ctx) {
      const { session, client } = ctx.oidc;
      assertRequest(ctx);
      if (!session?.accountId || !client) return undefined;
      const registered = registry.get(client.clientId);
      const valid = await store.write((tx) => store.ensureSession(tx, {
        uid: session.uid, accountId: session.accountId!, loginTs: session.loginTs!, acr: session.acr,
      }));
      if (!registered || !roleAllowed(valid.user, registered.allowedRoles)) throw new errors.AccessDenied('account is not permitted');
      const id = session.grantIdFor(client.clientId);
      const grant = (id ? await provider.Grant.find(id) : undefined)
        ?? new provider.Grant({ accountId: session.accountId, clientId: client.clientId });
      grant.addOIDCScope(registered.scopes.join(' '));
      await grant.save();
      return grant;
    },
    renderError(ctx) {
      ctx.status = 303;
      ctx.redirect('/auth/error?code=AUTH_FLOW_INVALID');
    },
  };
  function assertRequest(ctx: KoaContextWithOIDC) {
    const registered = registry.get(ctx.oidc.client?.clientId ?? '');
    const scopes = String(ctx.oidc.params?.scope ?? '').split(' ').filter(Boolean);
    if (!registered || !scopes.includes('openid') || scopes.some((scope) => !registered.scopes.includes(scope as 'openid' | 'profile' | 'roles'))) {
      throw new errors.InvalidScope('requested scope is not registered', scopes.join(' '));
    }
    if (ctx.oidc.params?.code_challenge_method !== 'S256') throw new errors.InvalidRequest('PKCE S256 is required');
  }
  const provider = new Provider(config.origin, configuration);
  provider.proxy = true;
  provider.use(async (ctx, next) => {
    ctx.set('Referrer-Policy', 'no-referrer');
    ctx.set('X-Frame-Options', 'DENY');
    ctx.set('Content-Security-Policy', "frame-ancestors 'none'");
    if (ctx.path === oidcPaths.endSessionConfirm && ctx.get('origin') !== config.origin) {
      throw new errors.InvalidRequest('invalid request origin');
    }
    if (ctx.query.resource !== undefined || ctx.query.request !== undefined || ctx.query.request_uri !== undefined) {
      throw new errors.InvalidRequest('unsupported authorization parameter');
    }
    if (ctx.path === oidcPaths.authorization) {
      const clientId = ctx.query.client_id;
      const registered = typeof clientId === 'string' ? registry.get(clientId) : undefined;
      const requestedScope = ctx.query.scope;
      const scopes = typeof requestedScope === 'string' ? requestedScope.split(' ').filter(Boolean) : [];
      if (registered && (!scopes.includes('openid')
        || scopes.some((scope) => !registered.scopes.includes(scope as 'openid' | 'profile' | 'roles')))) {
        // Provider 会过滤不认识的 scope；在过滤前拒绝，避免静默接受未登记权限。
        throw new errors.InvalidScope('requested scope is not registered', scopes.join(' '));
      }
    }
    await oidcContext.run({ session: () => ctx.oidc.session }, async () => {
      await next();
      if (ctx.oidc.route === 'end_session_confirm' && ctx.status === 303 && ctx.oidc.params.logout) {
        const uidHash = digest(ctx.oidc.session.uid);
        await store.write(async (tx) => {
          await store.revokeSession(tx, uidHash);
          await store.audit(tx, {
            event: 'session.logout', userId: ctx.oidc.session.accountId,
            outcome: 'success', reason: 'browser_logout', requestId: ctx.get('x-request-id'),
          });
        });
        browser.setCookie(ctx.res, browser.names.portal, '', 0);
      }
      if (ctx.status < 400 && ['authorization', 'resume', 'userinfo', 'token'].includes(ctx.oidc.route)) {
        const uid = ctx.oidc.entities.AccessToken?.sessionUid
          ?? ctx.oidc.entities.RefreshToken?.sessionUid ?? ctx.oidc.session?.uid;
        if (uid) await store.write((tx) => store.touchSession(tx, digest(uid)));
      }
    });
  });
  provider.on('server_error', (ctx, error) => {
    console.error('[pr-auth] OIDC 请求失败', { requestId: ctx.get('x-request-id'), type: error.name });
  });
  return provider;
}
