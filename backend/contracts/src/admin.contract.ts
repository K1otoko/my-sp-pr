import { z } from 'zod';
import {
  authSessionDataSchema, csrfInputSchema, errorResponse, healthOperation, readinessOperation, resumeDataSchema,
} from './shared.js';

const success = <T extends z.ZodType>(schema: T) => ({
  description: '请求成功',
  content: { 'application/json': { schema: z.object({ success: z.literal(true), data: schema }) } },
});
const authErrors = {
  400: errorResponse('请求无效或登录流程过期'),
  401: errorResponse('尚未登录或登录已失效'),
  403: errorResponse('请求校验失败或无权访问'),
  413: errorResponse('请求体超过限制'),
  500: errorResponse('服务内部错误'),
  503: errorResponse('身份服务暂不可用'),
};
const jsonBody = <T extends z.ZodType>(schema: T) => ({
  required: true,
  content: { 'application/json': { schema } },
});
const projectParams = z.object({ projectId: z.uuid() });
const environmentParams = z.object({ environmentId: z.uuid() });
const deploymentParams = z.object({ deploymentId: z.uuid() });
const deploymentStatusSchema = z.enum([
  'requested', 'queued', 'in_progress', 'succeeded', 'failed', 'error', 'inactive',
]).meta({ id: 'DeploymentStatus' });
const deploymentSummaryShape = {
  id: z.uuid(),
  projectId: z.uuid(),
  environmentId: z.uuid(),
  projectSlug: z.string(),
  environmentName: z.string(),
  requestedRef: z.string(),
  resolvedSha: z.string(),
  status: deploymentStatusSchema,
  actorUsername: z.string(),
  migrationRequested: z.boolean(),
  migrationPerformed: z.boolean(),
  githubDeploymentId: z.string().nullable(),
  logUrl: z.string().nullable(),
  createdAt: z.iso.datetime(),
  startedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable(),
};
const deploymentSummarySchema = z.object(deploymentSummaryShape).meta({ id: 'DeploymentSummary' });
const deployProjectSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  kind: z.enum(['frontend', 'service']),
  repositoryFullName: z.string(),
  unitId: z.string(),
  preset: z.enum(['pnpm-vite-static-v1', 'pnpm-node-service-v1']),
  packageName: z.string(),
  packagePath: z.string(),
  artifactPath: z.string(),
  defaultRef: z.string(),
  migrationSupported: z.boolean(),
  enabled: z.boolean(),
  manifestSha: z.string(),
  manifestVersion: z.number().int(),
  environmentCount: z.number().int().nonnegative(),
  latestDeployment: z.object(deploymentSummaryShape).nullable(),
  updatedAt: z.iso.datetime(),
}).meta({ id: 'DeployProject' });
const deployEnvironmentSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  name: z.string(),
  githubEnvironmentName: z.string(),
  runnerTarget: z.string(),
  publicOrigin: z.string().nullable(),
  healthUrl: z.string(),
  allowedBranches: z.array(z.string()),
  allowedTagPattern: z.string().nullable(),
  production: z.boolean(),
  migrationsAllowed: z.boolean(),
  updatedAt: z.iso.datetime(),
}).meta({ id: 'DeployEnvironment' });
const environmentInputSchema = z.strictObject({
  csrfToken: z.string().min(1).max(512),
  name: z.string().regex(/^[a-z][a-z0-9-]{1,31}$/u),
  githubEnvironmentName: z.string().min(1).max(255),
  runnerTarget: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/u),
  publicOrigin: z.url().nullable(),
  healthUrl: z.url(),
  allowedBranches: z.array(z.string().min(1).max(255)).max(50),
  allowedTagPattern: z.string().min(1).max(256).nullable(),
  production: z.boolean(),
  migrationsAllowed: z.boolean(),
});
const deploymentEventSchema = z.object({
  id: z.uuid(),
  status: deploymentStatusSchema,
  description: z.string().nullable(),
  logUrl: z.string().nullable(),
  receivedAt: z.iso.datetime(),
}).meta({ id: 'DeploymentEvent' });
const deploymentDetailSchema = deploymentSummarySchema.extend({
  commitUrl: z.string(),
  commitMessage: z.string(),
  failureStage: z.string().nullable(),
  failureCode: z.string().nullable(),
  events: z.array(deploymentEventSchema),
}).meta({ id: 'DeploymentDetail' });
const deployErrors = {
  ...authErrors,
  404: errorResponse('资源不存在'),
  409: errorResponse('存在活动发布或资源冲突'),
  422: errorResponse('配置缺失或 Git ref 不符合环境规则'),
};

