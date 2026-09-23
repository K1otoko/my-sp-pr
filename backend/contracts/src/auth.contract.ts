import { z } from 'zod';
import {
  authInteractionDataSchema, authSessionDataSchema, csrfInputSchema, errorResponse,
  healthOperation, loginInputSchema, logoutContextDataSchema, readinessOperation, resumeDataSchema,
} from './shared.js';

const success = <T extends z.ZodType>(schema: T) => ({
  description: '请求成功',
  content: { 'application/json': { schema: z.object({ success: z.literal(true), data: schema }) } },
});
const errors = {
  400: errorResponse('请求无效或流程过期'),
  401: errorResponse('凭证错误或未登录'),
  403: errorResponse('请求校验失败或无权访问'),
  409: errorResponse('该登录请求已处理'),
  413: errorResponse('请求体超过限制'),
  429: errorResponse('请求过于频繁'),
  500: errorResponse('服务内部错误'),
  503: errorResponse('身份服务暂不可用'),
};
const uidParams = z.object({ uid: z.string().regex(/^[A-Za-z0-9_-]{1,256}$/u) });
const jsonBody = (schema: z.ZodType) => ({
  required: true,
  content: { 'application/json': { schema } },
});

export const authContract = {
  service: 'pr-auth',
  namespace: '/auth',
  title: 'PR Auth API',
  apiContract: {
    getAuthHealth: healthOperation('getAuthHealth', ['pr-sso']),
    getAuthReadiness: readinessOperation('getAuthReadiness'),
    getAuthInteraction: {
      operationId: 'getAuthInteraction', method: 'get', path: '/interactions/{uid}',
      summary: '读取登录交互（Accept: application/json）', exposure: 'public', clients: ['pr-sso'],
      request: { params: uidParams },
      responses: { 200: success(authInteractionDataSchema), 303: { description: '浏览器导航至登录页' }, ...errors },
    },
    submitAuthLogin: {
      operationId: 'submitAuthLogin', method: 'post', path: '/interactions/{uid}/login',
      summary: '提交用户名密码', exposure: 'public', clients: ['pr-sso'],
      request: { params: uidParams, body: jsonBody(loginInputSchema) },
      responses: { 200: success(resumeDataSchema), ...errors },
    },
    getAuthSession: {
      operationId: 'getAuthSession', method: 'get', path: '/session',
      summary: '读取本站登录状态', exposure: 'public', clients: ['pr-sso'],
      responses: { 200: success(authSessionDataSchema), ...errors },
    },
    startAuthLogout: {
      operationId: 'startAuthLogout', method: 'post', path: '/logout',
      summary: '开始当前浏览器统一退出', exposure: 'public', clients: ['pr-sso'],
      request: { body: jsonBody(csrfInputSchema) },
      responses: { 200: success(resumeDataSchema), ...errors },
    },
    getAuthLogoutContext: {
      operationId: 'getAuthLogoutContext', method: 'get', path: '/logout/context/{id}',
      summary: '读取浏览器绑定的退出确认', exposure: 'public', clients: ['pr-sso'],
      request: { params: z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,256}$/u) }) },
      responses: { 200: success(logoutContextDataSchema), ...errors },
    },
    startAuthPortal: {
      operationId: 'startAuthPortal', method: 'get', path: '/portal/start',
      summary: '启动内置 OIDC 客户端（顶层导航）', exposure: 'public', clients: [],
      responses: { 302: { description: '跳转到固定 issuer 授权端点' }, ...errors },
    },
    completeAuthPortal: {
      operationId: 'completeAuthPortal', method: 'get', path: '/portal/callback',
      summary: '内置 OIDC 回调（顶层导航）', exposure: 'public', clients: [],
      responses: { 303: { description: '校验回调后跳转至本站页面' }, ...errors },
    },
  },
} as const;
