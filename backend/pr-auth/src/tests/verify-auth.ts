import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer as httpServer } from 'node:http';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { eq, sql } from 'drizzle-orm';
import * as oidc from 'openid-client';
import { createLocalJWKSet, decodeJwt, exportJWK, generateKeyPair, jwtVerify, type JSONWebKeySet } from 'jose';
import { database } from '../db/index.js';
import { checkIdentitySchema } from '../db/check-identity.js';
import { authSessions, loginRateLimits, oidcArtifacts, users } from '../db/schema/index.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { digest, randomToken } from '../auth/storage-crypto.js';
import { loadAuthConfig } from '../config/auth.js';
import { createAuthStore } from '../repositories/auth-store.js';
import { createAdapter, oidcContext } from '../oidc/adapter.js';
import { accountService } from '../services/account.service.js';
import { flowStore } from '../repositories/flow-store.js';
import { AppError } from '../utils/app-error.js';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const children: { child: ChildProcess; exit: Promise<number | null>; output: () => string }[] = [];
let temporary: string | undefined;
let stage = 'setup';
async function port() {
  const server = createServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}
function start(path: string, env: NodeJS.ProcessEnv) {
  const child = spawn(process.execPath, [path], { cwd: root, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout?.on('data', (data: Buffer) => { output += data.toString(); });
  child.stderr?.on('data', (data: Buffer) => { output += data.toString(); });
  const exit = new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
  const running = { child, exit, output: () => output };
  children.push(running);
  return running;
}
async function stop(running: typeof children[number]) {
  if (running.child.exitCode === null && running.child.signalCode === null) running.child.kill('SIGTERM');
  await running.exit;
}
async function healthy(url: string, child: typeof children[number]) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    assert.equal(child.child.exitCode, null, `server exited: ${child.output().slice(-1000)}`);
    try { if ((await fetch(url)).status === 200) return; } catch { /* Not listening yet. */ }
    await delay(100);
  }
  throw new Error('server did not become ready');
}
class Browser {
  cookies = new Map<string, { name: string; value: string; path: string }>();
  async request(url: string, init: RequestInit = {}) {
    const target = new URL(url);
    const headers = new Headers(init.headers);
    headers.set('cookie', [...this.cookies.values()].filter((cookie) => target.pathname.startsWith(cookie.path))
      .sort((a, b) => b.path.length - a.path.length).map((cookie) => `${cookie.name}=${cookie.value}`).join('; '));
    const response = await fetch(url, { ...init, headers, redirect: 'manual', signal: AbortSignal.timeout(9000) });
    for (const value of response.headers.getSetCookie()) {
      const [first, ...attrs] = value.split(';');
      const index = first!.indexOf('=');
      const cookie = { name: first!.slice(0, index), value: first!.slice(index + 1), path: attrs.find((part) => part.trim().toLowerCase().startsWith('path='))?.trim().slice(5) ?? '/' };
      const key = `${cookie.name}:${cookie.path}`;
      if (attrs.some((part) => part.trim().toLowerCase() === 'max-age=0')) this.cookies.delete(key);
      else this.cookies.set(key, cookie);
    }
    return response;
  }
  async json(url: string, body?: unknown) {
    const response = await this.request(url, {
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json', Origin: new URL(url).origin } : {}) },
      ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
    });
    return { response, payload: await response.json() as { data: Record<string, string>; error?: { code: string }; success: boolean } };
  }
  async follow(url: string) {
    for (let i = 0; i < 10; i += 1) {
      const response = await this.request(url);
      if (![302, 303].includes(response.status)) return { url, response };
      const location = new URL(response.headers.get('location')!, url).href;
      if (new URL(location).pathname.startsWith('/login/') || new URL(location).pathname === '/cb'
        || new URL(location).pathname === '/logout' || new URL(location).pathname === '/auth/error'
        || new URL(location).pathname === '/') return { url: location, response };
      url = location;
    }
    throw new Error('redirect loop');
  }
}