const targetRoleSchema = z.enum(['frontend', 'backend']);
const releaseStatusSchema = z.enum([
  'blocked', 'queued', 'running', 'succeeded', 'partial', 'failed', 'cancelling', 'cancelled',
]);
const pageQueryShape = {
  cursor: z.string().max(128).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
};
const page = <T extends z.ZodType>(schema: T) => z.object({
  items: z.array(schema), nextCursor: z.string().nullable(),
});
const deployRepositorySchema = z.object({
  id: z.uuid(),
  githubRepositoryId: z.string(),
  fullName: z.string(),
  owner: z.string(),
  installationId: z.string().nullable(),
  defaultBranch: z.string().nullable(),
  htmlUrl: z.url(),
  manifestPath: z.string(),
  manifestVersion: z.number().int().nullable(),
  controlSha: z.string().nullable(),
  enabled: z.boolean(),
  projectCount: z.number().int().nonnegative(),
  synchronizedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}).meta({ id: 'DeployRepository' });
const repositorySyncSchema = z.object({
  repositoryId: z.uuid(), synchronized: z.number().int().nonnegative(), manifestSha: z.string(),
});
const githubId = z.string().regex(/^[1-9][0-9]{0,15}$/u);
const deployTargetSchema = z.object({
  id: z.uuid(), key: z.string(), name: z.string(),
  role: targetRoleSchema, environment: z.string(), runnerLabel: z.string(),
  expectedOs: z.string(), expectedArch: z.string(), deployRoot: z.string(), configRoot: z.string(),
  enabled: z.boolean(), legacy: z.boolean(),
  agentStatus: z.enum(['pending', 'online', 'degraded', 'offline', 'disabled']),
  lastSeenAt: z.iso.datetime().nullable(), lastSnapshotAt: z.iso.datetime().nullable(),
  lastErrorCode: z.string().nullable(),
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
}).meta({ id: 'DeployTarget' });
const releaseBatchSchema = z.object({
  id: z.uuid(), repositoryId: z.uuid(), environmentName: z.string(),
  mode: z.enum(['single', 'full', 'rollback']),
  requestedRef: z.string(), resolvedSha: z.string(), controlSha: z.string(),
  actorUsername: z.string(), status: releaseStatusSchema, legacy: z.boolean(),
  confirmationVerified: z.boolean(), migrationRiskAcknowledged: z.boolean(),
  failureStage: z.string().nullable(), failureCode: z.string().nullable(),
  createdAt: z.iso.datetime(), startedAt: z.iso.datetime().nullable(), finishedAt: z.iso.datetime().nullable(),
}).meta({ id: 'DeployReleaseBatch' });
const migrationGateSchema = z.object({
  id: z.uuid(), releaseItemId: z.uuid(), unitId: z.string(),
  baseSha: z.string().nullable(), targetSha: z.string(), changedPaths: z.array(z.string()),
  status: z.enum(['required', 'verified', 'waived']),
  workflowRunId: z.string().nullable(), workflowRunUrl: z.string().nullable(),
  verifiedActor: z.uuid().nullable(), verifiedAt: z.iso.datetime().nullable(), note: z.string().nullable(),
}).meta({ id: 'DeployMigrationGate' });
const releaseItemSchema = z.object({
  id: z.uuid(), batchId: z.uuid(), projectId: z.uuid(), environmentId: z.uuid(), targetId: z.uuid(),
  wave: z.number().int().nonnegative(), dependencies: z.array(z.string()), desiredSha: z.string(),
  status: z.enum(['waiting', 'queued', 'building', 'deploying', 'verifying', 'succeeded', 'failed', 'skipped', 'cancelled', 'inactive']),
  migrationRequired: z.boolean(),
  migrationGateStatus: z.enum(['not_required', 'required', 'verified', 'waived', 'legacy_unknown']),
  currentDeploymentId: z.uuid().nullable(),
  createdAt: z.iso.datetime(), startedAt: z.iso.datetime().nullable(), finishedAt: z.iso.datetime().nullable(),
  migrationGate: migrationGateSchema.nullable(),
}).meta({ id: 'DeployReleaseItem' });
const auditEntrySchema = z.object({
  id: z.uuid(), actorSubject: z.uuid().nullable(), actorUsername: z.string().nullable(),
  action: z.string(), resourceType: z.string(), resourceId: z.string().nullable(),
  outcome: z.enum(['success', 'failure']), reason: z.string(), requestId: z.string().nullable(),
  createdAt: z.iso.datetime(),
  metadata: z.object({
    repositoryId: z.uuid().optional(), targetId: z.uuid().optional(),
    releaseId: z.uuid().optional(), deploymentId: z.uuid().optional(), code: z.string().optional(),
  }).nullable(),
}).meta({ id: 'DeployAuditEntry' });

