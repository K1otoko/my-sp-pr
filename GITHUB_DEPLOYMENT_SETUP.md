# GitHub 发布平台配置清单

本文列出启用 Admin 发布模块前，需要在 GitHub 和目标 Linux 服务器完成的操作。

适用实现：

- 发布清单：`deploy.manifest.json`
- GitHub Actions：`.github/workflows/deploy.yml`
- Admin 配置：`backend/pr-admin/.env.example`
- 发布脚本：`scripts/deploy/`

## 1. 先确定这些值

在操作 GitHub 前先确定：

| 配置 | 示例 | 说明 |
| --- | --- | --- |
| GitHub 仓库 | `your-owner/my-sp-pr` | 只安装到这个仓库 |
| Admin 公网 Origin | `https://admin.example.com` | Webhook 和 Admin OIDC 回调入口 |
| SSO 公网 Origin | `https://sso.example.com` | 稳定 OIDC issuer |
| staging runner label | `staging` | workflow 固定支持 |
| production runner label | `production` | workflow 固定支持 |
| 发布根目录 | `/srv/my-sp-pr` | 可通过 `DEPLOY_ROOT` 覆盖 |
| 配置根目录 | `/etc/my-sp-pr` | 可通过 `DEPLOY_CONFIG_ROOT` 覆盖 |

GitHub Environment 名称没有硬编码，但必须与 Admin 中填写的
`githubEnvironmentName` 完全一致。推荐：

```text
<unit>-staging
<unit>-production
```

当前 unit：

```text
pr-chat-web
pr-admin-web
pr-sso-web
gateway
pr-chat-api
pr-auth-api
pr-admin-api
```

不需要一次创建全部 14 个 Environment，只创建实际要发布的组合。

## 2. 创建 GitHub App

入口：

```text
GitHub -> Settings -> Developer settings -> GitHub Apps -> New GitHub App
```

### 2.1 基本信息

- [ ] 填写 GitHub App 名称。
- [ ] Homepage URL 填写 Admin 或项目主页。
- [ ] Callback URL 不需要配置，本项目不使用 GitHub 用户 OAuth。
- [ ] 勾选 Active webhook。
- [ ] Webhook URL：

```text
https://admin.example.com/api/admin/deploy/github/events
```

- [ ] Webhook secret 使用随机值生成：

```sh
openssl rand -hex 32
```

- [ ] SSL verification 保持开启。

### 2.2 Repository permissions

按最小权限配置：

| 权限 | 级别 | 用途 |
| --- | --- | --- |
| Contents | Read-only | 读取仓库、commit、branch、tag 和 manifest |
| Deployments | Read and write | 创建 deployment 和读取/更新状态 |
| Environments | Read-only | 读取 Environment variables 和 secret 名称 |
| Metadata | Read-only | GitHub 自动提供 |

不要授予 Contents write、Administration write、Secrets write 或其他无关权限。

> GitHub 的 Environment 列表接口在部分账户界面中还会显示为依赖
> Actions read。若 GitHub App 调用 Environment API 返回 403，再增加
> `Actions: Read-only`，不要直接提升为 write。

### 2.3 Webhook events

- [ ] 仅订阅 **Deployment statuses**（事件名 `deployment_status`）。
- [ ] 不要订阅 `push`、`pull_request` 或全部事件。

Admin webhook 只接受 `deployment_status`。GitHub App 创建时自动发送的
`ping` 可能显示 400；应以实际 `deployment_status` delivery 是否返回 200
作为最终验证。

### 2.4 安装和记录信息

- [ ] 创建 App 后记录 **App ID**。
- [ ] 点击 **Generate a private key**，下载 PEM 私钥。
- [ ] 点击 **Install App**。
- [ ] Repository access 选择 **Only select repositories**。
- [ ] 只选择当前 `my-sp-pr` 仓库。
- [ ] 从安装页 URL `/settings/installations/<id>` 记录
  **Installation ID**。

目标机保存私钥：

```sh
install -d -m 700 /etc/my-sp-pr/keys
install -m 600 downloaded-app-key.pem /etc/my-sp-pr/keys/github-app.pem
```

不要把 PEM 私钥提交到 Git，也不要放进 `VITE_*`、构建制品或 Admin
数据库。

## 3. 配置 pr-admin 的 GitHub App 参数

首次部署 Admin API 时，需要先通过受保护环境变量或服务器
`backend/pr-admin/.env` 提供：

