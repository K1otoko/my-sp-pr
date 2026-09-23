import express from 'express';
import { env } from './config/env.js';
import { browserAccess } from './middlewares/browser-access.js';
import { errorHandler } from './middlewares/error-handler.js';
import { notFound } from './middlewares/not-found.js';
import { requestContext } from './middlewares/request-context.js';
import { router } from './routes/index.js';
import { registerProxies } from './proxy/register-proxies.js';

export const app = express();
app.disable('x-powered-by');
app.set('trust proxy', env.trustedProxyCidrs);
app.use(requestContext);
app.use(browserAccess);
app.use(router);
registerProxies(app);
app.use(notFound);
app.use(errorHandler);