export const adminContract = {
  service: 'pr-admin',
  namespace: '/admin',
  title: 'PR Admin API',
  apiContract: {
    getAdminHealth: healthOperation('getAdminHealth', ['pr-admin']),
    getAdminReadiness: readinessOperation('getAdminReadiness'),
    getAdminAuthSession: {
      operationId: 'getAdminAuthSession', method: 'get', path: '/auth/session',
      summary: '读取管理平台登录状态', exposure: 'public', clients: ['pr-admin'],
      responses: { 200: success(authSessionDataSchema), ...authErrors },
    },
    startAdminAuthLogin: {
      operationId: 'startAdminAuthLogin', method: 'get', path: '/auth/login',
      summary: '开始管理平台 OIDC 登录（顶层导航）', exposure: 'public', clients: [],
      request: { query: z.object({ returnTo: z.string().max(1024).optional() }) },
      responses: { 302: { description: '跳转到统一登录授权端点' }, ...authErrors },
    },
    completeAdminAuthLogin: {
      operationId: 'completeAdminAuthLogin', method: 'get', path: '/auth/callback',
      summary: '完成管理平台 OIDC 登录（顶层导航）', exposure: 'public', clients: [],
      responses: { 303: { description: '登录完成后跳转到管理平台页面' }, ...authErrors },
    },
    startAdminAuthLogout: {
      operationId: 'startAdminAuthLogout', method: 'post', path: '/auth/logout',
      summary: '退出管理平台并开始统一退出', exposure: 'public', clients: ['pr-admin'],
      request: { body: jsonBody(csrfInputSchema) },
      responses: { 200: success(resumeDataSchema), ...authErrors },
    },
    listDeployRepositories: {
      operationId: 'listDeployRepositories', method: 'get', path: '/deploy/repositories',
      summary: '查询已同步仓库目录', exposure: 'public', clients: ['pr-admin'],
      responses: { 200: success(z.array(deployRepositorySchema)), ...deployErrors },
    },
    listAvailableDeployRepositories: {
      operationId: 'listAvailableDeployRepositories', method: 'get', path: '/deploy/repositories/available',
      summary: '查询 GitHub App 可导入仓库', exposure: 'public', clients: ['pr-admin'],
      responses: { 200: success(z.array(z.object({
        githubRepositoryId: githubId, installationId: githubId,
        fullName: z.string(), defaultBranch: z.string(), htmlUrl: z.url(),
      }))), ...deployErrors },
    },
    importDeployRepository: {
      operationId: 'importDeployRepository', method: 'post', path: '/deploy/repositories/import',
      summary: '校验并导入 GitHub 仓库与发布清单', exposure: 'public', clients: ['pr-admin'],
      request: { body: jsonBody(z.strictObject({
        csrfToken: z.string().min(1).max(512), githubRepositoryId: githubId, installationId: githubId,
      })) },
      responses: { 200: success(repositorySyncSchema), ...deployErrors },
    },
    syncDeployRepository: {
      operationId: 'syncDeployRepository', method: 'post', path: '/deploy/repositories/{repositoryId}/sync',
      summary: '从仓库默认分支同步发布清单', exposure: 'public', clients: ['pr-admin'],
      request: { params: z.object({ repositoryId: z.uuid() }), body: jsonBody(csrfInputSchema) },
      responses: { 200: success(repositorySyncSchema), ...deployErrors },
    },
    getDeployRepository: {
      operationId: 'getDeployRepository', method: 'get', path: '/deploy/repositories/{repositoryId}',
      summary: '查询仓库目录详情', exposure: 'public', clients: ['pr-admin'],
      request: { params: z.object({ repositoryId: z.uuid() }) },
      responses: { 200: success(deployRepositorySchema), ...deployErrors },
    },
    listDeployTargets: {
      operationId: 'listDeployTargets', method: 'get', path: '/deploy/targets',
      summary: '查询目标主机目录', exposure: 'public', clients: ['pr-admin'],
      responses: { 200: success(z.array(deployTargetSchema)), ...deployErrors },
    },
    getDeployTarget: {
      operationId: 'getDeployTarget', method: 'get', path: '/deploy/targets/{targetId}',
      summary: '查询目标主机详情（不包含凭据）', exposure: 'public', clients: ['pr-admin'],
      request: { params: z.object({ targetId: z.uuid() }) },
      responses: { 200: success(deployTargetSchema), ...deployErrors },
    },
    listDeployReleases: {
      operationId: 'listDeployReleases', method: 'get', path: '/deploy/releases',
      summary: '分页查询发布批次', exposure: 'public', clients: ['pr-admin'],
      request: { query: z.object({
        ...pageQueryShape, repositoryId: z.uuid().optional(),
        environmentName: z.string().max(255).optional(), status: releaseStatusSchema.optional(),
      }) },
      responses: { 200: success(page(releaseBatchSchema)), ...deployErrors },
    },
    getDeployRelease: {
      operationId: 'getDeployRelease', method: 'get', path: '/deploy/releases/{releaseId}',
      summary: '查询批次、发布项和迁移门禁', exposure: 'public', clients: ['pr-admin'],
      request: { params: z.object({ releaseId: z.uuid() }) },
      responses: { 200: success(releaseBatchSchema.extend({ items: z.array(releaseItemSchema) })), ...deployErrors },
    },
    listDeployAudit: {
      operationId: 'listDeployAudit', method: 'get', path: '/deploy/audit',
      summary: '分页查询发布审计摘要', exposure: 'public', clients: ['pr-admin'],
      request: { query: z.object({
        ...pageQueryShape,
        actor: z.string().max(255).optional(), action: z.string().max(255).optional(),
        resourceType: z.string().max(255).optional(), resourceId: z.string().max(255).optional(),
        outcome: z.enum(['success', 'failure']).optional(),
        from: z.iso.datetime().optional(), to: z.iso.datetime().optional(),
      }) },
      responses: { 200: success(page(auditEntrySchema)), ...deployErrors },
    },
    listDeployProjects: {
      operationId: 'listDeployProjects', method: 'get', path: '/deploy/projects',
      summary: '查询可发布项目', exposure: 'public', clients: ['pr-admin'],
      responses: { 200: success(z.array(deployProjectSchema)), ...deployErrors },
    },
    getDeployProject: {
      operationId: 'getDeployProject', method: 'get', path: '/deploy/projects/{projectId}',
      summary: '查询发布项目详情', exposure: 'public', clients: ['pr-admin'],
      request: { params: projectParams },
      responses: { 200: success(deployProjectSchema), ...deployErrors },
    },
    syncDeployProjects: {
      operationId: 'syncDeployProjects', method: 'post', path: '/deploy/projects/sync',
      summary: '从默认分支同步发布清单', exposure: 'public', clients: ['pr-admin'],
      request: { body: jsonBody(csrfInputSchema) },
      responses: { 200: success(z.object({ synchronized: z.number().int().nonnegative(), manifestSha: z.string() })), ...deployErrors },
    },
    listDeployEnvironments: {
      operationId: 'listDeployEnvironments', method: 'get', path: '/deploy/projects/{projectId}/environments',
      summary: '查询项目发布环境', exposure: 'public', clients: ['pr-admin'],
      request: { params: projectParams },
      responses: { 200: success(z.array(deployEnvironmentSchema)), ...deployErrors },
    },
    createDeployEnvironment: {
      operationId: 'createDeployEnvironment', method: 'post', path: '/deploy/projects/{projectId}/environments',
      summary: '创建项目发布环境', exposure: 'public', clients: ['pr-admin'],
      request: { params: projectParams, body: jsonBody(environmentInputSchema) },
      responses: { 200: success(deployEnvironmentSchema), ...deployErrors },
    },
    updateDeployEnvironment: {
      operationId: 'updateDeployEnvironment', method: 'patch', path: '/deploy/environments/{environmentId}',
      summary: '更新项目发布环境', exposure: 'public', clients: ['pr-admin'],
      request: { params: environmentParams, body: jsonBody(environmentInputSchema.partial().required({ csrfToken: true })) },
      responses: { 200: success(deployEnvironmentSchema), ...deployErrors },
    },
    getDeployEnvironmentConfiguration: {
      operationId: 'getDeployEnvironmentConfiguration', method: 'get', path: '/deploy/environments/{environmentId}/configuration',
      summary: '检查项目环境配置', exposure: 'public', clients: ['pr-admin'],
      request: { params: environmentParams },
      responses: { 200: success(z.object({
        complete: z.boolean(),
        settingsUrl: z.url(),
        entries: z.array(z.object({
          name: z.string(),
          scope: z.enum(['build', 'runtime', 'migration']),
          required: z.boolean(),
          sensitive: z.boolean(),
          configured: z.boolean(),
          value: z.string().nullable(),
          description: z.string(),
        })),
      })), ...deployErrors },
    },
    listDeployRefs: {
      operationId: 'listDeployRefs', method: 'get', path: '/deploy/projects/{projectId}/refs',
      summary: '查询可选择的 Git refs', exposure: 'public', clients: ['pr-admin'],
      request: { params: projectParams },
      responses: { 200: success(z.object({
        defaultBranch: z.string(),
        branches: z.array(z.object({ name: z.string(), sha: z.string() })),
        tags: z.array(z.object({ name: z.string(), sha: z.string() })),
      })), ...deployErrors },
    },
    listDeployments: {
      operationId: 'listDeployments', method: 'get', path: '/deploy/deployments',
      summary: '查询发布记录', exposure: 'public', clients: ['pr-admin'],
      request: { query: z.object({
        projectId: z.uuid().optional(),
        environmentId: z.uuid().optional(),
        status: deploymentStatusSchema.optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      }) },
      responses: { 200: success(z.array(deploymentSummarySchema)), ...deployErrors },
    },
    getDeployment: {
      operationId: 'getDeployment', method: 'get', path: '/deploy/deployments/{deploymentId}',
      summary: '查询发布详情', exposure: 'public', clients: ['pr-admin'],
      request: { params: deploymentParams },
      responses: { 200: success(deploymentDetailSchema), ...deployErrors },
    },
    createDeployment: {
      operationId: 'createDeployment', method: 'post', path: '/deploy/projects/{projectId}/deployments',
      summary: '创建项目发布', exposure: 'public', clients: ['pr-admin'],
      request: {
        params: projectParams,
        body: jsonBody(z.strictObject({
          csrfToken: z.string().min(1).max(512),
          environmentId: z.uuid(),
          ref: z.string().min(1).max(255),
          runMigration: z.boolean(),
          confirmation: z.string().max(128).optional(),
        })),
      },
      responses: { 200: success(deploymentDetailSchema), ...deployErrors },
    },
    rollbackDeployment: {
      operationId: 'rollbackDeployment', method: 'post', path: '/deploy/deployments/{deploymentId}/rollback',
      summary: '回滚到指定发布的应用制品', exposure: 'public', clients: ['pr-admin'],
      request: {
        params: deploymentParams,
        body: jsonBody(z.strictObject({
          csrfToken: z.string().min(1).max(512),
          confirmation: z.string().min(1).max(128),
        })),
      },
      responses: { 200: success(deploymentDetailSchema), ...deployErrors },
    },
    receiveGitHubDeploymentEvent: {
      operationId: 'receiveGitHubDeploymentEvent', method: 'post', path: '/deploy/github/events',
      summary: '接收 GitHub Deployment 状态事件', exposure: 'public', clients: [],
      responses: { 200: success(z.object({ accepted: z.boolean() })), ...deployErrors },
    },
  },
} as const;