```dotenv
GITHUB_APP_ID=<App ID>
GITHUB_APP_PRIVATE_KEY_FILE=/etc/my-sp-pr/keys/github-app.pem
GITHUB_INSTALLATION_ID=<Installation ID>
GITHUB_REPOSITORY=your-owner/my-sp-pr
GITHUB_ALLOWED_OWNERS=your-owner
GITHUB_RUNNER_TARGETS=staging,production
GITHUB_WEBHOOK_SECRET=<与 GitHub App webhook 完全一致>
GITHUB_API_ORIGIN=https://api.github.com
```

注意：

- [ ] `GITHUB_REPOSITORY` 使用 `owner/repository`，不带 `.git`。
- [ ] `GITHUB_ALLOWED_OWNERS` 至少包含仓库 owner。
- [ ] 首版 runner target 只能是 `staging`、`production`。
- [ ] 私钥路径必须是 Admin API 进程可读的绝对路径，权限 `0600`。
- [ ] 多个 Admin API 实例使用同一个 GitHub App 配置。

## 4. 开启 GitHub Actions

入口：

```text
Repository -> Settings -> Actions -> General
```

- [ ] 允许 GitHub Actions 运行。
- [ ] 允许以下官方 Action：
  - `actions/checkout`
  - `actions/setup-node`
  - `actions/upload-artifact`
  - `actions/download-artifact`
- [ ] Workflow permissions 允许 workflow 使用显式声明的：
  - `contents: read`
  - `deployments: write`
  - `actions: read`
- [ ] 不需要开启 “Allow GitHub Actions to create and approve pull requests”。
- [ ] 确认默认分支已包含 `.github/workflows/deploy.yml`。
- [ ] 确认默认分支已包含 `deploy.manifest.json` 和 `scripts/deploy/`。

该 workflow 只监听 GitHub `deployment` 事件，没有
`push`、`pull_request` 或 `workflow_dispatch` 入口。正常发布从 Admin
页面发起。

## 5. 创建 self-hosted runner

入口：

```text
Repository -> Settings -> Actions -> Runners -> New self-hosted runner
```

建议 staging 和 production 使用不同的 Linux 主机或至少不同 runner
实例。

### 5.1 staging runner

- [ ] 选择 Linux、x64。
- [ ] 按 GitHub 页面命令下载并配置 runner。
- [ ] 添加自定义 label：`staging`。
- [ ] 保留默认 label：`self-hosted`、`linux`、`x64`。
- [ ] 安装为系统服务并确认 Online。

### 5.2 production runner

- [ ] 使用独立 runner 用户。
- [ ] 添加自定义 label：`production`。
- [ ] 保留默认 label：`self-hosted`、`linux`、`x64`。
- [ ] 安装为系统服务并确认 Online。
- [ ] 不给该 runner 配置 PR/fork workflow。

目标机还需要安装：

```text
Node.js 24
PM2
flock
tar
curl
Nginx
```

runner 用户需要写入：

```text
/srv/my-sp-pr
/etc/my-sp-pr/<unit>/<environment>
```

不要授予通用免密 sudo。Admin 不通过 SSH 连接目标机。

## 6. 创建 GitHub Environments

入口：

```text
Repository -> Settings -> Environments -> New environment
```

每个 unit/environment 创建一个独立 Environment，例如：

```text
pr-admin-web-staging
pr-admin-web-production
pr-admin-api-staging
pr-admin-api-production
```

每个 Environment：

- [ ] 名称与 Admin 环境记录的 `githubEnvironmentName` 完全一致。
- [ ] production 配置 Required reviewers。
- [ ] production 建议关闭管理员绕过保护规则。
- [ ] production 可配置 wait timer。
- [ ] 先在 staging 验证，再配置 production。
- [ ] 不把生产 secret 放在 repository-level variables/secrets。

所有 Environment 都可选配置：

| Variable | 建议值 |
| --- | --- |
| `DEPLOY_ROOT` | `/srv/my-sp-pr` |
| `DEPLOY_CONFIG_ROOT` | `/etc/my-sp-pr` |

未配置时使用以上默认值。

## 7. 按项目配置 Variables 和 Secrets

原则：

- Variables 保存非敏感配置。
- Secrets 保存数据库 URL、client secret、加密 key、webhook secret。
- Admin 只能读取 Variable 值和 Secret 名称，不能读取 Secret value。
- `DATABASE_MIGRATION_URL` 只注入迁移子进程，不写入长期
  `runtime.env`。
- 当前 manifest 将业务 API 的 `DATABASE_MIGRATION_URL` 标为必填，
  因此即使暂不执行迁移也需要先创建该 Secret。

### 7.1 `pr-chat-web`

Variables：

| 名称 | 必填 | 说明 |
| --- | --- | --- |
| `VITE_API_BASE_URL` | 否 | 默认 `/api`；值会进入浏览器制品 |

