import cors from 'cors';
import type { RequestHandler } from 'express';
import { authProtocolRoutes, matchesProtocolPath } from '../api/index.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/app-error.js';

const ordinaryCors = cors({
  origin(origin, callback) {
    if (!origin || env.corsOrigins.has(origin)) callback(null, true);
    else callback(new AppError(403, 'CORS_FORBIDDEN', '当前来源不在跨域白名单中'));
  },
  credentials: false, exposedHeaders: ['X-Request-Id'],
});
const publicCors = cors({ origin: '*', credentials: false, methods: ['GET', 'HEAD', 'OPTIONS'] });
export const browserAccess: RequestHandler = (request, response, next) => {
  const method = request.method === 'OPTIONS' ? request.get('access-control-request-method')?.toLowerCase()
    : request.method === 'HEAD' ? 'get' : request.method.toLowerCase();
  const protocol = authProtocolRoutes.find((route) => route.method === method && matchesProtocolPath(route.path, request.path));
  const identity = Boolean(protocol) || (request.path.startsWith('/api/auth/')
    && !['/api/auth/health', '/api/auth/ready'].includes(request.path));
  if (identity && env.nodeEnv === 'production' && request.get('host') !== new URL(env.ssoOrigin).host) {
    next(new AppError(403, 'CORS_FORBIDDEN', '身份服务入口不匹配'));
    return;
  }
  const origin = request.get('origin');
  if (protocol?.access === 'public-read') {
    publicCors(request, response, next);
    return;
  }
  if (protocol?.access === 'navigation') {
    if (request.method === 'OPTIONS') response.sendStatus(403);
    else next();
    return;
  }
  if (protocol?.access === 'server') {
    if (origin || request.method === 'OPTIONS') next(new AppError(403, 'CORS_FORBIDDEN', '此协议端点仅供后端客户端调用'));
    else next();
    return;
  }
  const navigation = request.method === 'GET' && (
    request.path === '/api/auth/portal/start' || request.path === '/api/auth/portal/callback'
    || (/^\/api\/auth\/interactions\/[A-Za-z0-9_-]+$/u.test(request.path) && !request.get('accept')?.includes('application/json'))
  );
  if (navigation) {
    next();
    return;
  }
  if (identity) {
    if (origin && origin !== env.ssoOrigin) next(new AppError(403, 'CORS_FORBIDDEN', '身份请求必须来自登录站点'));
    else if (request.method === 'OPTIONS') response.sendStatus(204);
    else next();
    return;
  }
  ordinaryCors(request, response, next);
};
