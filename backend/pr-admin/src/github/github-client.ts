import { z } from 'zod';
import type { env } from '../config/env.js';
import type { GitHubApp } from './github-app.js';
import { AppError } from '../utils/app-error.js';

type GitHubConfig = NonNullable<typeof env.github>;

const repositorySchema = z.object({
  id: z.number().int().positive(),
  full_name: z.string(),
  default_branch: z.string(),
  html_url: z.url(),
  owner: z.object({ login: z.string() }),
});
const commitSchema = z.object({
  sha: z.string().regex(/^[0-9a-f]{40}$/u),
  html_url: z.url(),
  commit: z.object({ message: z.string() }),
});
const refSchema = z.object({
  name: z.string(),
  commit: z.object({ sha: z.string().regex(/^[0-9a-f]{40}$/u) }),
});
const variablesSchema = z.object({
  variables: z.array(z.object({ name: z.string(), value: z.string() })),
});
const secretsSchema = z.object({
  secrets: z.array(z.object({ name: z.string() })),
});
const deploymentSchema = z.object({ id: z.number().int().positive() });

function cleanText(value: string, limit: number) {
  return Array.from(value).filter((character) => character.charCodeAt(0) >= 32).join('').slice(0, limit);
}

export function githubClient(config: GitHubConfig, app: GitHubApp) {
  const repositoryPath = config.repository.split('/').map(encodeURIComponent).join('/');

  async function request(path: string, init: RequestInit = {}) {
    const response = await fetch(`${config.apiOrigin}${path}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${await app.token()}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'my-sp-pr-admin',
        ...init.headers,
      },
      redirect: 'error',
      signal: AbortSignal.timeout(7_500),
    }).catch(() => {
      throw new AppError(503, 'GITHUB_UNAVAILABLE', 'GitHub 暂时不可用，请稍后重试');
    });
    if (response.status === 404) throw new AppError(404, 'NOT_FOUND', 'GitHub 资源不存在');
    if (!response.ok) throw new AppError(503, 'GITHUB_UNAVAILABLE', `GitHub 请求失败（HTTP ${response.status}）`);
    return response;
  }

  async function repository() {
    const parsed = repositorySchema.safeParse(await (await request(`/repos/${repositoryPath}`)).json());
    if (!parsed.success || parsed.data.full_name.toLowerCase() !== config.repository.toLowerCase()
      || !config.allowedOwners.has(parsed.data.owner.login.toLowerCase())) {
      throw new AppError(403, 'FORBIDDEN', 'GitHub 仓库不在允许范围内');
    }
    return parsed.data;
  }

  return {
    repository,
    async manifest(ref: string) {
      const response = await request(
        `/repos/${repositoryPath}/contents/deploy.manifest.json?ref=${encodeURIComponent(ref)}`,
        { headers: { Accept: 'application/vnd.github.raw+json' } },
      );
      return response.text();
    },
    async resolveRef(ref: string) {
      if (!/^[A-Za-z0-9._/-]{1,255}$/u.test(ref) || ref.includes('..') || ref.startsWith('/') || ref.endsWith('/')) {
        throw new AppError(422, 'REF_NOT_ALLOWED', 'Git ref 格式无效');
      }
      let response: Response;
      try {
        response = await request(`/repos/${repositoryPath}/commits/${encodeURIComponent(ref)}`);
      } catch (error) {
        if (error instanceof AppError && error.statusCode === 404) {
          throw new AppError(422, 'REF_NOT_ALLOWED', 'Git ref 不存在');
        }
        throw error;
      }
      const parsed = commitSchema.safeParse(await response.json());
      if (!parsed.success) throw new AppError(503, 'GITHUB_UNAVAILABLE', 'GitHub commit 响应无效');
      return {
        sha: parsed.data.sha,
        url: parsed.data.html_url,
        message: cleanText(parsed.data.commit.message, 500),
      };
    },
    async refs() {
      const [repositoryData, branchesResponse, tagsResponse] = await Promise.all([
        repository(),
        request(`/repos/${repositoryPath}/branches?per_page=100`),
        request(`/repos/${repositoryPath}/tags?per_page=100`),
      ]);
      const branches = z.array(refSchema).safeParse(await branchesResponse.json());
      const tags = z.array(refSchema).safeParse(await tagsResponse.json());
      if (!branches.success || !tags.success) {
        throw new AppError(503, 'GITHUB_UNAVAILABLE', 'GitHub refs 响应无效');
      }
      return {
        defaultBranch: repositoryData.default_branch,
        branches: branches.data.map((item) => ({ name: item.name, sha: item.commit.sha })),
        tags: tags.data.map((item) => ({ name: item.name, sha: item.commit.sha })),
      };
    },
    async environment(name: string) {
      const encodedName = encodeURIComponent(name);
      let variablesResponse: Response;
      let secretsResponse: Response;
      try {
        [variablesResponse, secretsResponse] = await Promise.all([
          request(`/repos/${repositoryPath}/environments/${encodedName}/variables?per_page=100`),
          request(`/repos/${repositoryPath}/environments/${encodedName}/secrets?per_page=100`),
        ]);
      } catch (error) {
        if (error instanceof AppError && error.statusCode === 404) {
          return {
            variables: new Map<string, string>(),
            secrets: new Set<string>(),
            settingsUrl: `https://github.com/${config.repository}/settings/environments`,
          };
        }
        throw error;
      }
      const variables = variablesSchema.safeParse(await variablesResponse.json());
      const secrets = secretsSchema.safeParse(await secretsResponse.json());
      if (!variables.success || !secrets.success) {
        throw new AppError(503, 'GITHUB_UNAVAILABLE', 'GitHub Environment 响应无效');
      }
      return {
        variables: new Map(variables.data.variables.map((item) => [item.name, item.value])),
        secrets: new Set(secrets.data.secrets.map((item) => item.name)),
        settingsUrl: `https://github.com/${config.repository}/settings/environments`,
      };
    },
    async createDeployment(input: {
      sha: string;
      environment: string;
      description: string;
      payload: Record<string, unknown>;
    }) {
      const response = await request(`/repos/${repositoryPath}/deployments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ref: input.sha,
          task: 'deploy',
          auto_merge: false,
          required_contexts: [],
          environment: input.environment,
          description: cleanText(input.description, 140),
          payload: input.payload,
        }),
      });
      const parsed = deploymentSchema.safeParse(await response.json());
      if (!parsed.success) throw new AppError(503, 'GITHUB_UNAVAILABLE', 'GitHub Deployment 响应无效');
      return String(parsed.data.id);
    },
  };
}

export type GitHubClient = ReturnType<typeof githubClient>;
