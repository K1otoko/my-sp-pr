import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { Request, Response } from 'express';
import { env } from '../config/env.js';
import { database, db } from '../db/index.js';
import { verifyGitHubWebhook } from '../github/webhook.js';
import { requireSuper } from '../middlewares/require-super.js';
import { adminSessionRepository } from '../repositories/admin-session.repository.js';
import { deployRepository } from '../repositories/deploy.repository.js';
import { adminAuthService } from '../services/admin-auth.service.js';
import { deploymentService } from '../services/deployment.service.js';
import { AppError } from '../utils/app-error.js';
import type { AdminOidcClient } from '../auth/oidc-client.js';
import { deployCatalogRepository } from '../repositories/deploy-catalog.repository.js';
import { deployCatalogService } from '../services/deploy-catalog.service.js';
import { verifyDeployCatalog } from './verify-deploy-catalog.js';
import { githubFixture, verifyRepositories } from './verify-github-repositories.js';
import { verifyManifest } from './verify-manifest.js';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const actor = {
  id: '11111111-1111-4111-8111-111111111111',
  username: 'owner',
  displayName: 'Owner',
  role: 'super' as const,
};

async function verify(fixture: Awaited<ReturnType<typeof githubFixture>>) {
  assert(process.env.ADMIN_VERIFY_DATABASE?.startsWith('my_sp_pr_verify_admin_'));
  await database.checkReady();
  await verifyManifest(root);

  const commit = {
    sha: 'a'.repeat(40),
    url: 'https://github.com/example/my-sp-pr/commit/a',
    message: 'verified commit',
  };
  const { client: github, config: githubConfig } = fixture;
  const repository = deployRepository(db);
  const service = deploymentService(repository, github, githubConfig);
  const synchronized = await service.synchronize(actor, '22222222-2222-4222-8222-222222222222');
  assert.equal(synchronized.synchronized, 7);
  const project = (await service.listProjects()).find((item) => item.slug === 'pr-admin-web')!;
  const environment = await service.createEnvironment(project.id, {
    name: 'staging',
    githubEnvironmentName: 'pr-admin-web-staging',
    runnerTarget: 'staging',
    publicOrigin: 'https://admin.example.com',
    healthUrl: 'https://admin.example.com/release.json',
    allowedBranches: ['master'],
    allowedTagPattern: 'v*',
    production: false,
    migrationsAllowed: false,
  }, actor, '33333333-3333-4333-8333-333333333333');
  assert.equal((await service.configuration(environment.id)).complete, true);
  const deployment = await service.createDeployment({
    projectId: project.id,
    environmentId: environment.id,
    ref: 'master',
    runMigration: false,
    actor,
    requestId: '44444444-4444-4444-8444-444444444444',
  });
  assert.equal(deployment.resolvedSha, commit.sha);
  await assert.rejects(() => service.createDeployment({
    projectId: project.id,
    environmentId: environment.id,
    ref: 'master',
    runMigration: false,
    actor,
    requestId: '55555555-5555-4555-8555-555555555555',
  }), (error: unknown) => error instanceof AppError && error.code === 'DEPLOYMENT_CONFLICT');

  const webhookBody = Buffer.from(JSON.stringify({
    deployment_status: { id: 71, state: 'success', description: 'healthy', log_url: 'https://github.com/run/1' },
    deployment: {
      id: Number(deployment.githubDeploymentId),
      environment: environment.githubEnvironmentName,
      sha: commit.sha,
      payload: {
        deploymentId: deployment.id,
        unitId: project.unitId,
        environment: environment.githubEnvironmentName,
        migration: false,
      },
    },
    repository: { id: 123, full_name: 'example/my-sp-pr', owner: { login: 'example' } },
  }));
  const signature = `sha256=${createHmac('sha256', githubConfig.webhookSecret).update(webhookBody).digest('hex')}`;
  const event = verifyGitHubWebhook(githubConfig, {
    signature,
    delivery: 'delivery-1',
    event: 'deployment_status',
  }, webhookBody);
  await service.receiveEvent(event);
  await service.receiveEvent(event);
  await assert.rejects(() => service.receiveEvent({ ...event, installationId: '3' }),
    (error: unknown) => error instanceof AppError && error.code === 'WEBHOOK_INVALID');
  await assert.rejects(() => service.receiveEvent({ ...event, repositoryFullName: 'example/other' }),
    (error: unknown) => error instanceof AppError && error.code === 'WEBHOOK_INVALID');
  assert.equal((await service.getDeployment(deployment.id)).status, 'succeeded');
  await service.receiveEvent({ ...event, deliveryId: 'late-queued', githubStatusId: '72', status: 'queued' });
  assert.equal((await service.getDeployment(deployment.id)).status, 'succeeded');
  const rollback = await service.rollback({
    deploymentId: deployment.id, confirmation: project.slug, actor, requestId: 'verify-rollback',
  });
  await repository.markError(rollback.id, 'verification', 'VERIFICATION_FAILURE');
  assert.throws(() => verifyGitHubWebhook(githubConfig, {
    signature: 'sha256=invalid',
    delivery: 'delivery-2',
    event: 'deployment_status',
  }, webhookBody), (error: unknown) => error instanceof AppError && error.code === 'WEBHOOK_INVALID');
  console.log('[admin-verify] PASS manifest sync, fixed SHA, concurrency, webhook signature and replay.');

  const sessions = adminSessionRepository(db, env);
  const binding = 'b'.repeat(43);
  const state = 'state-value';
  const flow = await sessions.createFlow({
    state,
    nonce: 'nonce-value',
    verifier: 'verifier-value',
    binding,
    returnPath: '/deploy/projects',
  });
  assert(await sessions.consumeFlow({ token: flow, state, binding }));
  assert.equal(await sessions.consumeFlow({ token: flow, state, binding }), undefined);
  let role: 'super' | 'admin' | 'user' = 'super';
  const oidc = {
    identity: async () => {
      if (role === 'user') throw new AppError(403, 'FORBIDDEN', 'denied');
      return { ...actor, role };
    },
    refresh: async () => ({
      access_token: 'refreshed-access',
      refresh_token: 'refreshed-refresh',
      id_token: 'refreshed-id',
      expiresIn: () => 300,
    }),
    isRejected: () => false,
  } as unknown as AdminOidcClient;
  const auth = adminAuthService(env, sessions, oidc);
  const sessionToken = await sessions.createSession({
    user: actor,
    binding,
    accessToken: 'expired-access',
    refreshToken: 'refresh',
    idToken: 'id',
    accessTokenExpiresAt: new Date(Date.now() + 1000),
    absoluteExpiresAt: new Date(Date.now() + 3600_000),
  });
  const request = {
    headers: { cookie: `dev_admin_session=${sessionToken}; dev_admin_binding=${binding}` },
  } as Request;
  const response = { appendHeader() {} } as unknown as Response;
  const principal = await auth.readSession(request, response);
  assert.equal(principal?.user.role, 'super');
  (request.headers as Record<string, string>).origin = env.adminOrigin;
  auth.verifyCsrf(request, principal!, auth.csrf(principal!));
  await verifyDeployCatalog({
    root, auth, deployments: service, catalog: deployCatalogService(deployCatalogRepository(db)),
    csrfToken: auth.csrf(principal!), adminOrigin: env.adminOrigin,
    cookie: request.headers.cookie!, setRole: (nextRole) => { role = nextRole; },
  });
  role = 'user';
  assert.equal(await auth.readSession(request, response), undefined);

  let middlewareError: unknown;
  requireSuper({} as Request, {
    locals: { adminPrincipal: { user: { role: 'admin' } } },
  } as unknown as Response, (error?: unknown) => { middlewareError = error; });
  assert(middlewareError instanceof AppError && middlewareError.statusCode === 403);
  console.log('[admin-verify] PASS one-use flow, refresh rotation, online role revocation, CSRF and super authorization.');
  await verifyRepositories(fixture, actor);
}

let fixture: Awaited<ReturnType<typeof githubFixture>> | undefined;
try {
  fixture = await githubFixture(root);
  await verify(fixture);
} catch (error) {
  console.error('[admin-verify] FAIL', error instanceof Error ? error.name : 'UnknownError');
  if (error instanceof Error) console.error(error.stack?.split('\n').find((line) => /^\s+at /u.test(line)));
  process.exitCode = 1;
} finally {
  await fixture?.close();
  await database.close();
}
