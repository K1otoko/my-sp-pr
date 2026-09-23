// 协议响应由 OIDC 定义，不进入 JSON SDK。Gateway 与 Provider 共享精确公开路由。
export const oidcPaths = {
  discovery: '/.well-known/openid-configuration',
  oauthMetadata: '/.well-known/oauth-authorization-server',
  jwks: '/api/auth/oidc/jwks',
  authorization: '/api/auth/oidc/authorize',
  resume: '/api/auth/oidc/authorize/{uid}',
  token: '/api/auth/oidc/token',
  userinfo: '/api/auth/oidc/userinfo',
  introspection: '/api/auth/oidc/introspect',
  revocation: '/api/auth/oidc/revoke',
  endSession: '/api/auth/oidc/logout',
  endSessionConfirm: '/api/auth/oidc/logout/confirm',
  endSessionSuccess: '/api/auth/oidc/logout/success',
} as const;

export type ProtocolAccess = 'public-read' | 'navigation' | 'server' | 'same-origin';
export type AuthProtocolRoute = {
  name: string;
  method: 'get' | 'post';
  path: string;
  service: 'pr-auth';
  access: ProtocolAccess;
};
export const authProtocolRoutes: readonly AuthProtocolRoute[] = [
  { name: 'discovery', method: 'get', path: oidcPaths.discovery, access: 'public-read', service: 'pr-auth' },
  { name: 'oauthMetadata', method: 'get', path: oidcPaths.oauthMetadata, access: 'public-read', service: 'pr-auth' },
  { name: 'jwks', method: 'get', path: oidcPaths.jwks, access: 'public-read', service: 'pr-auth' },
  { name: 'authorization', method: 'get', path: oidcPaths.authorization, access: 'navigation', service: 'pr-auth' },
  { name: 'resume', method: 'get', path: oidcPaths.resume, access: 'navigation', service: 'pr-auth' },
  { name: 'token', method: 'post', path: oidcPaths.token, access: 'server', service: 'pr-auth' },
  { name: 'userinfoGet', method: 'get', path: oidcPaths.userinfo, access: 'server', service: 'pr-auth' },
  { name: 'userinfoPost', method: 'post', path: oidcPaths.userinfo, access: 'server', service: 'pr-auth' },
  { name: 'introspection', method: 'post', path: oidcPaths.introspection, access: 'server', service: 'pr-auth' },
  { name: 'revocation', method: 'post', path: oidcPaths.revocation, access: 'server', service: 'pr-auth' },
  { name: 'endSession', method: 'get', path: oidcPaths.endSession, access: 'navigation', service: 'pr-auth' },
  { name: 'endSessionConfirm', method: 'post', path: oidcPaths.endSessionConfirm, access: 'same-origin', service: 'pr-auth' },
  { name: 'endSessionSuccess', method: 'get', path: oidcPaths.endSessionSuccess, access: 'navigation', service: 'pr-auth' },
];

export function matchesProtocolPath(pattern: string, pathname: string): boolean {
  const expected = pattern.split('/');
  const actual = pathname.split('/');
  return expected.length === actual.length && expected.every((part, i) =>
    part === '{uid}' ? /^[A-Za-z0-9_-]{1,256}$/u.test(actual[i] ?? '') : part === actual[i]);
}
