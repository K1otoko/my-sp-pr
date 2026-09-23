# Admin SSO 与 GitHub 发布模块分阶段计划

状态：根据评审反馈收敛，待确认后实施第一阶段。

## 1. Summary

### 1.1 最终建议

当前最合适的方案不是立刻自建完整 PaaS，而是：

```text
Admin 控制面
  -> GitHub Deployments API
  -> GitHub Actions 托管 runner 构建
  -> 目标 Linux 主机专用 self-hosted runner 发布
  -> Nginx + PM2 版本切换
```

职责边界：

- Admin：SSO、`super` 权限、项目目录、环境状态、选择 Git ref、发起发布、审计和查看结果。
- GitHub：仓库授权、ref/SHA、workflow、构建日志、Environment variables/secrets、部署审批和状态。
- 目标 runner：下载已构建制品、校验摘要、执行迁移、切换版本、PM2 reload、健康检查和代码回滚。
- Admin 不 clone 仓库、不运行构建脚本、不保存生产密钥明文，也不直接 SSH 到目标机。

这个方案适合当前仓库，原因是：

- 仓库已经具备单包 build、后端 `pnpm deploy`、显式数据库迁移和 PM2/Nginx 部署基础。
- 所有待发布代码都在用户控制的 GitHub 仓库中，GitHub Actions 可直接承担已有能力。
- Admin、Gateway 或 SSO 自身发布时，外部 workflow/runner 不会因控制面重启而中断。
- 构建和生产密钥隔离，比让 Admin 后端直接执行任意仓库代码安全。
- 将来改为 Docker/多主机时只替换 Actions 的部署适配器，Admin API 和数据模型可以保留。

### 1.2 本次实施范围

本次只实施可用且闭环的 MVP：

1. 增加 `super` 角色。
2. Admin 通过现有 SSO 登录；`admin` 和 `super` 可进入 Admin，只有 `super` 可访问发布模块。
3. 当前仓库通过一个受版本控制的 `deploy.manifest.json` 登记 7 个可独立发布的应用。
4. Admin 可选择项目、环境和允许的 branch/tag/SHA，解析并固定 commit SHA 后创建 GitHub deployment。
5. GitHub Actions 独立构建和发布每个目标，回写状态；Admin 展示历史、当前阶段和 GitHub 日志链接。
6. 环境变量按“项目 + 环境”隔离，但首版由 GitHub Environments 管理；Admin 只检查必填项是否配置并提供跳转，不读写 secret value。
7. 目标 Linux 主机采用版本目录、软链接、PM2/Nginx 和健康检查，保留最近 5 个成功版本。

本次不实施：

- Admin 内编辑 GitHub Environment variables/secrets。
- 从任意新仓库直接创建自定义构建命令。
- 账号管理 UI。
- 自动申请域名/TLS、自动创建数据库角色或修改防火墙。
- Docker、Kubernetes、蓝绿、金丝雀、多主机调度。
- 跨项目原子发布和数据库 down migration。

### 1.3 后续扩展

MVP 稳定后再实施第二阶段：

- 从 GitHub App 已安装、owner 白名单内的仓库读取 `deploy.manifest.json` 并在 Admin 中导入。
- Admin 管理普通 GitHub Environment variables。
- 评估是否增加 write-only secret 更新；即使增加也不允许回读值或保存到 Admin 数据库。
- 增加新的受审核 build/deploy preset，而不是允许用户填写任意 shell。

因此，未来新项目可以从模块配置，但有前提：

- 仓库已安装 GitHub App。
- 默认分支有合法 manifest 和标准 deployment workflow。
- 项目使用平台支持的 preset。
- 域名、端口、数据库和目标机目录已完成一次性基础设施准备。

“从页面新增项目”不等于自动创建本系统 API 契约、Gateway 上游、数据库 namespace 或生产域名。

## 2. Assumptions & Decisions

