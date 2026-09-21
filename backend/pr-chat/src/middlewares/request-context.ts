import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { serviceContract } from '../api/index.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export const requestContext: RequestHandler = (request, response, next) => {
  const incoming = request.get('x-request-id');
  const requestId = incoming && uuid.test(incoming) ? incoming : randomUUID();
  response.locals.requestId = requestId;
  response.setHeader('X-Request-Id', requestId);
  const start = performance.now();
  response.once('close', () => {
    console.log(JSON.stringify({
      service: serviceContract.service,
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