Secrets：无。

### 7.2 `pr-admin-web`

业务 Variables/Secrets：无。Admin BFF API 固定同源 `/api`。

### 7.3 `pr-sso-web`

业务 Variables/Secrets：无。SSO Cookie API 固定同源 `/api`。

### 7.4 `gateway`

Variables：

```text
HOST
PORT
CHAT_SERVICE_URL
AUTH_SERVICE_URL
ADMIN_SERVICE_URL
CORS_ORIGINS
SSO_PUBLIC_ORIGIN
TRUSTED_PROXY_CIDRS
UPSTREAM_TIMEOUT_MS              # 可选
AUTH_FLOW_TIMEOUT_MS             # 可选
```

同机 Nginx + PM2 可参考：

```dotenv
HOST=127.0.0.1
PORT=3000
CHAT_SERVICE_URL=http://127.0.0.1:3001
AUTH_SERVICE_URL=http://127.0.0.1:3002
ADMIN_SERVICE_URL=http://127.0.0.1:3003
CORS_ORIGINS=https://chat.example.com,https://admin.example.com,https://sso.example.com
SSO_PUBLIC_ORIGIN=https://sso.example.com
TRUSTED_PROXY_CIDRS=loopback
```

Secrets：无。

### 7.5 `pr-chat-api`

Variables：

```text
HOST
PORT
DATABASE_SSL_MODE
DATABASE_SSL_CA_FILE             # 可选
DATABASE_POOL_MAX                # 可选
```

Secrets：

```text
DATABASE_URL
DATABASE_MIGRATION_URL
```

### 7.6 `pr-auth-api`

Variables：

```text
HOST
PORT
SSO_PUBLIC_ORIGIN
AUTH_CONFIG_FILE
AUTH_TRUSTED_GATEWAY_CIDRS
DATABASE_SSL_MODE
DATABASE_SSL_CA_FILE             # 可选
DATABASE_POOL_MAX                # 可选
```

Secrets：

```text
DATABASE_URL
DATABASE_MIGRATION_URL
```

`AUTH_CONFIG_FILE` 是目标机预先准备的 `auth.json` 绝对路径。文件权限
必须为 `0600`。

### 7.7 `pr-admin-api`

Variables：

```text
HOST
PORT
ADMIN_PUBLIC_ORIGIN
SSO_PUBLIC_ORIGIN
ADMIN_OIDC_CLIENT_ID
GITHUB_APP_ID
GITHUB_APP_PRIVATE_KEY_FILE
GITHUB_INSTALLATION_ID
GITHUB_REPOSITORY
GITHUB_ALLOWED_OWNERS
GITHUB_RUNNER_TARGETS
DATABASE_SSL_MODE
DATABASE_SSL_CA_FILE             # 可选
DATABASE_POOL_MAX                # 可选
```

Secrets：

```text
ADMIN_OIDC_CLIENT_SECRET
ADMIN_TOKEN_ENCRYPTION_KEYS
ADMIN_CSRF_HMAC_KEY
GITHUB_WEBHOOK_SECRET
DATABASE_URL
DATABASE_MIGRATION_URL
```

生成 Admin key：

```sh
openssl rand -base64 32 | tr '+/' '-_' | tr -d '='
```

`ADMIN_TOKEN_ENCRYPTION_KEYS` 使用 JSON：

```json
[{"id":"v1","key":"<32 字节 base64url key>"}]
```

## 8. 配置 Admin OIDC 客户端

这一步不在 GitHub 页面中完成，但 Admin 登录前必须配置。

编辑目标机受保护的 auth.json，在 `clients` 中加入：

```json
{
  "clientId": "pr-admin",
  "name": "PR Admin",
  "secret": "<与 ADMIN_OIDC_CLIENT_SECRET 相同>",
  "redirectUris": [
    "https://admin.example.com/api/admin/auth/callback"
  ],
  "postLogoutRedirectUris": [
    "https://admin.example.com/?signed_out=1"
  ],
  "allowedRoles": ["super", "admin"],
  "scopes": ["openid", "profile", "roles"],
  "refreshToken": true
}
```

不要把 auth.json 或 client secret 提交到 Git。

## 9. Git 分支和 Ruleset

推荐：

- [ ] 默认分支使用 `main` 或当前仓库主分支。
- [ ] 为主分支创建 Ruleset，禁止直接 force push。
- [ ] 要求 pull request 和必要检查通过后合并。
- [ ] staging 允许临时 feature branch。
- [ ] production 在 Admin 中只允许主分支和版本 tag，例如 `v*`。
- [ ] 不为每个项目维护永久分支。