| 事项 | 决策 |
| --- | --- |
| 发布源 | 只允许用户 GitHub App installation 中、服务端 owner 白名单内的仓库 |
| 当前仓库 | `K1otoko/my-sp-pr`，owner 不硬编码，生产由配置提供 |
| 当前发布目标 | 3 个前端 + Gateway + 3 个业务后端，共 7 个 |
| 共享包 | contracts/database 作为构建依赖，不作为独立运行目标 |
| 执行模型 | GitHub 托管 runner 构建，目标 Linux self-hosted runner 发布 |
| 运行形态 | 保留 Nginx + PM2 |
| Admin 准入 | `admin`、`super` |
| 发布模块 | 仅 `super` |
| 首账号 | 新空库 bootstrap 创建 `super` |
| 已有账号 | 不自动升级，通过 CLI 显式提升 |
| Admin API | Admin 页面同源反代 `/api` 到 Gateway |
| 应用登录 | Authorization Code + PKCE、机密客户端、BFF Cookie |
| Git 策略 | 主干开发；发布允许受控 branch/tag/SHA；记录不可变 SHA |
| production ref | 默认仅主分支和版本 tag |
| 环境配置 | 每项目、每环境使用独立 GitHub Environment |
| secret | GitHub Environment secrets 为事实源，Admin 首版不可读写值 |
| 回滚 | 回滚应用制品，不自动回滚数据库迁移 |
| 并发 | 同项目、同环境只允许一个活动发布 |

### 2.1 `.env` 评估

需要支持“每项目、每环境配置”，但不建议在 Admin 中直接维护完整 `.env` 文本。

首版做法：

- `deploy.manifest.json` 声明每个项目允许和必须提供的变量。
- 非敏感值放 GitHub Environment variables。
- 敏感值放 GitHub Environment secrets。
- Admin 通过 GitHub API读取变量值和 secret 名称/更新时间，显示“完整/缺失”；secret value 永不可读。
- workflow 显式把允许的变量映射到构建、运行或迁移步骤。
- 目标 runner 使用 `umask 077` 生成运行环境文件，放在 release 目录之外。
- `DATABASE_MIGRATION_URL` 只进入迁移子进程，不能写入后端长期运行环境。
- `VITE_*` 是公开构建配置，UI 明确标识，不能用于保存密钥。
- `auth.json`、TLS 私钥等文件型密钥仍由目标机受保护路径维护，Admin 只配置路径引用。

不在首版把 secret 写入 Admin 的原因：

- GitHub 已提供权限、审计、环境审批和 secret 屏蔽。
- Admin 若管理 secret，需要额外的高权限 GitHub App scope 和加密实现，会显著扩大攻击面。
- 发布链路稳定前，没有必要复制 GitHub 已有的密钥管理 UI。

### 2.2 分支方案评估

“每个项目一条永久分支”可以运行，但不推荐：

- 当前 monorepo 的 contracts、database、Gateway 和生成 SDK 是共享依赖。
- 长期分支会导致共享修复重复合并、版本漂移和兼容性不清。
- branch 是可变引用，不能作为审计和回滚版本。

采用：

- 每个仓库以 `main/master` 为主线。
- 功能分支可临时发布到 staging。
- production 默认只允许主分支和版本 tag。
- Admin 提交发布时先把 ref 解析为 commit SHA。
- GitHub Deployment、构建、制品元数据和发布记录全部使用该 SHA。
- branch 后续移动不会改变已创建的发布。

如果以后确实保留 release branch，平台可把它加入允许规则，但仍先解析为 SHA。

## 3. Current State Analysis

### 3.1 Admin

- `frontend/pr-admin/src/App.tsx` 只有首页、关于和 404。
- `frontend/pr-admin/src/components/AppLayout.tsx` 没有用户态和权限导航。
- `backend/pr-admin/src/routes/index.ts` 只有 health/ready。
- `backend/pr-admin/src/db/schema/index.ts` 只有空 `admin` schema。
- 当前不能安全承载发布能力。

### 3.2 SSO

- `backend/contracts/src/shared.ts` 和 `backend/pr-auth/src/db/schema/index.ts` 只允许 `admin | user`。
- pr-auth 已有 Authorization Code + PKCE、静态机密客户端、角色准入、UserInfo、refresh token、中央会话和角色变化撤销。
- 默认只内置 SSO portal；`pr-admin` 还不是 OIDC 客户端。
- SSO portal Cookie 不能跨应用复用；Admin 必须建立自己的 BFF session。

### 3.3 构建发布

- 当前 7 个运行应用都有独立 build。
- 后端可使用 `pnpm --filter <包> deploy --prod --legacy` 打包，业务后端产物包含 contracts、database 和 drizzle。
- 数据库已有显式迁移、独立迁移账号和 advisory lock。
- `ecosystem.config.cjs` 固定启动四个后端，但没有版本目录、单项目发布、制品摘要、发布锁和回滚。
- 仓库没有 GitHub workflow、Docker、制品仓库或发布记录。

