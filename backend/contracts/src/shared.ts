import { z } from 'zod';

export const API_PREFIX = '/api';

export const errorCodeSchema = z.enum([
  'NOT_FOUND',
  'CORS_FORBIDDEN',
  'INVALID_JSON',
  'PAYLOAD_TOO_LARGE',
  'INTERNAL_ERROR',
  'UPSTREAM_UNAVAILABLE',
  'UPSTREAM_TIMEOUT',
  'DATABASE_NOT_READY',
  'INVALID_CREDENTIALS',
  'INTERACTION_EXPIRED',
  'INVALID_INTERACTION',
  'INVALID_INPUT',
  'CSRF_INVALID',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'RATE_LIMITED',
  'AUTH_FLOW_INVALID',
  'AUTH_UNAVAILABLE',
  'CONFIGURATION_INCOMPLETE',
  'DEPLOYMENT_CONFLICT',
  'GITHUB_UNAVAILABLE',
  'MANIFEST_INVALID',
  'REF_NOT_ALLOWED',
  'WEBHOOK_INVALID',
]).meta({ id: 'ErrorCode' });

export const errorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
  }),
}).meta({ id: 'ErrorResponse', description: '统一错误响应' });

export const healthDataSchema = z.object({
  status: z.literal('ok'),
  service: z.string(),
  timestamp: z.iso.datetime(),
  uptime: z.number().int().nonnegative(),
}).meta({ id: 'HealthData', description: '服务状态与进程运行秒数' });

export const healthResponseSchema = z.object({
  success: z.literal(true),
  data: healthDataSchema,
}).meta({ id: 'HealthResponse' });

export type ErrorCode = z.infer<typeof errorCodeSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
export type HealthData = z.infer<typeof healthDataSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const authRoleSchema = z.enum(['super', 'admin', 'user']).meta({ id: 'AuthRole' });
export type AuthRole = z.infer<typeof authRoleSchema>;
export const authUserSchema = z.object({
  id: z.uuid(),
  username: z.string(),
  displayName: z.string(),
  role: authRoleSchema,
}).meta({ id: 'AuthUser' });
export type AuthUser = z.infer<typeof authUserSchema>;
export const authSessionDataSchema = z.discriminatedUnion('authenticated', [
  z.object({ authenticated: z.literal(false) }),
  z.object({
    authenticated: z.literal(true),
    user: authUserSchema,
    expiresAt: z.iso.datetime(),
    idleExpiresAt: z.iso.datetime(),
    csrfToken: z.string(),
  }),
]).meta({ id: 'AuthSessionData' });
export const authInteractionDataSchema = z.object({
  clientName: z.string(),
  prompt: z.literal('login'),
  expiresAt: z.iso.datetime(),
  csrfToken: z.string(),
}).meta({ id: 'AuthInteractionData' });
export const loginInputSchema = z.strictObject({
  username: z.string().min(1).max(128),
  password: z.string().min(1).max(128),
  csrfToken: z.string().min(1).max(512),
}).meta({ id: 'LoginInput' });
export const csrfInputSchema = z.strictObject({
  csrfToken: z.string().min(1).max(512),
}).meta({ id: 'CsrfInput' });
export const resumeDataSchema = z.object({
  resumeUrl: z.string(),
}).meta({ id: 'AuthResumeData' });
export const logoutContextDataSchema = z.object({
  clientName: z.string(),
  xsrf: z.string(),
  action: z.literal('/api/auth/oidc/logout/confirm'),
}).meta({ id: 'LogoutContextData' });

export const readinessDataSchema = z.object({
  status: z.literal('ready'),
  service: z.string(),
  timestamp: z.iso.datetime(),
  checks: z.object({ database: z.literal('ok') }),
}).meta({ id: 'ReadinessData' });
export const readinessResponseSchema = z.object({
  success: z.literal(true),
  data: readinessDataSchema,
}).meta({ id: 'ReadinessResponse' });
export type ReadinessData = z.infer<typeof readinessDataSchema>;
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;

export const clientIds = ['pr-chat', 'pr-admin', 'pr-sso'] as const;
export type ClientId = typeof clientIds[number];

export const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: errorResponseSchema } },
});
export const corsResponses = { 403: errorResponse('来源不在跨域白名单') };
export const proxyResponses = {
  502: errorResponse('上游服务不可用'),
  504: errorResponse('上游请求超时'),
};

export function healthOperation(operationId: string, clients: readonly ClientId[]) {
  return {
    operationId,
    method: 'get',
    path: '/health',
    summary: '查询服务健康状态',
    exposure: 'public',
    clients,
    responses: {
      200: {
        description: '服务正常',
        content: { 'application/json': { schema: healthResponseSchema } },
      },
      400: errorResponse('JSON 格式错误'),
      413: errorResponse('请求体超过限制'),
      500: errorResponse('服务内部错误'),
    },
  } as const;
}

export function readinessOperation(operationId: string) {
  return {
    operationId,
    method: 'get',
    path: '/ready',
    summary: '查询服务与数据库就绪状态',
    exposure: 'internal',
    clients: [],
    responses: {
      200: {
        description: '服务就绪',
        content: { 'application/json': { schema: readinessResponseSchema } },
      },
      503: errorResponse('服务尚未就绪'),
      500: errorResponse('服务内部错误'),
    },
  } as const;
}

export type Operation = {
  operationId: string;
  method: 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options';
  path: string;
  exposure: 'public' | 'internal';
  clients: readonly ClientId[];
};

export function operationPath(service: { namespace: string }, operation: Pick<Operation, 'path'>) {
  return `${service.namespace}${operation.path}`;
}

export function fullPath(service: { namespace: string }, operation: Pick<Operation, 'path'>) {
  return `${API_PREFIX}${operationPath(service, operation)}`;
}

export function expressPath(route: string) {
  return route.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, ':$1');
}
