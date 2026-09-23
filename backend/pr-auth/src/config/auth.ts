import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { authRoleSchema } from '../api/index.js';
import { storageCrypto } from '../auth/storage-crypto.js';

const secret = z.string().min(43).max(256);
const uri = z.url().refine((value) => {
  const url = new URL(value);
  return !url.hash && !url.username && !url.password && !value.includes('*')
    && (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)));
});
const clientSchema = z.strictObject({
  clientId: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/u),
  name: z.string().min(1).max(80),
  secret,
  redirectUris: z.array(uri).min(1),
  postLogoutRedirectUris: z.array(uri).default([]),
  allowedRoles: z.array(authRoleSchema).min(1),
  scopes: z.array(z.enum(['openid', 'profile', 'roles'])).min(1),
  refreshToken: z.boolean().default(false),
});
const authFileSchema = z.strictObject({
  cookieKeys: z.array(secret).min(1),
  encryptionKeys: z.array(z.strictObject({ id: z.string(), key: secret })).min(1),
  hmacKey: secret,
  jwks: z.object({ keys: z.array(z.object({
    kty: z.literal('RSA'), kid: z.string().min(1), use: z.literal('sig'), alg: z.literal('RS256'),
    n: z.string(), e: z.string(), d: z.string(), p: z.string(), q: z.string(), dp: z.string(), dq: z.string(), qi: z.string(),
  })).min(1) }),
  portalSecret: secret,
  clients: z.array(clientSchema).default([]),
});
export type RegisteredClient = z.infer<typeof clientSchema>;
export function loadAuthConfig(source: NodeJS.ProcessEnv) {
  const originValue = source.SSO_PUBLIC_ORIGIN ?? 'http://localhost:5175';
  const origin = new URL(originValue);
  const production = source.NODE_ENV === 'production';
  if (origin.origin !== originValue || origin.username || origin.password
    || (origin.protocol !== 'https:' && (production || origin.protocol !== 'http:' || origin.hostname !== 'localhost'))) {
    throw new Error('SSO_PUBLIC_ORIGIN 必须为固定 HTTPS Origin（开发允许 http://localhost:5175）');
  }
  const filename = resolve(fileURLToPath(new URL('../../', import.meta.url)), source.AUTH_CONFIG_FILE ?? '.deploy/auth.json');
  let parsed: z.infer<typeof authFileSchema>;
  try {
    if ((statSync(filename).mode & 0o077) !== 0) throw new Error('permissions');
    parsed = authFileSchema.parse(JSON.parse(readFileSync(filename, 'utf8')));
  } catch {
    throw new Error('身份配置文件缺失、格式无效或权限不安全；请执行 auth:keys 并使用 0600 权限');
  }
  const clients: RegisteredClient[] = [{
    clientId: 'pr-sso-portal', name: '统一登录', secret: parsed.portalSecret,
    redirectUris: [`${originValue}/api/auth/portal/callback`],
    postLogoutRedirectUris: [`${originValue}/?signed_out=1`],
    allowedRoles: ['admin', 'user'], scopes: ['openid', 'profile', 'roles'], refreshToken: false,
  }, ...parsed.clients];
  if (new Set(clients.map((client) => client.clientId)).size !== clients.length
    || clients.some((client) => !client.scopes.includes('openid'))
    || (production && clients.some((client) => [...client.redirectUris, ...client.postLogoutRedirectUris]
      .some((value) => !value.startsWith('https://'))))) throw new Error('静态 OIDC 客户端配置无效');
  const crypto = storageCrypto(parsed.encryptionKeys, parsed.hmacKey);
  const trustedGatewayCidrs = (source.AUTH_TRUSTED_GATEWAY_CIDRS ?? 'loopback')
    .split(',').map((value) => value.trim()).filter(Boolean);
  if (!trustedGatewayCidrs.length) throw new Error('必须配置身份服务信任的 Gateway 地址');
  return { ...parsed, clients, crypto, trustedGatewayCidrs, origin: originValue, secure: origin.protocol === 'https:' };
}
export type AuthConfig = ReturnType<typeof loadAuthConfig>;