### 3.4 动态项目的真实边界

部署目录可以动态扩展，但本系统的新 API 服务仍需代码变更：

- `backend/contracts/src/contract.ts` 静态聚合服务。
- `backend/contracts/src/shared.ts` 静态声明 SDK consumer。
- `scripts/api-projects.ts` 静态映射生成目录。
- Gateway 上游也是受控配置。

所以后续“导入新项目”只解决构建发布注册，不替代应用研发和基础设施接入。

## 4. Target Architecture

### 4.1 发布流程

1. `super` 在 Admin 选择项目、环境和 ref。
2. pr-admin 读取 GitHub commit，校验 ref 策略并保存 resolved SHA。
3. pr-admin 在事务中创建本地 deployment；同项目/环境已有活动发布时返回 409。
4. pr-admin 使用 GitHub App installation token 创建 GitHub Deployment：
   - ref 使用 SHA。
   - `auto_merge=false`。
   - payload 只含本地 deployment ID、manifest unit ID、环境和非敏感参数。
5. `.github/workflows/deploy.yml` 响应 `deployment` 事件。
6. GitHub 托管 runner 构建：
   - checkout 精确 SHA。
   - Node.js 24、pnpm 10.25.0、frozen lockfile。
   - 校验 manifest/unit。
   - 按固定 preset 构建单个目标和必要依赖。
   - 生成制品、`release.json` 和 SHA256 清单。
   - 不绑定 production environment，不获得 production secrets。
7. 目标机 self-hosted runner 发布：
   - 不 checkout 源码，不运行 install/build。
   - 下载并校验制品。
   - 绑定对应 GitHub Environment，取得显式映射的运行/迁移配置。
   - 安装到新版本目录。
   - 必要时先执行 migration。
   - 切换 `current` 并 reload 单个 PM2 应用，或切换前端静态目录。
   - 执行 readiness/health/release SHA 检查。
   - 失败时恢复上一应用制品；数据库不回滚。
8. workflow 写 GitHub deployment status 和 `log_url`。
9. GitHub webhook 推送 `deployment_status`，pr-admin 验签、去重并更新本地记录。
10. Admin 轮询本地状态；原始日志留在 GitHub。

### 4.2 目标机目录

```text
/srv/my-sp-pr/<project>/<environment>/
  releases/<sha>-<deployment-id>/
  current -> releases/<...>/
  previous -> releases/<...>/

/etc/my-sp-pr/<project>/<environment>/
  runtime.env
  files/
```

- `runtime.env` 权限 `0600`，不放进 release，不进入 Git。
- 前端 Nginx root 指向 `current/dist`。
- 后端 PM2 使用固定名称和 `current/dist/server.js`。
- 每个项目/环境保留最近 5 个成功版本。
- `current`、`previous` 和仍运行的版本不能清理。

### 4.3 当前 preset

首版只有两个受控 preset，不接受数据库中的任意命令：

`pnpm-vite-static-v1`

- 运行接口生成、目标 typecheck 和目标 build。
- 制品为目标包 `dist/`。
- 只接收声明过的公开 build variables。

`pnpm-node-service-v1`

- 运行接口生成、必要的 database build、目标依赖闭包 typecheck/build。
- 使用 `pnpm deploy --prod --legacy` 生成独立产物。
- 入口固定为 `dist/server.js`。
- 只有 manifest 声明后才能执行 `dist/db/migrate.js`。

当前 7 个 unit：

- `pr-chat-web`
- `pr-admin-web`
- `pr-sso-web`
- `gateway`
- `pr-chat-api`
- `pr-auth-api`
- `pr-admin-api`

## 5. Data Model

在 `backend/pr-admin/src/db/schema/index.ts` 增加：

### 5.1 `admin_auth_flows`

- state/nonce/flow token 摘要。
- 加密 PKCE verifier。
- 浏览器绑定、return path、创建/过期/消费时间。
- 10 分钟过期，只能消费一次。

### 5.2 `admin_sessions`

- 随机 Cookie token 摘要。
- SSO subject、username、display name、当前 role。
- 加密 access/refresh/id token。
- CSRF secret、创建/活动/过期/撤销时间。
- 最长 7 天、空闲 24 小时，不能超过中央会话。

### 5.3 `deploy_projects`

