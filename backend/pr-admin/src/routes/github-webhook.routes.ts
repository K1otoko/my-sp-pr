import express, { Router } from 'express';
import { apiContract, expressPath, fullPath, serviceContract } from '../api/index.js';
import type { githubWebhookHandler } from '../controllers/github-webhook.controller.js';

export function githubWebhookRouter(handler: ReturnType<typeof githubWebhookHandler>) {
  const router = Router();
  const operation = apiContract.receiveGitHubDeploymentEvent;
  router[operation.method](
    expressPath(fullPath(serviceContract, operation)),
    express.raw({ type: 'application/json', limit: '100kb' }),
    handler,
  );
  return router;
}
