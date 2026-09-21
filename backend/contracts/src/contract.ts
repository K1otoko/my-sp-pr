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

export const clientIds = ['pr-chat', 'pr-admin', 'pr-sso'] as const;
export type ClientId = typeof clientIds[number];

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: errorResponseSchema } },
});
export const corsResponses = { 403: errorResponse('来源不在跨域白名单') };
export const proxyResponses = {
  502: errorResponse('上游服务不可用'),
  504: errorResponse('上游请求超时'),
};

function healthOperation(operationId: string, clients: readonly ClientId[]) {
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

// 所有接口只在此维护。request 可使用 { query, params, body } 的 Zod Schema。
// clients 仅控制 SDK 的生成范围，不是授权规则。
export const serviceContracts = {
  gateway: {
    service: 'gateway',
    namespace: '',
    title: 'Gateway 公开 API',
    apiContract: { getGatewayHealth: healthOperation('getGatewayHealth', clientIds) },
  },
  'pr-chat': {
    service: 'pr-chat',
    namespace: '/chat',
    title: 'PR Chat API',
    apiContract: { getChatHealth: healthOperation('getChatHealth', ['pr-chat']) },
  },
  'pr-auth': {
    service: 'pr-auth',
    namespace: '/auth',
    title: 'PR Auth API',
    apiContract: { getAuthHealth: healthOperation('getAuthHealth', ['pr-sso']) },
  },
  'pr-admin': {
    service: 'pr-admin',
    namespace: '/admin',
    title: 'PR Admin API',
    apiContract: { getAdminHealth: healthOperation('getAdminHealth', ['pr-admin']) },
  },
} as const;

export type ServiceId = keyof typeof serviceContracts;
export type ServiceContract = typeof serviceContracts[ServiceId];
export type Operation = {
  operationId: string;
  method: 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options';
  path: string;
  exposure: 'public' | 'internal';
  clients: readonly ClientId[];
};

export function operationPath(service: Pick<ServiceContract, 'namespace'>, operation: Pick<Operation, 'path'>) {
  return `${service.namespace}${operation.path}`;
}

export function fullPath(service: Pick<ServiceContract, 'namespace'>, operation: Pick<Operation, 'path'>) {
  return `${API_PREFIX}${operationPath(service, operation)}`;
}

export function expressPath(route: string) {
  return route.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, ':$1');
}
