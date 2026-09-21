import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { serviceContract } from '../api/index.js';

export const requestContext: RequestHandler = (request, response, next) => {
  const requestId = randomUUID();
  request.headers['x-request-id'] = requestId;
  for (const header of ['x-user-id', 'x-roles', 'x-permissions']) delete request.headers[header];
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
