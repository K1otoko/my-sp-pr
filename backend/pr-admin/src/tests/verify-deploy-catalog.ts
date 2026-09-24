import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import type { Server } from 'node:http';
import express from 'express';
import { apiContract } from '../api/index.js';
import { deployCatalogHandlers } from '../controllers/deploy-catalog.controller.js';
import { deployHandlers } from '../controllers/deploy.controller.js';
import { errorHandler } from '../middlewares/error-handler.js';
import { notFound } from '../middlewares/not-found.js';
import { deployRouter } from '../routes/deploy.routes.js';
import type { AdminAuthService } from '../services/admin-auth.service.js';
import type { DeployCatalogService } from '../services/deploy-catalog.service.js';
import type { DeploymentService } from '../services/deployment.service.js';

async function close(server: Server) {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

export async function verifyDeployCatalog(input: {
  root: string; auth: AdminAuthService; deployments: DeploymentService; catalog: DeployCatalogService;
  cookie: string; setRole: (role: 'super' | 'admin') => void;
  csrfToken: string; adminOrigin: string;
}) {
  const { auth, deployments, catalog } = input;
  const repositories = await catalog.listRepositories();
  assert.equal(repositories.length, 1);
  assert.equal(repositories[0]!.defaultBranch, 'master');
  assert.equal(repositories[0]!.installationId, '2');
  const targets = await catalog.listTargets();
  assert.equal(targets.length, 1);
  assert(targets[0]!.legacy && !targets[0]!.enabled && targets[0]!.agentStatus === 'pending');
  const releases = await catalog.listReleases({ limit: 100 });
  assert(releases.items.length >= 2);
  const success = releases.items.find((row) => row.status === 'succeeded')!;
  const detail = await catalog.getRelease(success.id);
  assert.equal(detail.items[0]?.status, 'succeeded');
  assert.equal(detail.items[0]?.currentDeploymentId, success.id);
  assert.equal(releases.items.find((row) => row.status === 'failed')?.failureCode, 'VERIFICATION_FAILURE');
  const allIds: string[] = [];
  let cursor: string | null = null;
  do {
    const page = await catalog.listAudit({ limit: 1, ...(cursor ? { cursor } : {}) });
    allIds.push(...page.items.map((row) => row.id));
    cursor = page.nextCursor;
  } while (cursor);
  const all = await catalog.listAudit({ limit: 100 });
  assert.deepEqual(allIds, all.items.map((row) => row.id));
  const firstPage = await catalog.listReleases({ limit: 1 });
  const secondPage = await catalog.listReleases({ limit: 1, cursor: firstPage.nextCursor! });
  assert.notEqual(firstPage.items[0]!.id, secondPage.items[0]!.id);
  const filtered = await catalog.listAudit({ limit: 100, outcome: 'failure', action: 'deploy.error' });
  assert.equal(filtered.items.length, 1);

  const app = express();
  app.use(express.json({ limit: '100kb' }));
  app.use(deployRouter(auth, deployHandlers(auth, deployments), deployCatalogHandlers(catalog)));
  app.use(notFound, errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  const upstream = `http://127.0.0.1:${address.port}`;
  const gateway = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
    const { app } = await import('./src/app.ts');
    const server = app.listen(0, '127.0.0.1', () => process.send({ port: server.address().port }));
    process.on('disconnect', () => { server.closeAllConnections(); server.close(); });
  `], {
    cwd: `${input.root}/backend/gateway`,
    env: {
      ...process.env, NODE_ENV: 'test', ADMIN_SERVICE_URL: upstream,
      CHAT_SERVICE_URL: 'http://127.0.0.1:1', AUTH_SERVICE_URL: 'http://127.0.0.1:1',
    },
    stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
  });
  const stopped = once(gateway, 'exit');
  try {
    const gatewayPort = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Gateway startup timeout')), 10_000);
      gateway.once('error', (error) => { clearTimeout(timer); reject(error); });
      gateway.once('exit', () => { clearTimeout(timer); reject(new Error('Gateway exited before readiness')); });
      gateway.once('message', (message: { port: number }) => { clearTimeout(timer); resolve(message.port); });
    });
    const origin = `http://127.0.0.1:${gatewayPort}`;
    const requests = [
      ['/api/admin/deploy/repositories/available', apiContract.listAvailableDeployRepositories],
      ['/api/admin/deploy/repositories', apiContract.listDeployRepositories],
      [`/api/admin/deploy/repositories/${repositories[0]!.id}`, apiContract.getDeployRepository],
      ['/api/admin/deploy/targets', apiContract.listDeployTargets],
      [`/api/admin/deploy/targets/${targets[0]!.id}`, apiContract.getDeployTarget],
      ['/api/admin/deploy/releases', apiContract.listDeployReleases],
      [`/api/admin/deploy/releases/${success.id}`, apiContract.getDeployRelease],
      ['/api/admin/deploy/audit', apiContract.listDeployAudit],
    ] as const;
    const request = (path: string, cookie = input.cookie) => fetch(`${origin}${path}`, {
      headers: cookie ? { cookie } : {}, signal: AbortSignal.timeout(10_000),
    });
    for (const [path, operation] of requests) {
      const response = await request(path);
      assert.equal(response.status, 200, path);
      const body = await response.json();
      assert(operation.responses[200].content['application/json'].schema.safeParse(body).success);
      assert(!/tokenHash|token_hash|accessToken|privateKey/u.test(JSON.stringify(body)));
      assert.equal((await request(path, '')).status, 401);
    }
    input.setRole('admin');
    for (const [path] of requests) assert.equal((await request(path)).status, 403);
    input.setRole('super');
    const post = (path: string, body: unknown, cookie = input.cookie, originValue = input.adminOrigin) => fetch(`${origin}${path}`, {
      method: 'POST',
      headers: { cookie, origin: originValue, 'content-type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(10_000),
    });
    for (const [path, operation, values] of [
      ['/api/admin/deploy/repositories/import', apiContract.importDeployRepository,
        { githubRepositoryId: '123', installationId: '2' }],
      [`/api/admin/deploy/repositories/${repositories[0]!.id}/sync`, apiContract.syncDeployRepository, {}],
    ] as const) {
      const body = { ...values, csrfToken: input.csrfToken };
      const response = await post(path, body);
      assert.equal(response.status, 200, path);
      assert(operation.responses[200].content['application/json'].schema.safeParse(await response.json()).success);
      assert.equal((await post(path, { ...body, csrfToken: 'invalid' })).status, 403);
      assert.equal((await post(path, body, '')).status, 401);
      assert.equal((await post(path, body, input.cookie, 'https://foreign.invalid')).status, 403);
      input.setRole('admin');
      assert.equal((await post(path, body)).status, 403);
      input.setRole('super');
    }
    assert.equal((await post('/api/admin/deploy/repositories/import', {
      csrfToken: input.csrfToken, githubRepositoryId: '999', installationId: '2',
    })).status, 403);
    assert.equal((await post('/api/admin/deploy/repositories/import', {
      csrfToken: input.csrfToken, githubRepositoryId: '../123', installationId: '2',
    })).status, 400);
    for (const path of [
      '/api/admin/deploy/targets/not-a-uuid',
      '/api/admin/deploy/audit?cursor=invalid',
      '/api/admin/deploy/releases?limit=101',
      '/api/admin/deploy/audit?from=2026-09-25T00:00:00Z&to=2026-09-24T00:00:00Z',
    ]) assert.equal((await request(path)).status, 400, path);
    assert.equal((await request('/api/admin/deploy/targets/33333333-3333-4333-8333-333333333333')).status, 404);
    assert.equal((await request('/api/admin/deploy/unimplemented')).status, 404);
    assert.equal((await request('/api/admin/ready')).status, 404);
    console.log('[admin-verify] PASS catalog pagination/filtering, Gateway HTTP contracts, super/admin/session authorization and errors.');
  } finally {
    input.setRole('super');
    await close(server);
    if (gateway.connected) gateway.disconnect();
    const timer = setTimeout(() => gateway.kill('SIGKILL'), 5_000);
    await stopped;
    clearTimeout(timer);
  }
}
