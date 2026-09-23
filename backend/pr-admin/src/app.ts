import express from 'express';
import { errorHandler } from './middlewares/error-handler.js';
import { notFound } from './middlewares/not-found.js';
import { requestContext } from './middlewares/request-context.js';
import { router, webhookRouter } from './routes/index.js';

export const app = express();
app.disable('x-powered-by');
app.use(requestContext);
app.use(webhookRouter);
app.use(express.json({ limit: '100kb' }));
app.use(router);
app.use(notFound);
app.use(errorHandler);
