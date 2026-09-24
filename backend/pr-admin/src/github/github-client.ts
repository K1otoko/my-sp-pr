import { z } from 'zod';
import type { env } from '../config/env.js';
import type { GitHubApp } from './github-app.js';
import { AppError } from '../utils/app-error.js';

type GitHubConfig = NonNullable<typeof env.github>;
export type RepositorySelection = { fullName: string; installationId: string; githubRepositoryId?: string };

const repositorySchema = z.object({
  id: z.number().int().positive(),
  full_name: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u),
  default_branch: z.string().min(1),
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

function repositoryClient(config: GitHubConfig, app: GitHubApp, selected?: RepositorySelection) {
  const selection = selected ?? (config.repository && config.installationId ? {
    fullName: config.repository, installationId: String(config.installationId),
  } : undefined);
  if (selection && (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(selection.fullName)
    || selection.fullName.split('/').some((part) => part === '.' || part === '..')
    || !config.allowedOwners.has(selection.fullName.split('/')[0]!.toLowerCase()))) {
    throw new AppError(403, 'FORBIDDEN', 'GitHub 仓库不在允许范围内');
  }
  const repositoryPath = selection?.fullName.split('/').map(encodeURIComponent).join('/');

  async function request(path: string, init: RequestInit = {}, installationId = selection?.installationId) {
    if (!installationId) throw new AppError(503, 'CONFIGURATION_INCOMPLETE', '请先导入 GitHub 仓库');
    const response = await fetch(`${config.apiOrigin}${path}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${await app.token(installationId)}`,
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
    if (!parsed.success || parsed.data.full_name.toLowerCase() !== selection?.fullName.toLowerCase()
      || (selection.githubRepositoryId && String(parsed.data.id) !== selection.githubRepositoryId)
      || !config.allowedOwners.has(parsed.data.owner.login.toLowerCase())) {
      throw new AppError(403, 'FORBIDDEN', 'GitHub 仓库不在允许范围内');
    }
    return parsed.data;
  }

  return {
    installationId: selection?.installationId,
    async available() {
      const repositories: {
        githubRepositoryId: string; fullName: string; installationId: string; defaultBranch: string; htmlUrl: string;
      }[] = [];
      for (const installation of await app.installations()) {
        for (let page = 1; page <= 10; page += 1) {
          const response = await request(`/installation/repositories?per_page=100&page=${page}`, {}, String(installation.id));
          const parsed = z.object({ repositories: z.array(repositorySchema) }).safeParse(await response.json());
          if (!parsed.success) throw new AppError(503, 'GITHUB_UNAVAILABLE', 'GitHub 仓库列表响应无效');
          repositories.push(...parsed.data.repositories
            .filter((item) => config.allowedOwners.has(item.owner.login.toLowerCase())
              && item.full_name.split('/')[0]!.toLowerCase() === item.owner.login.toLowerCase())
            .map((item) => ({
              githubRepositoryId: String(item.id), fullName: item.full_name, installationId: String(installation.id),
              defaultBranch: item.default_branch, htmlUrl: item.html_url,
            })));
          if (repositories.length > 1000) throw new AppError(503, 'GITHUB_UNAVAILABLE', '仓库数量超过单次查询上限');
          if (parsed.data.repositories.length < 100) break;
          if (page === 10) throw new AppError(503, 'GITHUB_UNAVAILABLE', '仓库数量超过单次查询上限');
        }
      }
      return repositories;
    },
    repository,
    async workflow(ref: string) {
      const response = await request(
        `/repos/${repositoryPath}/contents/.github/workflows/deploy.yml?ref=${encodeURIComponent(ref)}`,
        { headers: { Accept: 'application/vnd.github.raw+json' } },
      );
      if (!(await response.text()).trim()) throw new AppError(422, 'MANIFEST_INVALID', '标准部署 workflow 为空');
    },
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
      await request(`/repos/${repositoryPath}/environments/${encodedName}`);
      const [variablesResponse, secretsResponse] = await Promise.all([
        request(`/repos/${repositoryPath}/environments/${encodedName}/variables?per_page=100`),
        request(`/repos/${repositoryPath}/environments/${encodedName}/secrets?per_page=100`),
      ]);
      const variables = variablesSchema.safeParse(await variablesResponse.json());
      const secrets = secretsSchema.safeParse(await secretsResponse.json());
      if (!variables.success || !secrets.success) {
        throw new AppError(503, 'GITHUB_UNAVAILABLE', 'GitHub Environment 响应无效');
      }
      return {
        variables: new Map(variables.data.variables.map((item) => [item.name, item.value])),
        secrets: new Set(secrets.data.secrets.map((item) => item.name)),
        settingsUrl: `https://github.com/${selection!.fullName}/settings/environments`,
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

export function githubClient(config: GitHubConfig, app: GitHubApp) {
  return {
    ...repositoryClient(config, app),
    forRepository: (input: RepositorySelection) => repositoryClient(config, app, input),
  };
}

export type GitHubClient = ReturnType<typeof githubClient>;
export type GitHubRepositoryClient = ReturnType<typeof repositoryClient>;
