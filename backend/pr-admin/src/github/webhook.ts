import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { env } from '../config/env.js';
import { AppError } from '../utils/app-error.js';

type GitHubConfig = NonNullable<typeof env.github>;

const payloadSchema = z.object({
  deployment_status: z.object({
    id: z.number().int().positive(),
    state: z.enum(['pending', 'queued', 'in_progress', 'success', 'failure', 'error', 'inactive']),
    description: z.string().nullable().optional(),
    log_url: z.url().nullable().optional(),
    target_url: z.url().nullable().optional(),
  }),
  deployment: z.object({
    id: z.number().int().positive(),
    environment: z.string(),
    sha: z.string().regex(/^[0-9a-f]{40}$/u),
    payload: z.union([z.object({
      deploymentId: z.uuid(),
      unitId: z.string(),
      environment: z.string(),
      migration: z.boolean(),
      rollbackOf: z.string().optional(),
    }), z.string()]),
  }),
  repository: z.object({
    id: z.number().int().positive(),
    full_name: z.string(),
    owner: z.object({ login: z.string() }),
  }),
});

const statusMap = {
  pending: 'queued',
  queued: 'queued',
  in_progress: 'in_progress',
  success: 'succeeded',
  failure: 'failed',
  error: 'error',
  inactive: 'inactive',
} as const;

function constantEqual(leftValue: string, rightValue: string) {
  const left = Buffer.from(leftValue);
  const right = Buffer.from(rightValue);
  return left.length === right.length && timingSafeEqual(left, right);
}

function cleanText(value: string | null | undefined) {
  return value ? Array.from(value).filter((character) => character.charCodeAt(0) >= 32).join('').slice(0, 500) : null;
}

export function verifyGitHubWebhook(
  config: GitHubConfig,
  headers: { signature?: string; delivery?: string; event?: string },
  body: Buffer,
) {
  if (headers.event !== 'deployment_status' || !headers.delivery
    || !/^[A-Za-z0-9-]{1,128}$/u.test(headers.delivery)) {
    throw new AppError(400, 'WEBHOOK_INVALID', 'GitHub webhook 事件无效');
  }
  const expected = `sha256=${createHmac('sha256', config.webhookSecret).update(body).digest('hex')}`;
  if (!headers.signature || !constantEqual(headers.signature, expected)) {
    throw new AppError(403, 'WEBHOOK_INVALID', 'GitHub webhook 签名无效');
  }
  let json: unknown;
  try {
    json = JSON.parse(body.toString('utf8'));
  } catch {
    throw new AppError(400, 'WEBHOOK_INVALID', 'GitHub webhook 内容无效');
  }
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success || typeof parsed.data.deployment.payload === 'string') {
    throw new AppError(400, 'WEBHOOK_INVALID', 'GitHub webhook 内容无效');
  }
  if (parsed.data.repository.full_name.toLowerCase() !== config.repository.toLowerCase()
    || !config.allowedOwners.has(parsed.data.repository.owner.login.toLowerCase())) {
    throw new AppError(403, 'WEBHOOK_INVALID', 'GitHub webhook 仓库不匹配');
  }
  return {
    deliveryId: headers.delivery,
    repositoryId: String(parsed.data.repository.id),
    githubDeploymentId: String(parsed.data.deployment.id),
    githubStatusId: String(parsed.data.deployment_status.id),
    localDeploymentId: parsed.data.deployment.payload.deploymentId,
    unitId: parsed.data.deployment.payload.unitId,
    environment: parsed.data.deployment.payload.environment,
    sha: parsed.data.deployment.sha,
    status: statusMap[parsed.data.deployment_status.state],
    description: cleanText(parsed.data.deployment_status.description),
    logUrl: parsed.data.deployment_status.log_url ?? parsed.data.deployment_status.target_url ?? null,
  };
}
