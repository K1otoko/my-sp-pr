import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { parseDatabaseConfig } from '@my-sp-pr/database';
import { tokenCrypto } from '../auth/token-crypto.js';

// 开发 src/config 与生产 dist/config 的相对层级一致，不依赖启动目录。
try {
  loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}

const origin = z.url().refine((value) => new URL(value).origin === value, '必须是完整 Origin');
const secret = z.string().min(43).max(256);
const encryptionKeys = z.string().transform((value, context): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    context.addIssue({ code: 'custom', message: '必须是有效 JSON' });
    return z.NEVER;
  }
}).pipe(z.array(z.strictObject({ id: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/u), key: secret })).min(1));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().trim().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3003),
  ADMIN_PUBLIC_ORIGIN: origin.default('http://localhost:5174'),
  SSO_PUBLIC_ORIGIN: origin.default('http://localhost:5175'),
  ADMIN_OIDC_CLIENT_ID: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/u).default('pr-admin'),
  ADMIN_OIDC_CLIENT_SECRET: secret,
  ADMIN_TOKEN_ENCRYPTION_KEYS: encryptionKeys,
  ADMIN_CSRF_HMAC_KEY: secret,
  ADMIN_AUTH_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(15_000).default(7_500),
  GITHUB_API_ORIGIN: origin.default('https://api.github.com'),
  GITHUB_APP_ID: z.coerce.number().int().positive().optional(),
  GITHUB_APP_PRIVATE_KEY_FILE: z.string().min(1).optional(),
  GITHUB_INSTALLATION_ID: z.coerce.number().int().positive().optional(),
  GITHUB_REPOSITORY: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u).optional(),
  GITHUB_ALLOWED_OWNERS: z.string().optional(),
  GITHUB_RUNNER_TARGETS: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().min(32).max(256).optional(),
}).superRefine((value, context) => {
  const githubFields = [
    value.GITHUB_APP_ID,
    value.GITHUB_APP_PRIVATE_KEY_FILE,
    value.GITHUB_INSTALLATION_ID,
    value.GITHUB_REPOSITORY,
    value.GITHUB_ALLOWED_OWNERS,
    value.GITHUB_RUNNER_TARGETS,
    value.GITHUB_WEBHOOK_SECRET,
  ];
  if (githubFields.some(Boolean) && !githubFields.every(Boolean)) {
    context.addIssue({ code: 'custom', path: ['GITHUB_APP_ID'], message: 'GitHub 发布配置必须完整提供' });
  }
  if (value.NODE_ENV !== 'production') return;
  for (const [key, originValue] of [
    ['ADMIN_PUBLIC_ORIGIN', value.ADMIN_PUBLIC_ORIGIN],
    ['SSO_PUBLIC_ORIGIN', value.SSO_PUBLIC_ORIGIN],
  ] as const) {
    if (new URL(originValue).protocol !== 'https:') {
      context.addIssue({ code: 'custom', path: [key], message: '生产环境必须使用 HTTPS' });
    }
  }
  if (!githubFields.every(Boolean)) {
    context.addIssue({ code: 'custom', path: ['GITHUB_APP_ID'], message: '生产环境必须配置 GitHub App' });
  }
  if (new URL(value.GITHUB_API_ORIGIN).protocol !== 'https:') {
    context.addIssue({ code: 'custom', path: ['GITHUB_API_ORIGIN'], message: '生产环境必须使用 HTTPS' });
  }
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`环境变量配置错误：${z.prettifyError(parsed.error)}`);
}
const githubConfigured = Boolean(parsed.data.GITHUB_APP_ID);
const allowedOwners = new Set(parsed.data.GITHUB_ALLOWED_OWNERS?.split(',')
  .map((value) => value.trim().toLowerCase()).filter(Boolean));
const runnerTargets = new Set(parsed.data.GITHUB_RUNNER_TARGETS?.split(',').map((value) => value.trim()).filter(Boolean));
if (githubConfigured && (!allowedOwners.size || !runnerTargets.size)) {
  throw new Error('环境变量配置错误：GitHub owner 和 runner target 白名单不能为空');
}
if ([...runnerTargets].some((target) => !['staging', 'production'].includes(target))) {
  throw new Error('环境变量配置错误：首版 runner target 仅支持 staging 或 production');
}
export const env = {
  nodeEnv: parsed.data.NODE_ENV,
  host: parsed.data.HOST,
  port: parsed.data.PORT,
  adminOrigin: parsed.data.ADMIN_PUBLIC_ORIGIN,
  ssoOrigin: parsed.data.SSO_PUBLIC_ORIGIN,
  oidcClientId: parsed.data.ADMIN_OIDC_CLIENT_ID,
  oidcClientSecret: parsed.data.ADMIN_OIDC_CLIENT_SECRET,
  authTimeoutMs: parsed.data.ADMIN_AUTH_TIMEOUT_MS,
  secure: new URL(parsed.data.ADMIN_PUBLIC_ORIGIN).protocol === 'https:',
  ssoSecure: new URL(parsed.data.SSO_PUBLIC_ORIGIN).protocol === 'https:',
  authCrypto: tokenCrypto(parsed.data.ADMIN_TOKEN_ENCRYPTION_KEYS, parsed.data.ADMIN_CSRF_HMAC_KEY),
  github: githubConfigured ? {
    apiOrigin: parsed.data.GITHUB_API_ORIGIN,
    appId: parsed.data.GITHUB_APP_ID!,
    privateKeyFile: resolve(fileURLToPath(new URL('../../', import.meta.url)), parsed.data.GITHUB_APP_PRIVATE_KEY_FILE!),
    installationId: parsed.data.GITHUB_INSTALLATION_ID!,
    repository: parsed.data.GITHUB_REPOSITORY!,
    allowedOwners,
    runnerTargets,
    webhookSecret: parsed.data.GITHUB_WEBHOOK_SECRET!,
  } : undefined,
  database: parseDatabaseConfig(process.env, 'runtime'),
};