- UUID、slug、名称。
- GitHub repository ID/full name。
- manifest unit ID/preset、package name/path、artifact path。
- 默认 ref、启用状态、manifest SHA/version、时间戳。
- `(repository_id, unit_id)` 唯一。

MVP 由当前 `deploy.manifest.json` 同步 7 条记录，不提供任意表单创建。

### 5.4 `deploy_environments`

- project ID、环境名、GitHub Environment 名、目标 runner key。
- public origin/health URL。
- 允许 ref 规则、production 标记、migration 开关。
- `(project_id, name)` 唯一。

### 5.5 `deployments`

- project/environment。
- 发起人 SSO subject/username。
- requested ref、resolved SHA、commit URL/message 摘要。
- GitHub deployment ID、状态、log URL。
- migration 请求/执行标志、失败阶段、脱敏错误码。
- created/queued/started/finished 时间。
- 活动状态部分唯一索引，阻止同项目/环境并发。

状态机：

```text
requested -> queued -> in_progress -> succeeded
                              \-> failed
requested/queued/in_progress  \-> error
历史成功版本                 -> inactive
```

MVP 不提供取消运行中 workflow。重试和回滚创建新 deployment。

### 5.6 `deployment_events`

- deployment ID。
- GitHub delivery/status ID。
- status、description、log URL、received at。
- delivery ID 唯一，确保 webhook 重放幂等。

### 5.7 `admin_audit_logs`

- actor、action、resource type/id、outcome、request ID、created at。
- 记录 manifest 同步、环境修改、发起发布、失败和回滚。
- 不记录 token、secret、数据库 URL、完整 webhook payload 或构建日志。

新增 `backend/pr-admin/drizzle/0002_admin_auth_deploy_mvp.sql` 及 Drizzle journal/snapshot；不修改已有迁移。

## 6. SSO And Role Changes

### 6.1 共享角色

修改：

- `backend/contracts/src/shared.ts`
  - `authRoleSchema` 变为 `['super', 'admin', 'user']`。
- `backend/pr-auth/src/db/schema/index.ts`
  - role enum 提示和 check 加入 `super`，默认仍为 `user`。
- 新增 `backend/pr-auth/drizzle/0003_add_super_role.sql`
  - 只替换角色 CHECK，不改已有迁移。

### 6.2 账号规则

修改 `backend/pr-auth/src/services/account.service.ts`：

- 新空库 bootstrap 创建 `super`。
- 禁止禁用或降级最后一个有效 `super`。
- role/status 变化继续递增 `auth_version` 并撤销全部会话。
- `super` 不自动匹配所有客户端；每个 OIDC client 仍显式声明 allowed roles。

新增：

- `backend/pr-auth/src/scripts/set-role.ts`
- `backend/pr-auth/package.json` 的 `auth:set-role`

命令：

```sh
pnpm --filter @my-sp-pr/pr-auth-api auth:set-role <username> super
```

现有 admin 不自动提升，避免迁移静默扩大权限。

### 6.3 Admin OIDC client

在 pr-auth 静态配置中登记：

- client ID：`pr-admin`
- scopes：`openid profile roles`
- allowed roles：`super/admin`
- Authorization Code + PKCE S256
- refresh token：启用
- redirect/post logout URI：由 `ADMIN_PUBLIC_ORIGIN` 精确确定

client secret 只存在于 pr-auth 和 pr-admin 的受保护配置，不进入前端。

修改 `backend/pr-auth/src/config/auth.ts`，使内置 SSO portal 允许显示三种角色；修改 `frontend/pr-sso/src/pages/SessionPage.tsx` 显示正确角色名。

## 7. Admin BFF Authentication

### 7.1 契约

在 `backend/contracts/src/admin.contract.ts` 增加：

- `GET /api/admin/auth/session`
- `GET /api/admin/auth/login`
- `GET /api/admin/auth/callback`
- `POST /api/admin/auth/logout`

登录 start/callback 是顶层导航；session/logout 使用 JSON。

### 7.2 后端

修改：

- `backend/pr-admin/package.json`
  - 增加与现有 auth 服务一致版本的 `openid-client`。
  - 增加 `jose`，用于 GitHub App JWT，声明为直接依赖。
- `backend/pr-admin/src/config/env.ts`
- `backend/pr-admin/.env.example`
  - `ADMIN_PUBLIC_ORIGIN`
  - `SSO_PUBLIC_ORIGIN`
  - OIDC client ID/secret
  - Admin token 加密 key ring
  - GitHub App ID/private key/webhook secret
  - GitHub owner 和 runner target 白名单

