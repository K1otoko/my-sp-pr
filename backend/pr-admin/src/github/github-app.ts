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
  let cached: { token: string; expiresAt: Date } | undefined;
  let pending: Promise<string> | undefined;

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

  async function loadToken() {
    const response = await fetch(
      `${config.apiOrigin}/app/installations/${config.installationId}/access_tokens`,
      {
        method: 'POST',
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
    const parsed = tokenResponseSchema.safeParse(await response.json());
    if (!parsed.success) throw new AppError(503, 'GITHUB_UNAVAILABLE', 'GitHub App 返回无效响应');
    cached = { token: parsed.data.token, expiresAt: new Date(parsed.data.expires_at) };
    return cached.token;
  }

  return {
    async token() {
      if (cached && cached.expiresAt.getTime() > now().getTime() + 60_000) return cached.token;
      pending ??= loadToken().finally(() => { pending = undefined; });
      return pending;
    },
  };
}

export type GitHubApp = ReturnType<typeof githubApp>;
