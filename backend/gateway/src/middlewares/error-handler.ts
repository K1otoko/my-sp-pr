import type { ErrorRequestHandler } from 'express';
import { errorResponseSchema, serviceContract, type ErrorResponse } from '../api/index.js';
import { AppError } from '../utils/app-error.js';

export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }
  let failure: AppError;
  if (error instanceof AppError) {
    failure = error;
  } else if (error && typeof error === 'object' && 'type' in error && error.type === 'entity.parse.failed') {
    failure = new AppError(400, 'INVALID_JSON', '请求体不是有效的 JSON');
  } else if (error && typeof error === 'object' && 'type' in error && error.type === 'entity.too.large') {
    failure = new AppError(413, 'PAYLOAD_TOO_LARGE', '请求体不能超过 100kb');
  } else {
    failure = new AppError(500, 'INTERNAL_ERROR', '服务暂时不可用，请稍后重试');
  }
  response.locals.errorCode = failure.code;
  if (failure.statusCode >= 500) console.error(`[${serviceContract.service}] 未处理的服务错误：`, {
    requestId: response.locals.requestId,
    code: failure.code,
    type: error instanceof Error ? error.name : 'UnknownError',
  });
  const payload: ErrorResponse = {
    success: false,
    error: { code: failure.code, message: failure.message },
  };
  response.status(failure.statusCode).json(errorResponseSchema.parse(payload));
};