Admin 会在发起发布时把 branch/tag 解析为 commit SHA，后续 branch
移动不会改变已有发布记录。

## 10. 首次上线顺序

- [ ] 提交并推送 workflow、manifest 和发布脚本到默认分支。
- [ ] 准备目标机目录、Nginx、PM2 和 self-hosted runner。
- [ ] 创建 GitHub App 并安装到目标仓库。
- [ ] 创建所需 GitHub Environments。
- [ ] 配置各 Environment 的 Variables/Secrets。
- [ ] 在 Auth 中登记 `pr-admin` OIDC client。
- [ ] 执行 Auth `0003` 和 Admin `0002` 数据库迁移。
- [ ] 将至少一个账号提升为 super：

```sh
pnpm --filter @my-sp-pr/pr-auth-api auth:set-role <username> super
```

- [ ] 先人工部署 Auth、Gateway、Admin API 和 Admin Web，完成控制面自举。
- [ ] 登录 Admin，进入“发布项目”，点击“同步清单”。
- [ ] 在 Admin 中创建环境记录：
  - name：`staging` 或 `production`
  - GitHub Environment：对应 GitHub Environment 名称
  - runner target：`staging` 或 `production`
  - health URL：目标公开 health/release URL
  - allowed branches/tags：按环境设置
- [ ] 先发布一个前端到 staging。
- [ ] 再发布一个不执行 migration 的后端到 staging。
- [ ] 最后验证 migration、production 审批和回滚。

## 11. 验收检查

### GitHub App

- [ ] App 只安装到目标仓库。
- [ ] Installation token 可以读取仓库和 Environment 配置。
- [ ] Admin 可以创建 GitHub Deployment。
- [ ] `deployment_status` webhook 返回 200。
- [ ] Webhook Recent deliveries 中签名校验通过。

### Actions

- [ ] build job 在 GitHub-hosted runner 执行。
- [ ] build job 不绑定 production Environment。
- [ ] deploy job 在对应 `staging`/`production` self-hosted runner 执行。
- [ ] production deploy job 在审批前无法读取 Environment Secrets。
- [ ] artifact 名称为 `release-<GitHub deployment id>`，保留 7 天。

### 目标服务器

- [ ] `current` 指向新版本目录。
- [ ] `previous` 指向上一版本。
- [ ] `runtime.env` 权限为 `0600`。
- [ ] `runtime.env` 不包含 `DATABASE_MIGRATION_URL`。
- [ ] PM2 只 reload 当前 unit。
- [ ] 前端 `/release.json` 返回本次 commit SHA。
- [ ] 后端内部 ready 和公开 health 均通过。
- [ ] 健康失败时恢复上一应用版本。

## 12. 常见问题

### Admin 显示 GitHub App 未配置

检查 pr-admin 的：

```text
GITHUB_APP_ID
GITHUB_APP_PRIVATE_KEY_FILE
GITHUB_INSTALLATION_ID
GITHUB_REPOSITORY
GITHUB_ALLOWED_OWNERS
GITHUB_RUNNER_TARGETS
GITHUB_WEBHOOK_SECRET
```

### Admin 显示 Environment 配置缺失

检查：

1. Admin 的 `githubEnvironmentName` 是否与 GitHub 完全一致。
2. Variable 是否误建成 Secret，或反过来。
3. 必填 Secret 是否已创建。
4. GitHub App 是否具有 Environments Read-only。

### Workflow 一直等待 runner

检查：

1. runner 是否 Online。
2. runner 是否同时有 `self-hosted`、`linux`、`x64`。
3. 自定义 label 是否精确为 `staging` 或 `production`。
4. Admin 环境中的 runner target 是否与 label 一致。

### Webhook 返回 403

检查：

1. GitHub App Webhook secret 与 `GITHUB_WEBHOOK_SECRET` 是否完全一致。
2. URL 是否经过 Gateway 到达
   `/api/admin/deploy/github/events`。
3. 仓库 ID、owner/repository 和 GitHub deployment ID 是否匹配。

### production 发布 ref 被拒绝

检查 Admin 环境中的 allowed branches 和 tag pattern。production 的原始
SHA 只有在它仍对应允许分支或标签时才可发布。

## 13. GitHub 官方参考

- GitHub App 权限：
  https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app
- Deployment REST API：
  https://docs.github.com/en/rest/deployments/deployments
- Environment REST API：
  https://docs.github.com/en/rest/deployments/environments
- Actions Secrets：
  https://docs.github.com/en/rest/actions/secrets
- Webhook events：
  https://docs.github.com/en/webhooks/webhook-events-and-payloads
- Self-hosted runners：
  https://docs.github.com/en/actions/hosting-your-own-runners
