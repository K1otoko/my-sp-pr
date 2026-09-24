import { createPrivateKey } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { importPKCS8, SignJWT } from 'jose';
import { z } from 'zod';
import type { env } from '../config/env.js';
import { AppError } from '../utils/app-error.js';

type GitHubConfig = NonNullable<typeof env.github>;

const tokenResponseSchema = z.object({
  token: z.string().min(1),
  expires_at: z.iso.datetime(),
});

export function githubApp(config: GitHubConfig, now = () => new Date()) {
  let signingKey: ReturnType<typeof importPKCS8> | undefined;
  const cached = new Map<string, { token: string; expiresAt: Date }>();
  const pending = new Map<string, Promise<string>>();

  async function key() {
    signingKey ??= (async () => {
      const file = await stat(config.privateKeyFile);
      if ((file.mode & 0o077) !== 0) throw new Error('GitHub App 私钥文件权限必须为 0600');
      const privateKey = createPrivateKey(await readFile(config.privateKeyFile));
      const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
      return importPKCS8(pem, 'RS256');
    })();
    return signingKey;
  }

  async function appJwt() {
    const issuedAt = Math.floor(now().getTime() / 1000) - 30;
    return new SignJWT({})
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(String(config.appId))
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + 9 * 60)
      .sign(await key());
  }

  async function appRequest(path: string, method = 'GET') {
    const response = await fetch(
      `${config.apiOrigin}${path}`,
      {
        method,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${await appJwt()}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'my-sp-pr-admin',
        },
        redirect: 'error',
        signal: AbortSignal.timeout(7_500),
      },
    ).catch(() => {
      throw new AppError(503, 'GITHUB_UNAVAILABLE', 'GitHub 暂时不可用，请稍后重试');
    });
    if (!response.ok) throw new AppError(503, 'GITHUB_UNAVAILABLE', 'GitHub App 授权失败');
    return response;
  }

  async function loadToken(installationId: string) {
    const response = await appRequest(`/app/installations/${installationId}/access_tokens`, 'POST');
    const parsed = tokenResponseSchema.safeParse(await response.json());
    if (!parsed.success) throw new AppError(503, 'GITHUB_UNAVAILABLE', 'GitHub App 返回无效响应');
    cached.set(installationId, { token: parsed.data.token, expiresAt: new Date(parsed.data.expires_at) });
    return parsed.data.token;
  }

  return {
    async installations() {
      const schema = z.array(z.object({
        id: z.number().int().positive(),
        account: z.object({ login: z.string() }),
        suspended_at: z.string().nullable(),
      }));
      const installations: z.infer<typeof schema> = [];
      for (let page = 1; page <= 10; page += 1) {
        const response = await appRequest(`/app/installations?per_page=100&page=${page}`);
        const parsed = schema.safeParse(await response.json());
        if (!parsed.success) throw new AppError(503, 'GITHUB_UNAVAILABLE', 'GitHub installation 响应无效');
        installations.push(...parsed.data.filter((item) => item.suspended_at === null
          && config.allowedOwners.has(item.account.login.toLowerCase())));
        if (parsed.data.length < 100) return installations;
      }
      throw new AppError(503, 'GITHUB_UNAVAILABLE', 'GitHub installation 数量超过单次查询上限');
    },
    async token(installationId: string) {
      if (!/^[1-9][0-9]{0,15}$/u.test(installationId)) throw new AppError(403, 'FORBIDDEN', 'installation ID 无效');
      const current = cached.get(installationId);
      if (current && current.expiresAt.getTime() > now().getTime() + 60_000) return current.token;
      let loading = pending.get(installationId);
      if (!loading) {
        loading = loadToken(installationId).finally(() => { pending.delete(installationId); });
        pending.set(installationId, loading);
      }
      return loading;
    },
  };
}

export type GitHubApp = ReturnType<typeof githubApp>;
