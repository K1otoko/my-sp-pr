import express, { type RequestHandler } from 'express';
import { authProtocolRoutes, matchesProtocolPath } from './api/index.js';
import type { AuthConfig } from './config/auth.js';
import { authHandlers } from './controllers/auth.controller.js';
import { errorHandler } from './middlewares/error-handler.js';
import { notFound } from './middlewares/not-found.js';
import { requestContext } from './middlewares/request-context.js';
import { createProvider } from './oidc/provider.js';
import type { AuthStore } from './repositories/auth-store.js';
import { authRouter } from './routes/auth.routes.js';
import { AppError } from './utils/app-error.js';

export function createApp(config: AuthConfig, store: AuthStore, statusRouter: RequestHandler) {
  const app = express();
  const provider = createProvider(config, store);
  const callback = provider.callback();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustedGatewayCidrs);
  app.use(requestContext);
  app.use((request, response, next) => {
    const protocol = authProtocolRoutes.some((route) =>
      (route.method === request.method.toLowerCase() || (route.method === 'get' && request.method === 'HEAD'))
      && matchesProtocolPath(route.path, request.path));
    const identity = protocol || (request.path.startsWith('/api/auth/')
      && !['/api/auth/health', '/api/auth/ready'].includes(request.path));
    if (identity) {
      response.set({
        'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
        'X-Frame-Options': 'DENY', 'Content-Security-Policy': "frame-ancestors 'none'",
      });
      const trusted = app.get('trust proxy fn') as (ip: string, hop: number) => boolean;
      if (!trusted(request.socket.remoteAddress ?? '', 0) || request.get('host') !== new URL(config.origin).host) {
        next(new AppError(403, 'FORBIDDEN', '请通过登录站点访问身份服务'));
        return;
      }
    }
    if (protocol) void callback(request, response);
    else next();
  });
  app.use(express.json({ limit: '100kb' }));
  app.use(statusRouter);
  app.use(authRouter(authHandlers(config, store, provider)));
  app.use(notFound);
  app.use(errorHandler);
  return { app, provider };
}