新增：

- `backend/pr-admin/src/auth/oidc-client.ts`
- `backend/pr-admin/src/auth/browser-security.ts`
- `backend/pr-admin/src/auth/token-crypto.ts`
- `backend/pr-admin/src/repositories/admin-session.repository.ts`
- `backend/pr-admin/src/controllers/auth.controller.ts`
- `backend/pr-admin/src/routes/auth.routes.ts`
- `backend/pr-admin/src/middlewares/require-auth.ts`
- `backend/pr-admin/src/middlewares/require-super.ts`

鉴权规则：

- 浏览器只持随机 HttpOnly、Secure、SameSite=Lax Cookie。
- state、nonce 和 PKCE verifier 一次性消费。
- 所有写操作校验同源与 CSRF。
- 每个发布 API 请求通过当前 token 调 SSO UserInfo；过期时事务轮换 refresh token 后重试一次。
- 用户禁用/改角色导致中央 token/session 失效时删除 Admin session。
- pr-auth 不可用时 fail closed，返回 503，不能使用缓存角色继续发布。

Admin 与 Gateway 同源，不增加全局 credentialed CORS。

## 8. Deployment APIs

在 `backend/contracts/src/admin.contract.ts` 定义并生成 SDK：

- `GET /api/admin/deploy/projects`
- `GET /api/admin/deploy/projects/{projectId}`
- `POST /api/admin/deploy/projects/sync`
  - 从当前仓库默认分支的 manifest 同步 7 个 unit。
- `GET /api/admin/deploy/projects/{projectId}/environments`
- `POST/PATCH /api/admin/deploy/projects/{projectId}/environments`
- `GET /api/admin/deploy/environments/{environmentId}/configuration`
  - 返回 manifest 需要的 variable/secret 名称、用途、配置状态和 GitHub 设置链接；不返回 secret value。
- `GET /api/admin/deploy/projects/{projectId}/refs`
- `GET /api/admin/deploy/deployments`
- `GET /api/admin/deploy/deployments/{deploymentId}`
- `POST /api/admin/deploy/projects/{projectId}/deployments`
- `POST /api/admin/deploy/deployments/{deploymentId}/rollback`
- `POST /api/admin/deploy/github/events`

所有浏览器 `/deploy/*` 接口要求：

- 有效 Admin session。
- 当前 SSO UserInfo 在线有效。
- `role === 'super'`。
- 写操作通过 CSRF。

Webhook 例外：

- 在普通 JSON parser 前读取原始 body。
- 使用 `X-Hub-Signature-256` 恒定时间验签。
- `X-GitHub-Delivery` 去重。
- 只接受 `deployment_status` 等白名单事件。
- repository ID、GitHub deployment ID 和本地 deployment ID 必须匹配。

Gateway：

- 继续由公开契约自动登记精确路由。
- Admin OIDC callback 使用 20 秒代理期限。
- 其他请求维持 8 秒。

## 9. Admin Backend Structure

新增：

- `backend/pr-admin/src/github/github-app.ts`
  - 生成短期 installation token，只在内存提前过期缓存。
- `backend/pr-admin/src/github/github-client.ts`
  - Node 24 `fetch`、统一超时/分页/错误映射。
- `backend/pr-admin/src/github/webhook.ts`
- `backend/pr-admin/src/deploy/manifest.ts`
  - Zod 校验 manifest，禁止绝对路径、`..`、未知 preset 和 shell 命令。
- `backend/pr-admin/src/repositories/deploy.repository.ts`
- `backend/pr-admin/src/services/project.service.ts`
- `backend/pr-admin/src/services/environment.service.ts`
- `backend/pr-admin/src/services/deployment.service.ts`
- `backend/pr-admin/src/controllers/deploy.controller.ts`
- `backend/pr-admin/src/routes/deploy.routes.ts`
- `backend/pr-admin/src/routes/github-webhook.routes.ts`

修改：

- `backend/pr-admin/src/app.ts`
  - webhook raw body 路由先于 `express.json({ limit: '100kb' })`。
- `backend/pr-admin/src/routes/index.ts`
  - 装配 auth/deploy routes。

GitHub 约束：

- 只使用 installation token，不使用个人 PAT。
- repository ID 和 owner 均需校验。
- ref 创建 deployment 前解析为 SHA。
- 外部错误、commit message 和 status description 清理控制字符并限制长度。
- Admin 数据库不保存 GitHub token。

