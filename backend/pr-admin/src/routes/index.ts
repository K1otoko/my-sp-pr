import { Router } from 'express';
import { adminOidcClient } from '../auth/oidc-client.js';
import { env } from '../config/env.js';
import { adminAuthHandlers } from '../controllers/auth.controller.js';
import { deployHandlers } from '../controllers/deploy.controller.js';
import { deployCatalogHandlers } from '../controllers/deploy-catalog.controller.js';
import { githubWebhookHandler } from '../controllers/github-webhook.controller.js';
import { db } from '../db/index.js';
import { githubApp } from '../github/github-app.js';
import { githubClient } from '../github/github-client.js';
import { adminSessionRepository } from '../repositories/admin-session.repository.js';
import { deployRepository } from '../repositories/deploy.repository.js';
import { deployCatalogRepository } from '../repositories/deploy-catalog.repository.js';
import { adminAuthService } from '../services/admin-auth.service.js';
import { deploymentService } from '../services/deployment.service.js';
import { deployCatalogService } from '../services/deploy-catalog.service.js';
import { authRouter } from './auth.routes.js';
import { deployRouter } from './deploy.routes.js';
import { githubWebhookRouter } from './github-webhook.routes.js';
import { healthRouter } from './health.routes.js';
import { readinessRouter } from './readiness.routes.js';

export const auth = adminAuthService(env, adminSessionRepository(db, env), adminOidcClient(env));
const github = env.github ? githubClient(env.github, githubApp(env.github)) : undefined;
export const deployment = deploymentService(deployRepository(db), github, env.github);
export const webhookRouter = githubWebhookRouter(githubWebhookHandler(env.github, deployment));
export const router = Router();
router.use(healthRouter);
router.use(readinessRouter);
router.use(authRouter(adminAuthHandlers(auth)));
router.use(deployRouter(
  auth, deployHandlers(auth, deployment), deployCatalogHandlers(deployCatalogService(deployCatalogRepository(db))),
));
