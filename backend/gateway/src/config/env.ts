import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// 开发 src/config 与生产 dist/config 的相对层级一致，不依赖启动目录。
try {
  loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}

const originSchema = z.string().refine((value) => {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && url.origin === value;
  } catch {
    return false;
  }
}, '必须是完整 HTTP/HTTPS Origin，不能包含路径、凭据、query、hash 或末尾斜杠');

const upstreamKeys = ['CHAT_SERVICE_URL', 'AUTH_SERVICE_URL', 'ADMIN_SERVICE_URL'] as const;
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().trim().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  CORS_ORIGINS: z.string().optional(),
  SSO_PUBLIC_ORIGIN: originSchema.optional(),
  TRUSTED_PROXY_CIDRS: z.string().default(''),
  CHAT_SERVICE_URL: originSchema.optional(),
  AUTH_SERVICE_URL: originSchema.optional(),
  ADMIN_SERVICE_URL: originSchema.optional(),
  UPSTREAM_TIMEOUT_MS: z.coerce.number().int().min(1).max(9_999).default(8_000),
  AUTH_FLOW_TIMEOUT_MS: z.coerce.number().int().min(10_000).max(60_000).default(20_000),
}).superRefine((value, context) => {
  if (value.AUTH_FLOW_TIMEOUT_MS <= value.UPSTREAM_TIMEOUT_MS) {
    context.addIssue({
      code: 'custom',
      path: ['AUTH_FLOW_TIMEOUT_MS'],
      message: '必须大于 UPSTREAM_TIMEOUT_MS',
    });
  }
  if (value.NODE_ENV === 'production') {
    for (const key of ['CORS_ORIGINS', 'SSO_PUBLIC_ORIGIN', ...upstreamKeys] as const) {
      if (!value[key]?.trim()) context.addIssue({ code: 'custom', path: [key], message: '生产环境必须显式设置' });
    }
  }
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`环境变量配置错误：${z.prettifyError(parsed.error)}`);
}
const config = parsed.data;
const origins = z.array(originSchema).min(1).parse(
  (config.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:5174,http://localhost:5175')
    .split(',').map((item) => item.trim()),
);
const targets = {
  chat: config.CHAT_SERVICE_URL ?? 'http://127.0.0.1:3001',
  auth: config.AUTH_SERVICE_URL ?? 'http://127.0.0.1:3002',
  admin: config.ADMIN_SERVICE_URL ?? 'http://127.0.0.1:3003',
};
const localHosts = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]', '[::]', config.HOST.toLowerCase()]);
for (const target of Object.values(targets)) {
  const url = new URL(target);
  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
  if (localHosts.has(url.hostname) && port === config.PORT) {
    throw new Error('上游地址不能指向 gateway 自身监听端口');
  }
}

export const env = {
  nodeEnv: config.NODE_ENV,
  host: config.HOST,
  port: config.PORT,
  corsOrigins: new Set(origins),
  ssoOrigin: config.SSO_PUBLIC_ORIGIN ?? 'http://localhost:5175',
  trustedProxyCidrs: config.TRUSTED_PROXY_CIDRS.split(',').map((value) => value.trim()).filter(Boolean),
  targets,
  upstreamTimeoutMs: config.UPSTREAM_TIMEOUT_MS,
  authFlowTimeoutMs: config.AUTH_FLOW_TIMEOUT_MS,
};