## 10. Admin Frontend

修改：

- `frontend/pr-admin/src/App.tsx`
  - session gate、403、项目、环境和 deployment 路由。
- `frontend/pr-admin/src/components/AppLayout.tsx`
  - 桌面侧栏、窄屏 Drawer、当前用户和退出菜单。
  - admin 不显示发布导航；直接访问仍由后端返回 403。
- `frontend/pr-admin/src/api/client.ts`
  - 保持同源 `/api` 和 Cookie，沿用 request/abort/error 处理。

新增：

- `frontend/pr-admin/src/hooks/useAdminSession.ts`
- deploy 领域 hooks。
- `LoginRequiredPage.tsx`
- `ForbiddenPage.tsx`
- `DeployProjectsPage.tsx`
- `DeployProjectPage.tsx`
- `DeployEnvironmentPage.tsx`
- `DeploymentDetailPage.tsx`

界面：

- 项目列表：类型、仓库/unit、默认 ref、环境完整性、最近发布。
- 项目详情：环境表、发布历史、同步 manifest。
- 环境页：所需 variables/secrets 的配置状态和 GitHub Environment 设置链接。
- 发布弹窗：环境、branch/tag/SHA、解析后的 commit、migration 选择和 production 确认。
- 发布详情：结构化时间线、状态、SHA、操作者、迁移标志、GitHub 日志链接和回滚。

设计约束：

- 沿用 Ant Design 6、现有主题和蓝灰视觉。
- 运维界面采用紧凑表格与清晰层级，不使用营销 hero、装饰插画、嵌套卡片或大字号。
- 非终态 deployment 使用 ahooks 轮询，切页/卸载取消旧请求。
- 覆盖 loading、空状态、403、GitHub 不可用、配置缺失、冲突、失败和成功。
- production 发布、迁移和回滚必须二次确认。

## 11. Manifest, Workflow And Runner

### 11.1 仓库文件

新增：

- `deploy.manifest.json`
  - 当前 7 个 unit。
  - preset、package name/path、artifact path、migration 能力、health check。
  - build/runtime/migration variables 的名称、是否必填和是否敏感。
- `.github/workflows/deploy.yml`
  - 仅监听 `deployment`，不监听 pull request。
  - build/deploy 两个隔离 job。
  - 同 repository/unit/environment 的 concurrency group。
  - 默认 `permissions: contents: read`，仅状态步骤增加 `deployments: write`。
  - 第三方 action 固定完整 commit SHA。
- `scripts/deploy/`
  - manifest 校验。
  - 当前 preset 的构建。
  - 制品元数据和 SHA256。
  - 版本安装、环境文件、迁移、切换、健康检查、清理和回滚。
- `deploy/pm2/ecosystem.config.cjs`
  - 发布目录使用的固定应用定义，支持 `--only` 单服务。

现有 `ecosystem.config.cjs` 保留完整 workspace 运行用途，除非实现时只需补兼容参数，不重写现有本地行为。

### 11.2 构建矩阵

- 前端：
  - `pnpm generate:api`
  - 目标包 typecheck
  - 目标包 build
- Gateway：
  - `pnpm generate:api`
  - 目标依赖闭包 typecheck/build
  - `pnpm deploy --prod --legacy`
- chat/auth/admin API：
  - `pnpm generate:api`
  - `pnpm build:database`
  - 目标依赖闭包 typecheck/build
  - `pnpm deploy --prod --legacy`

### 11.3 目标机安全

- self-hosted runner 只用于 deployment job。
- 只绑定用户控制的选定仓库。
- 不执行 PR/fork workflow。
- 独立 OS 用户，不授予通用 sudo。
- 只拥有 `/srv/my-sp-pr`、对应 `/etc/my-sp-pr` 文件和自己的 PM2 进程。
- release job 不 checkout 源码、不运行 dependency install/build。
- GitHub Environment secrets 只映射给明确步骤和明确环境变量。

GitHub 官方说明 self-hosted runner 不是一次性干净 VM，因此不能将其用于不可信构建：

- https://docs.github.com/en/actions/reference/security/secure-use

### 11.4 健康检查和回滚

