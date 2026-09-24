import { databaseErrorCode } from '@my-sp-pr/database';
import { DrizzleQueryError } from 'drizzle-orm';
import type { AdminIdentity } from '../auth/oidc-client.js';
import { parseDeployManifest } from '../deploy/manifest.js';
import type { env } from '../config/env.js';
import type { GitHubClient, GitHubRepositoryClient } from '../github/github-client.js';
import type { DeployRepository } from '../repositories/deploy.repository.js';
import { AppError } from '../utils/app-error.js';

type GitHubConfig = NonNullable<typeof env.github>;
type EnvironmentInput = {
  name: string;
  githubEnvironmentName: string;
  runnerTarget: string;
  publicOrigin: string | null;
  healthUrl: string;
  allowedBranches: string[];
  allowedTagPattern: string | null;
  production: boolean;
  migrationsAllowed: boolean;
};

function uniqueConflict(error: unknown) {
  return databaseErrorCode(error instanceof DrizzleQueryError ? error.cause : error) === '23505';
}

function globMatches(value: string, pattern: string) {
  const expression = pattern.split('*').map((part) => part.replace(/[\\^$.*+?()[\]{}|]/gu, '\\$&')).join('.*');
  return new RegExp(`^${expression}$`, 'u').test(value);
}

function validateEnvironment(input: Partial<EnvironmentInput>, githubConfig: GitHubConfig) {
  if (input.runnerTarget !== undefined && !githubConfig.runnerTargets.has(input.runnerTarget)) {
    throw new AppError(422, 'CONFIGURATION_INCOMPLETE', '目标 runner 不在允许列表中');
  }
  if (input.allowedBranches?.some((pattern) => !/^[A-Za-z0-9._/*-]{1,255}$/u.test(pattern)
    || pattern.includes('..') || pattern.includes('**'))) {
    throw new AppError(422, 'INVALID_INPUT', '允许分支规则格式无效');
  }
  if (input.allowedTagPattern !== undefined && input.allowedTagPattern !== null
    && (!/^[A-Za-z0-9._/*-]{1,256}$/u.test(input.allowedTagPattern)
      || input.allowedTagPattern.includes('..') || input.allowedTagPattern.includes('**'))) {
    throw new AppError(422, 'INVALID_INPUT', '版本标签规则格式无效');
  }
  if (input.production && !input.allowedBranches?.length && !input.allowedTagPattern) {
    throw new AppError(422, 'CONFIGURATION_INCOMPLETE', '生产环境必须限制允许的主分支或版本标签');
  }
}

export function deploymentService(
  repository: DeployRepository,
  github: GitHubClient | undefined,
  githubConfig: GitHubConfig | undefined,
) {
  function requireGithub() {
    if (!github || !githubConfig) throw new AppError(503, 'CONFIGURATION_INCOMPLETE', 'GitHub App 尚未配置');
    return { github, githubConfig };
  }

  async function projectClient(project: { repositoryId: string }) {
    const catalog = await repository.repositoryByGithubId(project.repositoryId);
    if (!catalog?.enabled || !catalog.installationId) {
      throw new AppError(422, 'CONFIGURATION_INCOMPLETE', '仓库尚未同步或已停用');
    }
    return requireGithub().github.forRepository({
      fullName: catalog.fullName, installationId: catalog.installationId, githubRepositoryId: catalog.githubRepositoryId,
    });
  }

  async function synchronizeClient(client: GitHubRepositoryClient, actor: AdminIdentity, requestId: string, bootstrap = false) {
    const githubRepository = await client.repository();
    const existing = await repository.repositoryByGithubId(String(githubRepository.id));
    if (existing && !existing.enabled) throw new AppError(403, 'FORBIDDEN', '仓库已停用');
    const commit = await client.resolveRef(githubRepository.default_branch);
    const manifest = parseDeployManifest(await client.manifest(commit.sha));
    await client.workflow(commit.sha);
    for (const ref of new Set(manifest.units.map((unit) => unit.defaultRef).filter((value) => value !== undefined))) {
      await client.resolveRef(ref);
    }
    try {
      return await repository.synchronizeProjects({
        repositoryId: String(githubRepository.id),
        repositoryFullName: githubRepository.full_name,
        installationId: client.installationId!,
        defaultBranch: githubRepository.default_branch,
        htmlUrl: githubRepository.html_url,
        manifestSha: commit.sha,
        manifestVersion: manifest.version,
        units: manifest.units,
        actor, requestId, bootstrap,
      });
    } catch (error) {
      if (uniqueConflict(error)) throw new AppError(409, 'DEPLOYMENT_CONFLICT', '仓库或项目标识已被占用');
      throw error;
    }
  }

  async function configuration(environmentId: string) {
    const environment = await repository.getEnvironment(environmentId);
    if (!environment) throw new AppError(404, 'NOT_FOUND', '发布环境不存在');
    const project = await repository.getProject(environment.projectId);
    if (!project || !project.row.enabled) throw new AppError(404, 'NOT_FOUND', '发布项目不存在或已停用');
    const client = await projectClient(project.row);
    const configured = await client.environment(environment.githubEnvironmentName);
    const entries = project.row.manifest.variables.map((variable) => ({
      ...variable,
      configured: variable.sensitive
        ? configured.secrets.has(variable.name) : configured.variables.has(variable.name),
      value: variable.sensitive ? null : configured.variables.get(variable.name) ?? null,
    }));
    return {
      complete: entries.every((entry) => !entry.required || entry.configured),
      settingsUrl: configured.settingsUrl,
      entries,
    };
  }

  async function allowedRef(
    requestedRef: string,
    resolvedSha: string,
    environment: NonNullable<Awaited<ReturnType<DeployRepository['getEnvironment']>>>,
    refs: Awaited<ReturnType<GitHubClient['refs']>>,
  ) {
    const normalized = requestedRef.replace(/^refs\/heads\//u, '').replace(/^refs\/tags\//u, '');
    const branch = refs.branches.find((item) => item.name === normalized);
    const tag = refs.tags.find((item) => item.name === normalized);
    const branchAllowed = (name: string) => environment.allowedBranches.some((pattern) => globMatches(name, pattern));
    const tagAllowed = (name: string) => Boolean(
      environment.allowedTagPattern && globMatches(name, environment.allowedTagPattern),
    );
    if (branch) return branch.sha === resolvedSha && branchAllowed(branch.name);
    if (tag) return tag.sha === resolvedSha && tagAllowed(tag.name);
    if (/^[0-9a-f]{40}$/u.test(requestedRef)) {
      if (!environment.production) return requestedRef === resolvedSha;
      return refs.branches.some((item) => item.sha === resolvedSha && branchAllowed(item.name))
        || refs.tags.some((item) => item.sha === resolvedSha && tagAllowed(item.name));
    }
    return false;
  }

  async function submitDeployment(input: {
    project: NonNullable<Awaited<ReturnType<DeployRepository['getProject']>>>['row'];
    environment: NonNullable<Awaited<ReturnType<DeployRepository['getEnvironment']>>>;
    actor: AdminIdentity;
    requestedRef: string;
    resolvedSha: string;
    commitUrl: string;
    commitMessage: string;
    migrationRequested: boolean;
    buildVariables?: Record<string, string>;
    requestId: string;
    rollbackOfId?: string;
  }) {
    const client = await projectClient(input.project);
    const deployment = await repository.createRequestedDeployment(input);
    if (!deployment) {
      throw new AppError(409, 'DEPLOYMENT_CONFLICT', '该项目和环境已有活动发布');
    }
    try {
      const githubDeploymentId = await client.createDeployment({
        sha: input.resolvedSha,
        environment: input.environment.githubEnvironmentName,
        description: `${input.project.name} -> ${input.environment.name}`,
        payload: {
          deploymentId: deployment.id,
          unitId: input.project.unitId,
          manifestSha: input.project.manifestSha,
          environment: input.environment.githubEnvironmentName,
          migration: input.migrationRequested,
          runnerTarget: input.environment.runnerTarget,
          healthUrl: input.environment.healthUrl,
          buildVariables: input.buildVariables ?? {},
          ...(input.rollbackOfId ? { rollbackOf: input.rollbackOfId } : {}),
        },
      });
      await repository.markQueued(deployment.id, githubDeploymentId);
    } catch (error) {
      await repository.markError(
        deployment.id,
        'github-deployment',
        error instanceof AppError ? error.code : 'GITHUB_UNAVAILABLE',
      );
      throw error;
    }
    return (await repository.getDeployment(deployment.id))!.data;
  }

  return {
    availableRepositories: () => requireGithub().github.available(),
    async importRepository(input: { githubRepositoryId: string; installationId: string }, actor: AdminIdentity, requestId: string) {
      const client = requireGithub().github;
      const visible = (await client.available()).find((item) => item.githubRepositoryId === input.githubRepositoryId
        && item.installationId === input.installationId);
      if (!visible) throw new AppError(403, 'FORBIDDEN', '仓库不在 GitHub App 可见及允许范围内');
      return synchronizeClient(client.forRepository(visible), actor, requestId);
    },
    async synchronizeRepository(repositoryId: string, actor: AdminIdentity, requestId: string) {
      const catalog = await repository.getRepository(repositoryId);
      if (!catalog) throw new AppError(404, 'NOT_FOUND', '仓库不存在');
      return synchronizeClient(await projectClient({ repositoryId: catalog.githubRepositoryId }), actor, requestId);
    },
    listProjects: () => repository.listProjects(),
    async getProject(projectId: string) {
      const project = await repository.getProject(projectId);
      if (!project) throw new AppError(404, 'NOT_FOUND', '发布项目不存在');
      return project.data;
    },
    async synchronize(actor: AdminIdentity, requestId: string) {
      const { github: client, githubConfig: config } = requireGithub();
      if (!config.repository || !config.installationId) {
        throw new AppError(422, 'CONFIGURATION_INCOMPLETE', '请通过仓库目录选择仓库并同步');
      }
      return synchronizeClient(client, actor, requestId, true);
    },
    async listEnvironments(projectId: string) {
      if (!await repository.getProject(projectId)) throw new AppError(404, 'NOT_FOUND', '发布项目不存在');
      return repository.listEnvironments(projectId);
    },
    async createEnvironment(projectId: string, input: EnvironmentInput, actor: AdminIdentity, requestId: string) {
      const { githubConfig: config } = requireGithub();
      if (!await repository.getProject(projectId)) throw new AppError(404, 'NOT_FOUND', '发布项目不存在');
      validateEnvironment(input, config);
      try {
        return await repository.createEnvironment(projectId, input, actor, requestId);
      } catch (error) {
        if (uniqueConflict(error)) {
          throw new AppError(409, 'DEPLOYMENT_CONFLICT', '同名发布环境已存在');
        }
        throw error;
      }
    },
    async updateEnvironment(
      environmentId: string,
      input: Partial<EnvironmentInput>,
      actor: AdminIdentity,
      requestId: string,
    ) {
      const { githubConfig: config } = requireGithub();
      const current = await repository.getEnvironment(environmentId);
      if (!current) throw new AppError(404, 'NOT_FOUND', '发布环境不存在');
      validateEnvironment({
        name: input.name ?? current.name,
        githubEnvironmentName: input.githubEnvironmentName ?? current.githubEnvironmentName,
        runnerTarget: input.runnerTarget ?? current.runnerTarget,
        publicOrigin: input.publicOrigin === undefined ? current.publicOrigin : input.publicOrigin,
        healthUrl: input.healthUrl ?? current.healthUrl,
        allowedBranches: input.allowedBranches ?? current.allowedBranches,
        allowedTagPattern: input.allowedTagPattern === undefined ? current.allowedTagPattern : input.allowedTagPattern,
        production: input.production ?? current.production,
        migrationsAllowed: input.migrationsAllowed ?? current.migrationsAllowed,
      }, config);
      try {
        const environment = await repository.updateEnvironment(environmentId, input, actor, requestId);
        if (!environment) throw new AppError(404, 'NOT_FOUND', '发布环境不存在');
        return environment;
      } catch (error) {
        if (uniqueConflict(error)) {
          throw new AppError(409, 'DEPLOYMENT_CONFLICT', '同名发布环境已存在');
        }
        throw error;
      }
    },
    configuration,
    async refs(projectId: string) {
      const project = await repository.getProject(projectId);
      if (!project) throw new AppError(404, 'NOT_FOUND', '发布项目不存在');
      return (await projectClient(project.row)).refs();
    },
    listDeployments: repository.listDeployments,
    async getDeployment(deploymentId: string) {
      const deployment = await repository.getDeployment(deploymentId);
      if (!deployment) throw new AppError(404, 'NOT_FOUND', '发布记录不存在');
      return deployment.data;
    },
    async createDeployment(input: {
      projectId: string;
      environmentId: string;
      ref: string;
      runMigration: boolean;
      confirmation?: string;
      actor: AdminIdentity;
      requestId: string;
    }) {
      const project = await repository.getProject(input.projectId);
      const environment = await repository.getEnvironment(input.environmentId);
      if (!project || !project.row.enabled || !environment || environment.projectId !== input.projectId) {
        throw new AppError(404, 'NOT_FOUND', '发布项目或环境不存在');
      }
      if (input.runMigration && (!project.row.manifest.migration || !environment.migrationsAllowed)) {
        throw new AppError(422, 'CONFIGURATION_INCOMPLETE', '该项目或环境不允许执行迁移');
      }
      if (environment.production && input.confirmation !== project.row.slug) {
        throw new AppError(422, 'INVALID_INPUT', '生产发布确认文本不匹配');
      }
      const environmentConfiguration = await configuration(environment.id);
      if (!environmentConfiguration.complete) {
        throw new AppError(422, 'CONFIGURATION_INCOMPLETE', '发布环境缺少必填配置');
      }
      const client = await projectClient(project.row);
      const [commit, refs] = await Promise.all([client.resolveRef(input.ref), client.refs()]);
      if (!await allowedRef(input.ref, commit.sha, environment, refs)) {
        throw new AppError(422, 'REF_NOT_ALLOWED', 'Git ref 不符合该环境的发布规则');
      }
      return submitDeployment({
        project: project.row,
        environment,
        actor: input.actor,
        requestedRef: input.ref,
        resolvedSha: commit.sha,
        commitUrl: commit.url,
        commitMessage: commit.message,
        migrationRequested: input.runMigration,
        buildVariables: Object.fromEntries(environmentConfiguration.entries
          .filter((entry) => entry.scope === 'build' && !entry.sensitive && entry.value !== null)
          .map((entry) => [entry.name, entry.value!])),
        requestId: input.requestId,
      });
    },
    async rollback(input: {
      deploymentId: string;
      confirmation: string;
      actor: AdminIdentity;
      requestId: string;
    }) {
      const target = await repository.getDeployment(input.deploymentId);
      if (!target || !['succeeded', 'inactive'].includes(target.row.deployment.status)) {
        throw new AppError(422, 'INVALID_INPUT', '只能回滚到成功发布的应用制品');
      }
      if (input.confirmation !== target.row.project.slug) {
        throw new AppError(422, 'INVALID_INPUT', '回滚确认文本不匹配');
      }
      const environmentConfiguration = await configuration(target.row.environment.id);
      if (!environmentConfiguration.complete) {
        throw new AppError(422, 'CONFIGURATION_INCOMPLETE', '发布环境缺少必填配置');
      }
      return submitDeployment({
        project: target.row.project,
        environment: target.row.environment,
        actor: input.actor,
        requestedRef: target.row.deployment.resolvedSha,
        resolvedSha: target.row.deployment.resolvedSha,
        commitUrl: target.row.deployment.commitUrl,
        commitMessage: `Rollback to ${target.row.deployment.resolvedSha.slice(0, 12)}`,
        migrationRequested: false,
        buildVariables: Object.fromEntries(environmentConfiguration.entries
          .filter((entry) => entry.scope === 'build' && !entry.sensitive && entry.value !== null)
          .map((entry) => [entry.name, entry.value!])),
        rollbackOfId: target.row.deployment.id,
        requestId: input.requestId,
      });
    },
    async receiveEvent(input: Parameters<DeployRepository['applyEvent']>[0] & {
      repositoryFullName: string; installationId: string;
    }) {
      const catalog = await repository.repositoryByGithubId(input.repositoryId);
      if (!catalog || catalog.fullName.toLowerCase() !== input.repositoryFullName.toLowerCase()
        || catalog.installationId !== input.installationId) {
        throw new AppError(403, 'WEBHOOK_INVALID', 'GitHub webhook 仓库或 installation 不匹配');
      }
      const result = await repository.applyEvent(input);
      if (result === 'mismatch') throw new AppError(403, 'WEBHOOK_INVALID', 'GitHub webhook 目标不匹配');
      return { accepted: true };
    },
  };
}

export type DeploymentService = ReturnType<typeof deploymentService>;
