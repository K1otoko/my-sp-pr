import * as oidc from 'openid-client';
import { z } from 'zod';
import { authRoleSchema, oidcPaths, type AuthUser } from '../api/index.js';
import type { env } from '../config/env.js';
import { AppError } from '../utils/app-error.js';

const identitySchema = z.object({
  sub: z.uuid(),
  preferred_username: z.string().min(1).max(128),
  name: z.string().min(1).max(256),
  roles: z.array(authRoleSchema).length(1),
});

export type AdminIdentity = AuthUser & { role: 'super' | 'admin' };

export function adminOidcClient(config: typeof env) {
  const callbackUri = `${config.adminOrigin}/api/admin/auth/callback`;
  const postLogoutUri = `${config.adminOrigin}/?signed_out=1`;
  function client(signal?: AbortSignal) {
    const clientConfig = new oidc.Configuration({
      issuer: config.ssoOrigin,
      authorization_endpoint: `${config.ssoOrigin}${oidcPaths.authorization}`,
      token_endpoint: `${config.ssoOrigin}${oidcPaths.token}`,
      userinfo_endpoint: `${config.ssoOrigin}${oidcPaths.userinfo}`,
      jwks_uri: `${config.ssoOrigin}${oidcPaths.jwks}`,
      end_session_endpoint: `${config.ssoOrigin}${oidcPaths.endSession}`,
      authorization_response_iss_parameter_supported: true,
      id_token_signing_alg_values_supported: ['RS256'],
    }, config.oidcClientId, {
      client_secret: config.oidcClientSecret,
      id_token_signed_response_alg: 'RS256',
    }, oidc.ClientSecretBasic(config.oidcClientSecret));
    if (!config.ssoSecure) oidc.allowInsecureRequests(clientConfig);
    oidc.enableNonRepudiationChecks(clientConfig);
    clientConfig.timeout = config.authTimeoutMs / 1000;
    clientConfig[oidc.customFetch] = (url, options) => {
      const target = new URL(url);
      if (target.origin !== config.ssoOrigin
        || ![oidcPaths.token, oidcPaths.userinfo, oidcPaths.jwks].some((path) => path === target.pathname)) {
        throw new AppError(503, 'AUTH_UNAVAILABLE', '身份服务配置不可用');
      }
      const signals = [AbortSignal.timeout(config.authTimeoutMs)];
      if (signal) signals.push(signal);
      if (options?.signal) signals.push(options.signal);
      return fetch(target, { ...options, redirect: 'error', signal: AbortSignal.any(signals) });
    };
    return clientConfig;
  }
  async function identity(accessToken: string, subject: string, signal?: AbortSignal): Promise<AdminIdentity> {
    const parsed = identitySchema.safeParse(await oidc.fetchUserInfo(client(signal), accessToken, subject));
    if (!parsed.success) throw new AppError(403, 'FORBIDDEN', '当前账号无法访问管理平台');
    const role = parsed.data.roles[0];
    if (role !== 'super' && role !== 'admin') {
      throw new AppError(403, 'FORBIDDEN', '当前账号无法访问管理平台');
    }
    return {
      id: parsed.data.sub,
      username: parsed.data.preferred_username,
      displayName: parsed.data.name,
      role,
    };
  }
  return {
    callbackUri,
    async authorizationUrl(input: { state: string; nonce: string; verifier: string }) {
      return oidc.buildAuthorizationUrl(client(), {
        redirect_uri: callbackUri,
        scope: 'openid profile roles',
        state: input.state,
        nonce: input.nonce,
        code_challenge: await oidc.calculatePKCECodeChallenge(input.verifier),
        code_challenge_method: 'S256',
      });
    },
    async exchange(url: URL, input: { state: string; nonce: string; verifier: string }, signal?: AbortSignal) {
      return oidc.authorizationCodeGrant(client(signal), url, {
        expectedState: input.state,
        expectedNonce: input.nonce,
        pkceCodeVerifier: input.verifier,
        idTokenExpected: true,
      });
    },
    identity,
    refresh(refreshToken: string, signal?: AbortSignal) {
      return oidc.refreshTokenGrant(client(signal), refreshToken);
    },
    logoutUrl(idToken: string) {
      return oidc.buildEndSessionUrl(client(), {
        client_id: config.oidcClientId,
        id_token_hint: idToken,
        post_logout_redirect_uri: postLogoutUri,
      });
    },
    isRejected(error: unknown) {
      return (error instanceof oidc.ResponseBodyError || error instanceof oidc.WWWAuthenticateChallengeError)
        && [400, 401, 403].includes(error.status);
    },
  };
}

export type AdminOidcClient = ReturnType<typeof adminOidcClient>;