- 前端生成无 secret 的 `release.json`，切换后从 public origin 校验 SHA。
- Gateway 检查 `/api/health`。
- 业务后端先从目标机检查内部 `/api/<service>/ready`，再经 Gateway 检查公开 health。
- 健康失败恢复 `previous` 并重新检查。
- migration 成功但应用失败时，只回滚代码并明确标记数据库未回滚。
- 数据库变更必须遵循 expand/contract 兼容策略。

## 12. Failure Modes

- SSO 不可用：发布 API 503，fail closed。
- user 登录 Admin：拒绝准入。
- admin 访问发布接口：403。
- GitHub App/installation 失效：禁止新发布，历史仍可读。
- ref 不存在或不满足环境规则：不创建 GitHub deployment。
- manifest 变化：同步后要求 super 重新确认。
- 同环境已有活动发布：409。
- GitHub API 超时：本地记录 error，可创建新的重试记录，不冒充成功。
- webhook 错误签名：403；重复 delivery：幂等返回。
- webhook 乱序：终态不被旧状态覆盖。
- build 失败：不进入目标机，不接触 production secret。
- migration 失败：不切换 release。
- reload/health 失败：回退上一制品；数据库不回退。
- Admin 自发布：外部 workflow 继续；服务恢复后通过 webhook/API 对账。
- secret 缺失：发布前显示配置不完整并阻止提交。

## 13. Proposed File Changes

### 13.1 Contracts and generation

- `backend/contracts/src/shared.ts`
- `backend/contracts/src/admin.contract.ts`
- 自动生成的 contracts dist、Gateway/Admin OpenAPI、Admin SDK

### 13.2 Auth

- `backend/pr-auth/src/db/schema/index.ts`
- `backend/pr-auth/drizzle/0003_add_super_role.sql`
- `backend/pr-auth/drizzle/meta/*`
- `backend/pr-auth/src/config/auth.ts`
- `backend/pr-auth/src/services/account.service.ts`
- `backend/pr-auth/src/scripts/set-role.ts`
- `backend/pr-auth/src/tests/verify-auth.ts`
- `backend/pr-auth/package.json`
- `frontend/pr-sso/src/pages/SessionPage.tsx`

### 13.3 Admin backend

- `backend/pr-admin/package.json`
- `backend/pr-admin/.env.example`
- `backend/pr-admin/src/config/env.ts`
- `backend/pr-admin/src/db/schema/index.ts`
- `backend/pr-admin/drizzle/0002_admin_auth_deploy_mvp.sql`
- `backend/pr-admin/drizzle/meta/*`
- `backend/pr-admin/src/app.ts`
- `backend/pr-admin/src/routes/index.ts`
- 新增 `src/auth/`、auth/deploy controllers/routes/middlewares、GitHub client、repositories 和 services

### 13.4 Admin frontend

- `frontend/pr-admin/src/App.tsx`
- `frontend/pr-admin/src/components/AppLayout.tsx`
- `frontend/pr-admin/src/api/client.ts`
- 新增 session/deploy hooks、页面和领域组件

### 13.5 Release infrastructure

- `deploy.manifest.json`
- `.github/workflows/deploy.yml`
- `scripts/deploy/*`
- `deploy/pm2/ecosystem.config.cjs`
- 必要时小范围调整根 `package.json`、`ecosystem.config.cjs`、`.gitignore`

### 13.6 Documentation

- `README.md`
- `AGENTS.md`

## 14. Implementation Order

1. 增加 `super` 契约、auth schema/迁移、bootstrap/角色 CLI 和 SSO 展示。
2. 为 pr-admin 实现 OIDC BFF session、CSRF、在线 UserInfo 和 `requireSuper`。
3. 增加 admin 发布数据表、契约、repository/service/controller/routes。
4. 实现 GitHub App、ref 解析、Environment 配置状态和 webhook。
5. 实现 GitHub Deployment 创建、状态机、并发锁、审计和回滚记录。
6. 实现 Admin 发布 UI。
7. 增加当前仓库 manifest、Actions workflow、构建/发布脚本和 PM2 版本配置。
8. 完成验证、README 和 AGENTS。

## 15. Rollout

平台首次部署必须人工自举：

