import type { Response } from 'express';
import { errorResponseSchema } from '../api/index.js';

export function proxyError(response: Response, timeout: boolean) {
  const code = timeout ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNAVAILABLE';
  response.locals.errorCode = code;
  if (response.destroyed || response.writableEnded) return;
  if (response.headersSent) {
    response.destroy();
    return;
  }
  response.status(timeout ? 504 : 502).json(errorResponseSchema.parse({
    success: false,
    error: {
      code,
      message: timeout ? '上游请求超时，请重试' : '上游服务暂时不可用，请稍后重试',
    },
  }));
}
