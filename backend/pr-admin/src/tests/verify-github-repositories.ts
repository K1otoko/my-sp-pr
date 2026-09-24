import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { deployProjects, deployRepositories } from '../db/schema/index.js';
import { githubApp } from '../github/github-app.js';
import { githubClient } from '../github/github-client.js';
import { deployRepository } from '../repositories/deploy.repository.js';
import { deploymentService } from '../services/deployment.service.js';
import { AppError } from '../utils/app-error.js';
import type { AdminIdentity } from '../auth/oidc-client.js';

export async function githubFixture(root: string) {
  const directory = await mkdtemp(`${root}/.deploy/github-verify-`);
  const privateKeyFile = `${directory}/app.pem`;
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  await writeFile(privateKeyFile, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  const source = await readFile(`${root}/deploy.manifest.json`, 'utf8');
  const manifests = new Map([['my-sp-pr', source], ['second', source], ['third', source]]);
  const records = [
    { id: 123, name: 'my-sp-pr', installation: '2' },
    { id: 124, name: 'second', installation: '2' },
    { id: 125, name: 'third', installation: '3' },
  ];
  const metadata = (id: number, name: string) => ({
    id, full_name: `example/${name}`, default_branch: 'master',
    html_url: `https://github.com/example/${name}`, owner: { login: 'example' },
  });
  const requests: { path: string; authorization: string }[] = [];
  const tokenCalls = new Map<string, number>();
  let deploymentCount = 9000;
  let missingWorkflow = false;
  const server = createServer((request, response) => {
    const url = new URL(request.url!, 'http://localhost');
    const path = url.pathname;
    const authorization = request.headers.authorization ?? '';
    requests.push({ path: `${path}${url.search}`, authorization });
    const send = (body: unknown, status = 200) => {
      response.writeHead(status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(body));
    };
    if (path === '/app/installations') return send([
      { id: 2, account: { login: 'example' }, suspended_at: null },
      { id: 3, account: { login: 'example' }, suspended_at: null },
      { id: 4, account: { login: 'denied' }, suspended_at: null },
      { id: 5, account: { login: 'example' }, suspended_at: '2026-01-01T00:00:00Z' },
    ]);
    const tokenId = /^\/app\/installations\/([0-9]+)\/access_tokens$/u.exec(path)?.[1];
    if (tokenId) {
      tokenCalls.set(tokenId, (tokenCalls.get(tokenId) ?? 0) + 1);
      return send({ token: `fixture-installation-${tokenId}`, expires_at: new Date(Date.now() + 3600_000).toISOString() });
    }
    if (path === '/installation/repositories') {
      if (authorization === 'Bearer fixture-installation-3') return send({ repositories: [metadata(125, 'third')] });
      if (authorization !== 'Bearer fixture-installation-2') return send({}, 403);
      // Exactly 100 entries requires the client to request page 2.
      return send({ repositories: url.searchParams.get('page') === '1'
        ? [metadata(123, 'my-sp-pr'), ...Array.from({ length: 99 }, (_, i) => metadata(1000 + i, `extra-${i}`))]
        : [metadata(124, 'second')] });
    }
    const name = path.split('/')[3];
    const record = records.find((item) => item.name === name);
    if (!record || authorization !== `Bearer fixture-installation-${record.installation}`) return send({}, 404);
    if (path === `/repos/example/${name}`) return send(metadata(record.id, record.name));
    if (path.includes('/commits/')) {
      if (path.endsWith('/missing')) return send({}, 404);
      return send({
        sha: 'a'.repeat(40), html_url: `https://github.com/example/${name}/commit/a`,
        commit: { message: 'verified commit' },
      });
    }
    if (path.endsWith('/contents/deploy.manifest.json')) return response.end(manifests.get(name!));
    if (path.endsWith('/contents/.github/workflows/deploy.yml')) {
      if (missingWorkflow) return send({}, 404);
      return response.end('name: Deploy\non:\n  deployment:\n');
    }
    if (path.endsWith('/branches')) return send([{ name: 'master', commit: { sha: 'a'.repeat(40) } }]);
    if (path.endsWith('/tags')) return send([]);
    if (path.includes('/environments/missing')) return send({}, 404);
    if (path.endsWith('/variables')) return send({ variables: [] });
    if (path.endsWith('/secrets')) return send({ secrets: [] });
    if (path.includes('/environments/')) return send({ name: path.split('/').at(-1) });
    if (path.endsWith('/deployments') && request.method === 'POST') return send({ id: ++deploymentCount });
    return send({}, 404);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  const config = {
    apiOrigin: `http://127.0.0.1:${address.port}`, appId: 1, privateKeyFile,
    installationId: 2, repository: 'example/my-sp-pr', allowedOwners: new Set(['example']),
    runnerTargets: new Set(['staging', 'production']), webhookSecret: 'verification-webhook-secret-value-123456',
  };
  let clock = Date.now();
  const app = githubApp(config, () => new Date(clock));
  const client = githubClient(config, app);
  return {
    config, client, manifests, requests, tokenCalls,
    setMissingWorkflow: (value: boolean) => { missingWorkflow = value; },
    async verifyTokenCache() {
      await Promise.all([app.token('2'), app.token('2'), app.token('3'), app.token('3')]);
      assert.equal(tokenCalls.get('2'), 1);
      assert.equal(tokenCalls.get('3'), 1);
      assert(!tokenCalls.has('4'));
      clock += 3600_000;
      await Promise.all([app.token('2'), app.token('2')]);
      assert.equal(tokenCalls.get('2'), 2);
      clock = Date.now();
    },
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await rm(directory, { recursive: true, force: true });
    },
  };
}

export async function verifyRepositories(fixture: Awaited<ReturnType<typeof githubFixture>>, actor: AdminIdentity) {
  const repository = deployRepository(db);
  const service = deploymentService(repository, fixture.client, fixture.config);
  const rejects = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;
  await fixture.verifyTokenCache();
  const available = await service.availableRepositories();
  assert(available.some((item) => item.githubRepositoryId === '124'));
  assert(available.some((item) => item.installationId === '3'));
  await assert.rejects(() => service.importRepository({
    githubRepositoryId: '124', installationId: '3',
  }, actor, 'denied-import'), rejects('FORBIDDEN'));
  await assert.rejects(() => service.importRepository({
    githubRepositoryId: '999', installationId: '2',
  }, actor, 'invisible-import'), rejects('FORBIDDEN'));
  assert.throws(() => fixture.client.forRepository({
    fullName: 'denied/repo', installationId: '4',
  }), rejects('FORBIDDEN'));

  const imported = await service.importRepository({ githubRepositoryId: '124', installationId: '2' }, actor, 'import-second');
  const second = (await service.listProjects()).filter((project) => project.repositoryFullName === 'example/second');
  assert.equal(second.length, 7);
  assert(second.every((project) => project.defaultRef === 'master' && project.slug.startsWith('r124-')));
  assert.equal((await db.select().from(deployProjects).where(eq(deployProjects.id, second[0]!.id)))[0]!.defaultRef, null);
  assert.equal((await service.refs(second[0]!.id)).defaultBranch, 'master');
  const source = fixture.manifests.get('second')!;
  const malformed = JSON.parse(source);
  malformed.units[0].defaultRef = 'missing';
  fixture.manifests.set('second', JSON.stringify(malformed));
  const before = await repository.getRepository(imported.repositoryId);
  await assert.rejects(() => service.synchronizeRepository(imported.repositoryId, actor, 'missing-ref'), rejects('REF_NOT_ALLOWED'));
  assert.deepEqual(await repository.getRepository(imported.repositoryId), before);
  malformed.units[0].defaultRef = 'master';
  malformed.units[0].dependencies = ['unknown-unit'];
  fixture.manifests.set('second', JSON.stringify(malformed));
  await assert.rejects(() => service.synchronizeRepository(imported.repositoryId, actor, 'bad-manifest'), rejects('MANIFEST_INVALID'));
  assert.deepEqual(await repository.getRepository(imported.repositoryId), before);
  fixture.manifests.set('second', source);
  fixture.setMissingWorkflow(true);
  await assert.rejects(() => service.synchronizeRepository(imported.repositoryId, actor, 'missing-workflow'), rejects('NOT_FOUND'));
  fixture.setMissingWorkflow(false);

  // Force the second insert to fail after the catalog and first unit insert; the transaction must roll everything back.
  const collision = second[0]!;
  await db.update(deployProjects).set({ slug: 'r125-pr-admin-web' }).where(eq(deployProjects.id, collision.id));
  await assert.rejects(() => service.importRepository({
    githubRepositoryId: '125', installationId: '3',
  }, actor, 'atomic-import'), rejects('DEPLOYMENT_CONFLICT'));
  assert.equal(await repository.repositoryByGithubId('125'), undefined);
  assert.equal((await db.select().from(deployProjects).where(eq(deployProjects.repositoryId, '125'))).length, 0);
  await db.update(deployProjects).set({ slug: collision.slug }).where(eq(deployProjects.id, collision.id));
  const catalogConfig = { ...fixture.config, repository: undefined, installationId: undefined };
  const catalogService = deploymentService(repository, githubClient(catalogConfig, githubApp(catalogConfig)), catalogConfig);
  await assert.rejects(() => catalogService.synchronize(actor, 'no-bootstrap'), rejects('CONFIGURATION_INCOMPLETE'));
  await catalogService.importRepository({ githubRepositoryId: '125', installationId: '3' }, actor, 'import-third');
  const thirdWeb = (await service.listProjects()).find((project) => project.slug === 'r125-pr-admin-web')!;
  const environment = await service.createEnvironment(thirdWeb.id, {
    name: 'staging', githubEnvironmentName: 'third-staging', runnerTarget: 'staging',
    publicOrigin: null, healthUrl: 'https://example.invalid/health',
    allowedBranches: ['master'], allowedTagPattern: null, production: false, migrationsAllowed: false,
  }, actor, 'third-environment');
  await service.createDeployment({
    projectId: thirdWeb.id, environmentId: environment.id, ref: 'master', runMigration: false,
    actor, requestId: 'third-deployment',
  });
  assert(fixture.requests.some((request) => request.path === '/repos/example/third/deployments'
    && request.authorization === 'Bearer fixture-installation-3'));
  await assert.rejects(() => fixture.client.forRepository({
    fullName: 'example/third', installationId: '3',
  }).environment('missing'), rejects('NOT_FOUND'));

  const reduced = JSON.parse(source);
  reduced.units = [reduced.units.find((unit: { id: string }) => unit.id === 'pr-chat-api')];
  fixture.manifests.set('second', JSON.stringify(reduced));
  await service.synchronizeRepository(imported.repositoryId, actor, 'remove-unit-same-sha');
  assert.equal((await service.listProjects()).filter((project) => project.repositoryFullName === 'example/second').length, 1);
  fixture.manifests.set('second', source);
  await service.synchronizeRepository(imported.repositoryId, actor, 'restore-unit');
  assert.equal((await service.getProject(collision.id)).slug, collision.slug);
  assert.equal((await db.select().from(deployRepositories)).length, 3);
  console.log('[admin-verify] PASS installation token cache/pagination, import permissions, master fallback, atomic sync and repository routing.');
}
