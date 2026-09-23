import type { RequestHandler } from 'express';
import { apiContract } from '../api/index.js';
import type { env } from '../config/env.js';
import { verifyGitHubWebhook } from '../github/webhook.js';
import type { DeploymentService } from '../services/deployment.service.js';
import { AppError } from '../utils/app-error.js';

export function githubWebhookHandler(
  githubConfig: typeof env.github,
  deployments: DeploymentService,
): RequestHandler {
  return async (request, response) => {
    if (!githubConfig) throw new AppError(503, 'CONFIGURATION_INCOMPLETE', 'GitHub App 尚未配置');
    if (!Buffer.isBuffer(request.body)) throw new AppError(400, 'WEBHOOK_INVALID', 'GitHub webhook 内容无效');
    const event = verifyGitHubWebhook(githubConfig, {
      signature: request.get('x-hub-signature-256'),
      delivery: request.get('x-github-delivery'),
      event: request.get('x-github-event'),
    }, request.body);
    response.json(apiContract.receiveGitHubDeploymentEvent.responses[200].content['application/json'].schema.parse({
      success: true,
      data: await deployments.receiveEvent(event),
    }));
  };
}
