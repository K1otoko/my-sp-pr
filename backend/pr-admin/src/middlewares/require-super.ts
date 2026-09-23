import type { RequestHandler } from 'express';
import { AppError } from '../utils/app-error.js';
import { adminPrincipal } from './require-auth.js';

export const requireSuper: RequestHandler = (_request, response, next) => {
  if (adminPrincipal(response).user.role !== 'super') {
    next(new AppError(403, 'FORBIDDEN', '只有超级管理员可以访问发布模块'));
    return;
  }
  next();
};
