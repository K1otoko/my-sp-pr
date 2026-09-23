import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { serviceContract } from '../api/index.js';

export const requestContext: RequestHandler = (request, response, next) => {
  const requestId = randomUUID();
  request.headers['x-request-id'] = requestId;
  // Express 根据配置的可信入口解析 IP，随后清除所有外部代理元数据。
  response.locals.clientIp = request.ip ?? request.socket.remoteAddress;
  for (const header of Object.keys(request.headers)) {
    if (['x-user-id', 'x-roles', 'x-permissions', 'forwarded', 'x-real-ip'].includes(header)
      || header.startsWith('x-forwarded-')) delete request.headers[header];
  }
  response.locals.requestId = requestId;
  response.setHeader('X-Request-Id', requestId);
  const start = performance.now();
  response.once('close', () => {
    console.log(JSON.stringify({
      service: serviceContract.service,
      target: response.locals.targetService ?? serviceContract.service,
      requestId,
      method: request.method,
      path: request.path,
      status: response.statusCode,
      durationMs: Math.round(performance.now() - start),
      error: response.locals.errorCode ?? (response.writableFinished ? undefined : 'CLIENT_ABORTED'),
    }));
  });
  next();
};
