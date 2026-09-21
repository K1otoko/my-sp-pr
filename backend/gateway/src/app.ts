import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { errorHandler } from './middlewares/error-handler.js';
import { notFound } from './middlewares/not-found.js';
import { requestContext } from './middlewares/request-context.js';
import { router } from './routes/index.js';
import { registerProxies } from './proxy/register-proxies.js';
import { AppError } from './utils/app-error.js';

export const app = express();
app.disable('x-powered-by');
app.use(requestContext);
app.use(cors({
  origin(origin, callback) {
    if (!origin || env.corsOrigins.has(origin)) callback(null, true);
    else callback(new AppError(403, 'CORS_FORBIDDEN', '当前来源不在跨域白名单中'));
  },
  credentials: false,
  exposedHeaders: ['X-Request-Id'],
}));
app.use(router);
registerProxies(app);
app.use(notFound);
app.use(errorHandler);