1. 备份 pr-auth 配置和数据库。
2. 准备 pr-admin OIDC client 和 GitHub App 配置。
3. 构建新版本，执行 auth `0003` 和 admin `0002`。
4. 执行 `auth:set-role <owner> super`；确认至少一个有效 super。
5. 先部署 pr-auth、Gateway、pr-admin API，再部署 pr-admin Web。
6. 验证 user/admin/super 三种准入和发布接口权限。
7. 安装 GitHub App，配置 webhook 和 GitHub Environments。
8. 在目标 Linux 主机以专用用户安装 self-hosted runner并准备版本目录/PM2/Nginx。
9. 同步当前 manifest 的 7 个 unit。
10. 先在 staging 发布一个前端和一个无 migration 后端，再验证带 migration 后端和 Admin 自发布。

正式生产发布不由代码实施过程自动执行。

## 16. Verification

### 16.1 代码和生成

- `pnpm generate:api`
- 只对本次实际修改/新增的手写 JS/MJS/TS/TSX 文件运行：

```sh
pnpm lint -- <精确变更文件列表>
```

- 不 lint 生成文件、SQL、JSON、YAML、Markdown。
- 不运行全项目 lint、format 或 fix。
- `pnpm --filter @my-sp-pr/pr-auth-api typecheck`
- `pnpm --filter @my-sp-pr/pr-admin-api typecheck`
- `pnpm --filter @my-sp-pr/gateway typecheck`
- `pnpm --filter @my-sp-pr/pr-admin-web typecheck`
- `pnpm build`

### 16.2 Auth

扩展 `pnpm verify:auth`：

- 新空库 bootstrap 为 super。
- 已有 admin 不自动提升。
- set-role 后旧会话撤销。
- 最后一个有效 super 不能禁用/降级。
- pr-admin client 允许 super/admin，拒绝 user。
- claims/UserInfo 返回正确角色。

### 16.3 Admin

新增 `pnpm verify:admin`，复用 Node assert、临时 PG18 和本地 GitHub mock，不引入通用测试框架：

- Authorization Code + PKCE、state/nonce 单次消费。
- Cookie、CSRF、session 期限、refresh token 轮换。
- 角色改变或禁用后下一次发布请求立即失败。
- admin 的 deploy API 为 403，super 成功。
- GitHub App token 只在内存短期缓存。
- ref 固定为 SHA，branch 后移不改变记录。
- 并发发布冲突。
- webhook 验签、重放、乱序。
- GitHub 4xx/5xx/超时的脱敏映射。
- Environment secret 只返回名称/配置状态。

### 16.4 Release scripts

在临时目录 dry run 当前 7 个 unit：

- 每个 unit 只构建自身和必要依赖。
- 前端 dist、后端 deploy 包、drizzle/共享依赖完整。
- 制品摘要不匹配时拒绝发布。
- 同环境发布锁有效。
- 版本切换、保留 5 版和清理规则正确。
- migration/build/health/reload 失败路径正确。
- runtime env 权限为 `0600`，日志不含 secret。

### 16.5 Browser

桌面和 320/375px：

- 未登录跳 SSO，登录后回原路由。
- admin/super 导航和 403 正确。
- 项目、环境配置状态、ref、发布确认、运行中、失败、成功、回滚状态。
- 长仓库名/branch/SHA 不溢出。
- 深浅主题、键盘焦点、Drawer/Modal 和减少动画正常。

### 16.6 Real GitHub staging

用户提供测试 GitHub App、Environment 和 runner 后：

- 从 feature branch 发 staging，确认记录固定 SHA。
- branch 后移不影响已有发布。
- 分别发布前端、Gateway 和带 migration 的业务后端。
- 模拟健康失败，确认制品回退。
- 发布 pr-admin 自身，确认任务不中断、恢复后状态对账。

缺少外部凭据时明确标记这一部分未验证。

## 17. Acceptance Criteria

- `super/admin/user` 在契约、数据库、OIDC claims 和 UI 中一致。
- admin/super 可登录 Admin；user 被拒绝；只有 super 能访问发布模块及 API。
- 当前 7 个应用可分别选择环境和受控 ref 发布。
- 每次发布记录 requested ref、resolved SHA、操作者、状态和 GitHub 日志。
- branch 变化不会改变已有发布。
- 每项目/环境独立使用 GitHub Environment；配置缺失会阻止发布；Admin 不读取 secret value。
- 构建 job 不获得生产密钥，目标 runner 不执行源码安装/构建。
- 同项目/环境不能并发覆盖；失败不能显示成功。
- 应用制品可回滚，数据库迁移不伪装为可自动回滚。
- 所有浏览器业务 API 继续经过 Gateway。
- 第二阶段动态导入新 GitHub 仓库时无需重做身份、deployment 和审计模型。