async function verify() {
  assert(process.env.AUTH_VERIFY_DATABASE?.startsWith('my_sp_pr_verify_'));
  assert.equal(new URL(process.env.DATABASE_URL!).pathname, `/${process.env.AUTH_VERIFY_DATABASE}`);
  await database.checkReady();
  await checkIdentitySchema(database.db);
  await mkdir(join(root, '.verification'), { recursive: true });
  temporary = await mkdtemp(join(root, '.verification/sso-'));
  const authPort = await port();
  const gatewayPort = await port();
  const origin = `http://localhost:${gatewayPort}`;
  const secretA = randomToken();
  const { privateKey } = await generateKeyPair('RS256', { extractable: true, modulusLength: 2048 });
  const configPath = join(temporary, 'auth.json');
  await writeFile(configPath, JSON.stringify({
    cookieKeys: [randomToken()], encryptionKeys: [{ id: 'test', key: randomToken() }], hmacKey: randomToken(),
    jwks: { keys: [{ ...await exportJWK(privateKey), kid: 'test', use: 'sig', alg: 'RS256' }] }, portalSecret: randomToken(),
    clients: ['client-a', 'client-b', 'admin-only'].map((clientId) => ({
      clientId, name: clientId, secret: secretA, redirectUris: [`http://localhost:49101/cb`],
      postLogoutRedirectUris: [], scopes: ['openid', 'profile', 'roles'],
      allowedRoles: clientId === 'admin-only' ? ['super', 'admin'] : ['super', 'admin', 'user'], refreshToken: true,
    })),
  }), { mode: 0o600 });
  const authEnv = { HOST: '127.0.0.1', PORT: String(authPort), SSO_PUBLIC_ORIGIN: origin, AUTH_CONFIG_FILE: configPath };
  const config = loadAuthConfig({ ...process.env, ...authEnv });
  const store = createAuthStore(database.db, config.crypto);
  const accounts = accountService(store);
  const password = randomToken();
  const administrator = await accounts.bootstrap('owner', password);
  assert.equal(administrator.role, 'super');
  await assert.rejects(() => accounts.bootstrap('duplicate', password), (error: unknown) => error instanceof AppError && error.statusCode === 409);
  const passwordHash = await hashPassword(password);
  assert(await verifyPassword(password, passwordHash));
  assert(!await verifyPassword(`${password}x`, passwordHash));
  const [user] = await database.db.insert(users).values({ usernameNormalized: 'member', displayName: '测试用户', passwordHash }).returning();
  assert.equal(user!.role, 'user');
  await database.db.insert(users).values({ usernameNormalized: 'disabled', displayName: 'disabled', passwordHash, status: 'disabled' });
  await assert.rejects(() => accounts.changeAccount(administrator.id, { role: 'user' }));
  await assert.rejects(() => accounts.changeAccount(administrator.id, { status: 'disabled' }));
  await assert.rejects(() => database.db.insert(users).values({ usernameNormalized: 'member', displayName: 'duplicate', passwordHash }));
  console.log('[sso-verify] PASS password hashing, username uniqueness, default role, super bootstrap and last-super protection.');

  let auth = start(join(root, 'backend/pr-auth/dist/server.js'), authEnv);
  await healthy(`http://127.0.0.1:${authPort}/api/auth/ready`, auth);
  const gateway = start(join(root, 'backend/gateway/dist/server.js'), {
    HOST: '127.0.0.1', PORT: String(gatewayPort), SSO_PUBLIC_ORIGIN: origin,
    AUTH_SERVICE_URL: `http://127.0.0.1:${authPort}`,
  });
  await healthy(`${origin}/api/health`, gateway);
  const metadata = await (await fetch(`${origin}/.well-known/openid-configuration`)).json() as oidc.ServerMetadata;
  assert.equal(metadata.issuer, origin);
  assert.equal(metadata.token_endpoint, `${origin}/api/auth/oidc/token`);
  assert.equal((await fetch(`${origin}/api/auth/ready`)).status, 404);
  assert.equal((await fetch(`${origin}/api/auth/oidc/unknown`)).status, 404);
  const client = (id: string) => {
    const result = new oidc.Configuration(metadata, id, { client_secret: secretA }, oidc.ClientSecretBasic(secretA));
    oidc.allowInsecureRequests(result); oidc.enableNonRepudiationChecks(result);
    return result;
  };
  async function authorization(browser: Browser, id = 'client-a', overrides: Record<string, string> = {}) {
    const verifier = oidc.randomPKCECodeVerifier(); const nonce = oidc.randomNonce(); const state = oidc.randomState();
    const url = oidc.buildAuthorizationUrl(client(id), {
      redirect_uri: 'http://localhost:49101/cb', scope: 'openid profile roles', state, nonce,
      code_challenge: await oidc.calculatePKCECodeChallenge(verifier), code_challenge_method: 'S256', ...overrides,
    });
    return { ...await browser.follow(url.href), verifier, nonce, state, id };
  }
  async function login(browser: Browser, url: string, username = 'member') {
    assert(new URL(url).pathname.startsWith('/login/'), `login expected: ${new URL(url).pathname}`);
    const uid = new URL(url).pathname.split('/').at(-1)!;
    const endpoint = `${origin}/api/auth/interactions/${uid}`;
    const context = await browser.json(endpoint);
    assert.equal(context.response.status, 200, 'interaction details');
    const submitted = await browser.json(`${endpoint}/login`, { username, password, csrfToken: context.payload.data.csrfToken });
    assert.equal(submitted.response.status, 200, 'password login');
    return browser.follow(new URL(submitted.payload.data.resumeUrl!, origin).href);
  }
  async function exchange(flow: Awaited<ReturnType<typeof authorization>>, url: string) {
    return oidc.authorizationCodeGrant(client(flow.id), new URL(url), {
      expectedState: flow.state, expectedNonce: flow.nonce, pkceCodeVerifier: flow.verifier, idTokenExpected: true,
    });
  }
  async function introspect(token: string, id = 'client-a') {
    return oidc.tokenIntrospection(client(id), token);
  }
  stage = 'first login / SSO';
  const browser = new Browser();
  const first = await authorization(browser);
  const callback = await login(browser, first.url);
  const tokens = await exchange(first, callback.url);
  assert.equal(tokens.claims()?.sub, user!.id);
  assert.deepEqual(tokens.claims()?.roles, ['user']);
  assert(tokens.refresh_token);
  const info = await oidc.fetchUserInfo(client('client-a'), tokens.access_token, user!.id);
  assert.equal(info.sub, user!.id);
  assert.equal((await introspect(tokens.access_token)).active, true);
  assert.equal((await introspect(tokens.access_token, 'client-b')).active, false);
  const second = await authorization(browser, 'client-b');
  assert.equal(new URL(second.url).pathname, '/cb', 'client B must reuse central login');
  const secondTokens = await exchange(second, second.url);
  const otherDevice = new Browser();
  const other = await authorization(otherDevice);
  const otherCallback = await login(otherDevice, other.url);
  const otherTokens = await exchange(other, otherCallback.url);
  const refused = await authorization(browser, 'admin-only');
  assert.equal(new URL(refused.url).searchParams.get('error'), 'access_denied');
  const adminBrowser = new Browser();
  const adminFlow = await authorization(adminBrowser, 'admin-only');
  const adminCallback = await login(adminBrowser, adminFlow.url, 'owner');
  assert.deepEqual((await exchange(adminFlow, adminCallback.url)).claims()?.roles, ['super']);
  console.log('[sso-verify] PASS code+PKCE, verified JWT/UserInfo, client A/B SSO, separate device and role admission.');

  stage = 'portal and persistence';
  const portal = await browser.follow(`${origin}/api/auth/portal/start`);
  assert.equal(new URL(portal.url).pathname, '/', 'portal callback must finish');
  const session = await browser.json(`${origin}/api/auth/session`);
  assert.equal(session.payload.data.authenticated, true);
  await stop(auth);
  auth = start(join(root, 'backend/pr-auth/dist/server.js'), authEnv);
  await healthy(`http://127.0.0.1:${authPort}/api/auth/ready`, auth);
  assert.equal((await browser.json(`${origin}/api/auth/session`)).payload.data.authenticated, true);
  assert.equal((await introspect(tokens.access_token)).active, true);
  const restarted = await authorization(browser, 'client-b');
  assert.equal(new URL(restarted.url).pathname, '/cb');
  console.log('[sso-verify] PASS portal state and central/token persistence across process restart.');

  stage = 'logout';
  const logout = await browser.json(`${origin}/api/auth/logout`, { csrfToken: session.payload.data.csrfToken });
  assert.equal(logout.response.status, 200);
  const confirmation = await browser.follow(logout.payload.data.resumeUrl!);
  assert.equal(new URL(confirmation.url).pathname, '/logout');
  const flow = new URL(confirmation.url).searchParams.get('flow')!;
  const context = await browser.json(`${origin}/api/auth/logout/context/${flow}`);
  assert.equal(context.response.status, 200);
  const loggedOut = await browser.request(`${origin}${context.payload.data.action}`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: origin },
    body: new URLSearchParams({ xsrf: context.payload.data.xsrf!, logout: 'yes' }),
  });
  assert.equal(loggedOut.status, 303);
  assert.equal((await browser.json(`${origin}/api/auth/session`)).payload.data.authenticated, false);
  assert.equal((await introspect(tokens.access_token)).active, false);
  assert.equal((await introspect(secondTokens.access_token, 'client-b')).active, false);
  assert.equal((await introspect(otherTokens.access_token)).active, true);
  console.log('[sso-verify] PASS browser logout revokes related clients and preserves other device.');

  stage = 'callback validation and parallel tabs';
  for (const field of ['state', 'nonce', 'verifier'] as const) {
    const invalidFlow = await authorization(otherDevice);
    await assert.rejects(() => exchange({ ...invalidFlow, [field]: randomToken() }, invalidFlow.url));
  }
  const publicKeys = await (await fetch(`${origin}/api/auth/oidc/jwks`)).json() as JSONWebKeySet;
  const resolver = createLocalJWKSet(publicKeys);
  await assert.rejects(() => jwtVerify(otherTokens.id_token!, resolver, { issuer: 'https://wrong.example', audience: 'client-a' }));
  await assert.rejects(() => jwtVerify(otherTokens.id_token!, resolver, { issuer: origin, audience: 'client-b' }));
  const tabs = new Browser();
  const tabOne = await tabs.request(`${origin}/api/auth/portal/start`);
  const tabTwo = await tabs.request(`${origin}/api/auth/portal/start`);
  assert.notEqual(new URL(tabOne.headers.get('location')!).searchParams.get('state'),
    new URL(tabTwo.headers.get('location')!).searchParams.get('state'));
  const tabOneLogin = await tabs.follow(tabOne.headers.get('location')!);
  assert.equal(new URL((await login(tabs, tabOneLogin.url)).url).pathname, '/');
  assert.equal(new URL((await tabs.follow(tabTwo.headers.get('location')!)).url).pathname, '/');
  const invalidState = await new Browser().request(`${origin}/api/auth/portal/callback?state=invalid&code=invalid`);
  assert.equal(invalidState.headers.get('location'), '/auth/error?code=AUTH_FLOW_INVALID');
  console.log('[sso-verify] PASS state/nonce/PKCE, issuer/audience checks and independent portal tab transactions.');

  stage = 'invalid inputs and protocol boundaries';
  const invalidBrowser = new Browser();
  const invalid = await authorization(invalidBrowser);
  const endpoint = `${origin}/api/auth/interactions/${new URL(invalid.url).pathname.split('/').at(-1)}`;
  const details = await invalidBrowser.json(endpoint);
  assert.equal((await new Browser().json(endpoint)).response.status, 400);
  assert.equal((await invalidBrowser.json(`${endpoint}/login`, {
    username: 'member', password, csrfToken: details.payload.data.csrfToken, role: 'admin',
  })).response.status, 400);
  assert.equal((await invalidBrowser.json(`${endpoint}/login`, { username: 'member', password, csrfToken: 'invalid' })).response.status, 403);
  for (const username of ['member', 'unknown', 'disabled']) {
    const failed = await invalidBrowser.json(`${endpoint}/login`, { username, password: 'wrong-password-value', csrfToken: details.payload.data.csrfToken });
    assert.equal(failed.response.status, 401);
    assert.equal(failed.payload.error?.code, 'INVALID_CREDENTIALS');
  }
  const badScope = await authorization(new Browser(), 'client-a', { scope: 'openid roles forbidden' });
  assert(badScope.response.status >= 400 || new URL(badScope.url).searchParams.get('error') || new URL(badScope.url).pathname === '/auth/error');
  const badRedirect = await authorization(new Browser(), 'client-a', { redirect_uri: 'https://unregistered.example/cb' });
  assert.equal(new URL(badRedirect.url).origin, origin);
  assert.equal((await fetch(`${origin}/api/auth/oidc/token`, { method: 'POST', headers: { Origin: 'https://foreign.example' } })).status, 403);
  for (let i = 0; i < 4; i += 1) await invalidBrowser.json(`${endpoint}/login`, { username: 'unknown', password, csrfToken: details.payload.data.csrfToken });
  const limited = await invalidBrowser.json(`${endpoint}/login`, { username: 'unknown', password, csrfToken: details.payload.data.csrfToken });
  assert.equal(limited.response.status, 429);
  assert(Number(limited.response.headers.get('retry-after')) > 0);
  const expiredBrowser = new Browser();
  const expired = await authorization(expiredBrowser);
  const expiredUid = new URL(expired.url).pathname.split('/').at(-1)!;
  await database.db.update(oidcArtifacts).set({ expiresAt: new Date(0) }).where(eq(oidcArtifacts.idHash, digest(expiredUid)));
  assert.equal((await expiredBrowser.json(`${origin}/api/auth/interactions/${expiredUid}`)).response.status, 400);
  console.log('[sso-verify] PASS cookies/CSRF, uniform credential errors, scope/redirect limits, server-only CORS and rate limit.');

  stage = 'replay / concurrent instances';
  await database.db.delete(loginRateLimits);
  const authPort2 = await port();
  const auth2 = start(join(root, 'backend/pr-auth/dist/server.js'), { ...authEnv, PORT: String(authPort2) });
  await healthy(`http://127.0.0.1:${authPort2}/api/auth/ready`, auth2);
  const gatewayPort2 = await port();
  const gateway2 = start(join(root, 'backend/gateway/dist/server.js'), {
    HOST: '127.0.0.1', PORT: String(gatewayPort2), SSO_PUBLIC_ORIGIN: origin,
    AUTH_SERVICE_URL: `http://127.0.0.1:${authPort2}`,
  });
  await healthy(`http://127.0.0.1:${gatewayPort2}/api/health`, gateway2);
  const concurrentBrowser = new Browser();
  const concurrent = await authorization(concurrentBrowser);
  const concurrentCallback = await login(concurrentBrowser, concurrent.url);
  const rawExchange = (targetPort: number, code: string, verifier: string, grant = 'authorization_code') => fetch(`http://127.0.0.1:${targetPort}/api/auth/oidc/token`, {
    method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`client-a:${secretA}`).toString('base64')}` },
    body: new URLSearchParams(grant === 'authorization_code' ? {
      grant_type: grant, code, code_verifier: verifier, redirect_uri: 'http://localhost:49101/cb',
    } : { grant_type: grant, refresh_token: code }),
  });
  const code = new URL(concurrentCallback.url).searchParams.get('code')!;
  const raced = await Promise.all([rawExchange(gatewayPort, code, concurrent.verifier), rawExchange(gatewayPort2, code, concurrent.verifier)]);
  console.log('[sso-verify] code race statuses', raced.map((response) => response.status));
  assert(raced.filter((response) => response.status === 200).length <= 1);
  assert(raced.some((response) => response.status === 400));
  const refreshFlow = await authorization(otherDevice);
  const refreshTokens = await exchange(refreshFlow, refreshFlow.url);
  const refreshed = await oidc.refreshTokenGrant(client('client-a'), refreshTokens.refresh_token!);
  assert.notEqual(refreshed.refresh_token, refreshTokens.refresh_token);
  await assert.rejects(() => oidc.refreshTokenGrant(client('client-a'), refreshTokens.refresh_token!));
  assert.equal((await introspect(refreshed.access_token)).active, false);
  const refreshRaceFlow = await authorization(otherDevice);
  const refreshRaceTokens = await exchange(refreshRaceFlow, refreshRaceFlow.url);
  const refreshRace = await Promise.all([rawExchange(gatewayPort, refreshRaceTokens.refresh_token!, '', 'refresh_token'), rawExchange(gatewayPort2, refreshRaceTokens.refresh_token!, '', 'refresh_token')]);
  assert(refreshRace.filter((response) => response.status === 200).length <= 1);
  const Adapter = createAdapter(store);
  const artifact = new Adapter('Interaction');
  await artifact.upsert('consume-fixture', {}, 60);
  await artifact.consume('consume-fixture');
  await artifact.upsert('consume-fixture', {}, 60);
  assert((await artifact.find('consume-fixture'))?.consumed);
  await assert.rejects(() => artifact.consume('consume-fixture'));
  const grantAdapter = new Adapter('Grant');
  const accessAdapter = new Adapter('AccessToken');
  const raceUid = randomToken();
  const raceContext = { uid: raceUid, accountId: user!.id, loginTs: Math.floor(Date.now() / 1000), acr: 'urn:my-sp-pr:auth-version:1' };
  await oidcContext.run({ session: () => raceContext }, () =>
    grantAdapter.upsert('grant-race', { accountId: user!.id, clientId: 'client-a' }, 60));
  await Promise.allSettled([
    accessAdapter.upsert('grant-race-token', { accountId: user!.id, sessionUid: raceUid, clientId: 'client-a', grantId: 'grant-race' }, 60),
    grantAdapter.revokeByGrantId('grant-race'),
  ]);
  assert.equal(await accessAdapter.find('grant-race-token'), undefined);
  await assert.rejects(() => accessAdapter.upsert('grant-race-late', {
    accountId: user!.id, sessionUid: raceUid, clientId: 'client-a', grantId: 'grant-race',
  }, 60));
  const flowStoreInstance = flowStore(store);
  await flowStoreInstance.create('login', 'binding', 'fixed', { state: 'one-use', nonce: 'nonce', verifier: 'verifier' });
  await assert.rejects(() => flowStoreInstance.read('login', 'one-use', 'wrong-binding', true));
  await flowStoreInstance.read('login', 'one-use', 'binding', true);
  await assert.rejects(() => flowStoreInstance.read('login', 'one-use', 'binding', true));
  console.log('[sso-verify] PASS two-instance code/refresh race, refresh replay revocation and one-use persistence.');

  stage = 'forced reauthentication';
  const beforeReauth = await authorization(otherDevice);
  const beforeReauthTokens = await exchange(beforeReauth, beforeReauth.url);
  const reauth = await authorization(otherDevice, 'client-a', { prompt: 'login' });
  const reauthCallback = await login(otherDevice, reauth.url);
  console.log('[sso-verify] reauthentication result', {
    path: new URL(reauthCallback.url).pathname,
    error: new URL(reauthCallback.url).searchParams.get('error'),
    description: new URL(reauthCallback.url).searchParams.get('error_description'),
  });
  assert.equal(new URL(reauthCallback.url).pathname, '/cb', 'reauth callback path');
  assert.equal(new URL(reauthCallback.url).searchParams.get('error'), null, 'reauth protocol error');
  assert(new URL(reauthCallback.url).searchParams.has('code'), 'reauth authorization code');
  const reauthTokens = await exchange(reauth, reauthCallback.url);
  assert.equal((await introspect(reauthTokens.access_token)).active, true);
  assert.equal((await introspect(beforeReauthTokens.access_token)).active, false);
  console.log('[sso-verify] PASS forced password reauthentication and revocation of preceding grants.');

  stage = 'account revocation and expiry';
  await accounts.changeAccount(user!.id, { role: 'admin' });
  assert.equal((await introspect(reauthTokens.access_token)).active, false);
  const promotedBrowser = new Browser();
  const promotedFlow = await authorization(promotedBrowser, 'admin-only');
  const promotedCallback = await login(promotedBrowser, promotedFlow.url);
  const promotedTokens = await exchange(promotedFlow, promotedCallback.url);
  assert.deepEqual(promotedTokens.claims()?.roles, ['admin']);
  await accounts.changeAccount(user!.id, { role: 'user', status: 'disabled' });
  assert.equal((await introspect(promotedTokens.access_token, 'admin-only')).active, false);
  await accounts.changeAccount(user!.id, { status: 'active' });
  const resetFlow = await authorization(otherDevice);
  const resetCallback = await login(otherDevice, resetFlow.url);
  const resetTokens = await exchange(resetFlow, resetCallback.url);
  await accounts.resetPassword('member', randomToken());
  assert.equal((await introspect(resetTokens.access_token)).active, false);
  const now = store.now();
  const timeStore = createAuthStore(database.db, config.crypto, () => new Date(now.getTime() + 8 * 86400_000));
  const sessionRows = await database.db.select().from(authSessions).where(eq(authSessions.userId, administrator.id));
  assert.equal(await timeStore.validSession(database.db, sessionRows[0]!.providerUidHash), undefined);
  await database.db.update(authSessions).set({ idleExpiresAt: new Date(now.getTime() - 1) }).where(eq(authSessions.userId, administrator.id));
  assert.equal(await store.validSession(database.db, sessionRows[0]!.providerUidHash), undefined);
  await database.db.update(oidcArtifacts).set({ expiresAt: new Date(now.getTime() - 1) })
    .where(eq(oidcArtifacts.idHash, digest('consume-fixture')));
  await assert.rejects(() => artifact.upsert('consume-fixture', {}, 60));
  assert.equal((await database.db.execute(sql`select count(*)::int as count from auth.users`)).rows[0]?.count, 3);
  console.log('[sso-verify] PASS password reset revocation and absolute/idle/artifact expiry boundaries.');
  stage = 'gateway transport regression';
  await stop(auth2);
  await stop(gateway2);
  let cancelled = false;
  const fixture = httpServer((request, response) => {
    const mode = new URL(request.url!, origin).searchParams.get('mode');
    if (mode === 'timeout') return;
    if (mode === 'cancel') {
      response.on('close', () => { cancelled = true; });
      response.writeHead(200); response.write('begin');
      return;
    }
    if (mode === 'stream') {
      response.write('first');
      setTimeout(() => response.end('last'), 30);
      return;
    }
    response.writeHead(302, {
      'Set-Cookie': ['one=1; HttpOnly; Path=/', 'two=2; HttpOnly; Path=/'],
      Location: '/fixed', 'WWW-Authenticate': 'Bearer realm="test"', 'Cache-Control': 'no-store',
    });
    response.end(JSON.stringify({ headers: request.headers, url: request.url }));
  });
  fixture.listen(authPort2, '127.0.0.1');
  await once(fixture, 'listening');
  const transport = start(join(root, 'backend/gateway/dist/server.js'), {
    HOST: '127.0.0.1', PORT: String(gatewayPort2), SSO_PUBLIC_ORIGIN: origin,
    AUTH_SERVICE_URL: `http://127.0.0.1:${authPort2}`, UPSTREAM_TIMEOUT_MS: '300', TRUSTED_PROXY_CIDRS: '',
  });
  try {
    const target = `http://127.0.0.1:${gatewayPort2}/api/auth/oidc/jwks`;
    await healthy(`http://127.0.0.1:${gatewayPort2}/api/health`, transport);
    const headers = await fetch(`${target}?encoded=a%2Fb`, {
      redirect: 'manual', headers: { 'X-Roles': 'admin', 'X-Forwarded-For': '203.0.113.1', 'X-Forwarded-Host': 'evil.example' },
    });
    assert.equal(headers.status, 302);
    assert.equal(headers.headers.getSetCookie().length, 2);
    assert.equal(headers.headers.get('location'), '/fixed');
    assert.equal(headers.headers.get('www-authenticate'), 'Bearer realm="test"');
    const echoed = await headers.json() as { headers: Record<string, string>; url: string };
    assert.equal(echoed.headers['x-roles'], undefined);
    assert.equal(echoed.headers['x-forwarded-for'], '127.0.0.1');
    assert.equal(echoed.headers['x-forwarded-host'], new URL(origin).host);
    assert(echoed.url.endsWith('encoded=a%2Fb'));
    assert.equal(await (await fetch(`${target}?mode=stream`)).text(), 'firstlast');
    assert.equal((await fetch(`${target}?mode=timeout`)).status, 504);
    const abort = new AbortController();
    const cancelling = await fetch(`${target}?mode=cancel`, { signal: abort.signal });
    await cancelling.body!.getReader().read();
    abort.abort();
    for (let i = 0; i < 10 && !cancelled; i += 1) await delay(20);
    assert(cancelled, 'client abort must close upstream');
    fixture.closeAllConnections();
    await new Promise<void>((resolve) => fixture.close(() => resolve()));
    assert.equal((await fetch(target)).status, 502);
  } finally {
    fixture.closeAllConnections();
    fixture.close();
    await stop(transport);
  }
  const productionGateway = start(join(root, 'backend/gateway/dist/server.js'), {
    NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(gatewayPort2),
    SSO_PUBLIC_ORIGIN: 'https://sso.verify.example.com', CORS_ORIGINS: 'https://sso.verify.example.com',
    AUTH_SERVICE_URL: `http://127.0.0.1:${authPort}`,
    CHAT_SERVICE_URL: 'http://127.0.0.1:1', ADMIN_SERVICE_URL: 'http://127.0.0.1:2',
  });
  await healthy(`http://127.0.0.1:${gatewayPort2}/api/health`, productionGateway);
  assert.equal((await fetch(`http://127.0.0.1:${gatewayPort2}/api/auth/health`)).status, 200);
  assert.equal((await fetch(`http://127.0.0.1:${gatewayPort2}/api/auth/ready`)).status, 404);
  assert.equal((await fetch(`http://127.0.0.1:${gatewayPort2}/.well-known/openid-configuration`)).status, 403);
  await stop(productionGateway);
  console.log('[sso-verify] PASS exact routes, forwarding headers, multiple cookies, streaming, timeout, cancellation and 502.');
  // Never expose raw ID/access tokens in verification output.
  assert.equal(decodeJwt(tokens.id_token!).iss, origin);
  const document = JSON.parse(await readFile(configPath, 'utf8')) as { clients: unknown[] };
  assert.equal(document.clients.length, 3);
  console.log('[sso-verify] PASS all implemented authentication assertions.');
}
try { await verify(); }
catch (error) {
  console.error(`[sso-verify] FAIL ${stage}: ${error instanceof Error ? error.name : 'UnknownError'}`);
  if (error instanceof Error) {
    const location = error.stack?.split('\n').find((line) => line.includes('/tests/verify-auth.ts:'));
    if (location) console.error(location.trim());
  }
  process.exitCode = 1;
} finally {
  for (const child of children) await stop(child).catch(() => undefined);
  await database.close();
  if (temporary) await rm(temporary, { recursive: true, force: true });
}
