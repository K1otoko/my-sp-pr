# 部署平台 0-1 重构计划

状态：实施中；已完成 Admin 前端六模块导航与首批页面结构、M0 兼容代码基线及 M1 数据模型/增量迁移/只读接口。生产网络与 runner 的剩余配置尚待落实。

## 1. Summary

### 1.1 目标

在现有 Admin 发布 MVP 基础上，重构为面向当前三台 Linux x64 主机、同时可扩展到更多仓库和目标机的生产部署平台。

平台需要完成：

- 管理受信 GitHub 仓库、发布单元、production 配置和目标主机。
- 在 GitHub-hosted runner 构建不可变制品。
- 通过目标机本地 self-hosted runner 安装制品，不从 Admin 直接 SSH。
- 支持单应用发布和同一 commit SHA 的整组发布。
- 支持目标主机精确路由、发布前检查、状态恢复、取消、重试和代码回滚。
- 通过只读轻量 Agent 展示主机、PM2、版本、磁盘和健康状态。
- 长期保存发布、事件和审计记录，不依赖 GitHub 的短期历史。
- 保留当前 SSO/BFF/CSRF、Gateway、契约生成、数据库权限和迁移边界。

### 1.2 已确认决策

| 事项 | 决策 |
| --- | --- |
| 环境 | 首期只启用 `production`，数据模型保留未来增加环境的能力 |
| 前端服务器 | 部署 `pr-chat-web`、`pr-admin-web`、`pr-sso-web`，运行 Nginx 和目标 runner |
| 后端服务器 | 部署 Gateway、Chat/Auth/Admin API、PostgreSQL 18、PM2 和目标 runner |
| 物理机 | 注册为第二个 backend 目标，首期不迁移现有服务，未来承载新增后端服务 |
| 系统与网络 | Ubuntu 24；前后端通过公网连接，后端公网 IP 为 `82.157.201.240`；物理机使用 frp，frps 位于前端服务器 |
| 正式域名 | Chat `https://xpeach.top`、Admin `https://admin.xpeach.top`、SSO `https://sso.xpeach.top` |
| 构建 | GitHub-hosted `ubuntu-24.04` runner |
| 运行 | 首期保留 Nginx + PM2；内部定义部署执行器接口，但不实现 Docker |
| 配置 | GitHub Environment variables/secrets 为事实源；Admin 不保存 secret value |
| 权限 | 仅 `super` 可见和操作部署平台；生产使用单人强确认 |
| 发布粒度 | 同时支持单 unit 发布与整组发布 |
| 可用性 | 接受维护窗口内短暂中断；不承诺主机级高可用 |
| 数据库 | PostgreSQL 18 部署在后端服务器 |
| 数据库备份 | 首期明确不实现；平台持续显示无备份风险 |
| 数据库迁移 | Admin 不自动执行；检测到迁移变化时进入人工迁移门禁 |
| 主机准备 | 人工安装和配置；平台只提供要求、检查和状态，不远程装机 |
| 主机观测 | 每台目标机运行只读轻量 Agent，定时向 Admin 上报 |
| 通知 | 首期不接飞书、邮件或通用 Webhook |
| 前端模块 | 固定为概览、仓库、应用、目标主机、发布中心、审计六个核心模块；不增加空壳一级模块 |
| 制品保留 | GitHub Actions artifact 30 天；每个 unit/环境在目标机保留 10 个成功版本 |
| 历史数据 | 通过新增迁移保留现有项目、环境、deployment、event 和 audit 数据 |
| 仓库 | 先完整支持 `K1otoko/my-sp-pr`，模型和接口支持后续导入受信仓库 |
| 未来服务 | 技术栈未确定；首期只实现 Vite 静态站和 Node/PM2 服务 preset |

### 1.3 目标拓扑

```text
浏览器
  |
  v
前端服务器
  Nginx :443
    |- chat/admin/sso 静态目录
    |- /api、OIDC discovery -> 后端服务器 TLS 入口 -> loopback Gateway
    |- deploy Agent（只读上报）
    `- GitHub self-hosted runner [production, frontend, front-01]
                                  |
                                  | 公网 HTTPS + 前端来源 IP 白名单
                                  v
后端服务器
  |- TLS 入口（82.157.201.240；证书域名/端口待配置）
  |- Gateway :3000（loopback，仅同机 TLS 入口）
  |- pr-chat-api :3001（loopback）
  |- pr-auth-api :3002（loopback）
  |- pr-admin-api :3003（loopback）
  |- PostgreSQL 18（loopback；未来跨机服务按角色/IP单独放行）
  |- deploy Agent（只读上报）
  `- GitHub self-hosted runner [production, backend, back-01]

物理机
  |- frpc -> 前端服务器 frps（映射、TLS、认证配置待核实）
  |- 首期无现有应用绑定
  |- deploy Agent（只读上报）
  `- GitHub self-hosted runner [production, backend, physical-01]

GitHub-hosted runner
  `- install/typecheck/build/package -> Actions artifact
```

### 1.4 完成标准

实施完成后，`super` 应能：

1. 查看仓库、7 个现有 unit、3 台目标机及其当前状态。
2. 将 3 个前端精确绑定到前端服务器，将 4 个后端精确绑定到后端服务器。
3. 对单个 unit 预览发布影响，确认后发布固定 SHA。
4. 对当前仓库创建整组发布，按依赖波次执行并看到部分成功/失败。
5. 在目标离线、配置缺失、磁盘不足、ref 不允许或迁移门禁未完成时被阻止。
6. 查看构建、部署、验证阶段，取消安全阶段的任务，重试失败项。
7. 使用原始制品或目标机保留版本执行代码回滚，不重新构建旧 SHA。
8. 查看当前部署版本、版本漂移、PM2 状态、磁盘状态和完整审计记录。

## 2. Current State Analysis

### 2.1 已有可复用能力

- `deploy.manifest.json` 已声明 3 个前端、Gateway 和 3 个业务后端，共 7 个 unit。
- `.github/workflows/deploy.yml` 已分离 GitHub-hosted build job 与目标机 deploy job。
- 构建使用固定 Node 24、frozen lockfile、目标包 typecheck/build 和独立生产包。
- `scripts/deploy/build.mjs` 已生成 `release.json` 与逐文件 SHA256。
- `scripts/deploy/install.mjs` 已处理路径穿越、符号链接越界、摘要校验、版本目录、软链切换、PM2 reload、健康检查、失败恢复和清理。
- Admin 已具备：
  - SSO BFF session、CSRF 和在线 UserInfo 校验。
  - `super` 发布权限。
  - manifest 同步、环境管理、ref 解析、固定 SHA、发布记录和回滚入口。
  - GitHub App installation token、Environment 配置检查和 webhook 验签/去重。
  - deployment 并发约束、event 和 audit 表。
- 服务已有 liveness/readiness、显式数据库迁移和迁移 advisory lock。

### 2.2 当前不能满足三机拓扑的问题

1. `runnerTarget` 同时承担环境和主机选择，目前只允许 `staging|production`。
2. workflow 只按一个自定义标签选 runner；前后端两台 production runner 会发生错误路由。
3. 安装脚本只操作 runner 本机，因此物理机不能作为中央 runner 再远程安装另外两台机器。
4. 数据模型没有目标主机、主机角色、Agent、目标绑定和当前部署状态。
5. PM2 进程名只有 unit ID，没有环境后缀，未来同机多环境会冲突。

### 2.3 当前发布闭环的问题

1. 只有单 unit deployment，没有同 SHA 的 release batch 和依赖顺序。
2. “回滚”会为旧 SHA 重新执行 build，不是复用原始制品。
3. artifact 只保留 7 天，目标机只保留 5 个成功版本。
4. 状态只依赖 GitHub webhook，没有主动对账；Admin 宕机或 webhook 丢失后可能长期卡住。
5. 没有工作流取消、失败项重试、卡住超时和恢复策略。
6. GitHub Environment 不存在时，当前代码把 variables/secrets 当作空集合；没有变量的前端可能被误判为“配置完整”。
7. workflow 使用当前 workflow commit 的控制脚本，没有严格验证它与 Admin 已同步的 manifest SHA 一致。
8. release 详情只保存 GitHub 粗粒度状态，没有稳定的 build/deploy/verify 阶段和 artifact 元数据。

### 2.4 当前产品与运维缺口

- 没有仓库目录、目标机页面、Agent token 生命周期、主机状态和应用版本漂移。
- audit 数据存在，但没有查询 API 和页面。
- 没有发布预览、整组发布、依赖图、迁移差异识别和人工门禁。
- 没有磁盘空间、PM2 进程、Nginx、Runner 服务、Node 版本或证书状态展示。
- 没有生产发布冻结、配置变更摘要或目标预检报告。
- 没有真正的运行日志聚合；首期仍只保留 GitHub 发布日志链接和 PM2 状态摘要。

### 2.5 已发现的配置事实

- Git 远端为 `K1otoko/my-sp-pr`。
- 远端默认分支是 `master`，而当前 7 个 manifest unit 的 `defaultRef` 都是 `main`。
- 新实现必须以 GitHub repository API 返回的默认分支为准；manifest 可显式覆盖，但同步时必须验证 ref 存在。
- 当前 README 使用 Neon 作为测试数据库说明；生产目标改为后端服务器本机 PostgreSQL 18，需要补充独立生产章节，不能把测试 Neon 描述成生产事实。

### 2.6 工作区现有修改

开始实施时必须保留当前未提交修改：

- `.dbg/trae-debug-log-admin-login-no-redirect.ndjson`
- `.trae/documents/20260924-admin-platform-layout-plan.md`
- `frontend/pr-admin/src/components/AppLayout.tsx`

部署平台导航改动只能在用户当前 `AppLayout.tsx` 基础上追加，不能恢复旧 Drawer 或覆盖固定 216px Sider 的现有修改。

## 3. Scope

### 3.1 首期范围

- 当前仓库和 7 个现有 unit。
- 多仓库可扩展数据模型、GitHub client 和 import 校验。
- production 环境。
- 3 台 Linux x64 目标机。
- Vite 静态站、Node 24 + PM2 两种部署 preset。
- GitHub-hosted 构建、Actions artifact、目标机本地安装。
- 单应用发布、整组发布、取消、重试、代码回滚。
- Agent 状态、版本、磁盘、PM2/Nginx/Runner 服务摘要。
- GitHub Environment 配置完整性。
- 人工迁移门禁。
- 审计查询。

### 3.2 明确不做

- 不实现 staging、preview 或临时分支环境。
- 不实现 Docker、Docker Compose、Kubernetes、蓝绿、金丝雀或自动扩缩容。
- 不实现主机级高可用、自动故障转移或跨机负载均衡。
- 不由 Admin SSH、执行任意 shell、安装系统软件、修改防火墙或创建系统账号。
- 不在 Admin 保存或回显 GitHub Environment secret value。
- 不自动运行 production 数据库迁移。
- 不实现 PostgreSQL 备份、PITR、热备或恢复。
- 不实现飞书、邮件或通用 Webhook 通知。
- 不集中采集应用日志正文，不在 Agent 中提供远程日志读取或命令执行。
- 不允许用户从页面填写自定义 build/deploy 命令。
- 不实现数据库 down migration 或将代码回滚描述为数据库回滚。
- 不让 `admin` 或 `user` 看到部署模块。

### 3.3 已接受风险

生产 PostgreSQL 与四个后端运行在同一服务器，且首期无备份：

- 后端服务器故障会同时影响应用、身份、管理控制面和数据库。
- 数据误删、磁盘损坏或错误 migration 没有可靠恢复点。
- 代码回滚不能恢复数据库。
- Admin 自身依赖该数据库，数据库故障时只能从 GitHub 和目标机进行人工恢复。

界面和文档必须持续显示该风险；不得展示“可恢复”“已备份”或类似状态。后续备份功能应作为独立里程碑，不在本计划中伪实现。

## 4. Target Architecture

### 4.1 职责边界

**Admin 控制面**

- 管理仓库目录、unit、production 绑定、目标主机和发布策略。
- 解析 ref、固定 source SHA、固定 control/manifest SHA。
- 生成发布预览、迁移门禁、发布批次和审计。
- 创建 GitHub Deployment，编排依赖波次。
- 接收 GitHub webhook、运行对账器并恢复中断状态。
- 不 clone/build，不持有生产应用 secret，不登录目标机。

**GitHub Actions**

- GitHub-hosted runner 读取固定 source SHA 并构建制品。
- build job 不绑定 production Environment，不获得 runtime/migration secret。
- deploy job 绑定 unit 对应的 GitHub Environment，并路由到唯一目标 runner。
- target runner 不 checkout 应用源码、不执行 `pnpm install` 或 build。
- migration 只通过独立、人工触发的 migration workflow 运行。

**目标 runner**

- 下载制品、验证签名上下文和 SHA256 清单。
- 运行受控 preflight。
- 写入 `0600` runtime 配置。
- 安装到新 release 目录、切换软链、PM2 reload 或静态目录切换。
- 执行内部 readiness 和外部 health。
- 失败时恢复上一应用版本。

**只读 Agent**

- 只采集和上报允许字段。
- 不监听公网端口，不接收远程命令，不执行发布。
- 通过出站 HTTPS 调用 Gateway 的专用 heartbeat API。

### 4.2 请求与网络

- 前端服务器是浏览器唯一公开入口。
- Chat/Admin/SSO 三个站点分别配置 HTTPS 域名和静态 root。
- 三个站点的 `/api` 反代到后端公网 TLS 入口，该入口再转发到同机 Gateway；公网段必须验证后端证书和主机名。
- SSO 站点额外精确反代两个根 discovery 路径。
- 后端 TLS 入口防火墙仅允许前端出口 IP 和明确管理来源；Gateway 绑定 loopback，`TRUSTED_PROXY_CIDRS` 仅信任同机入口，入口覆盖外来转发头。
- 三个业务后端继续绑定 `127.0.0.1`，只接受同机 Gateway。
- PostgreSQL 默认绑定 loopback；frp 不等同于可信 VPN，未来物理机访问数据库须单独设计加密链路、角色和来源控制，不直接开放公网 PostgreSQL。
- Agent 通过公开 Admin/Gateway HTTPS endpoint 主动上报，目标机无需开放 Agent 入站端口。

生产输入已确认 GitHub App ID `5055018`、installation ID `164247514`，私钥由部署主机提供。本地尚未读取该主机的私钥，也未验证 GitHub App、DNS、证书或服务器连通性。敏感输入仅存于被 Git 忽略的部署配置，不写入此计划或业务代码。

上线前仍需确定前端公网出口 IP、后端 TLS 入口域名/端口与证书、frp 映射/加密/认证方式、三台机器的实际架构、runner service 名及目录 owner。保留已正常工作的本地 localhost OIDC 配置，不提前替换为生产域名。

### 4.3 目标标识和 Runner 标签

首期固定三个 target key：

| target key | role | 唯一 runner label | 首期绑定 |
| --- | --- | --- | --- |
| `front-01` | `frontend` | `deploy-front-01` | 3 个 Web unit |
| `back-01` | `backend` | `deploy-back-01` | Gateway + 3 个 API |
| `physical-01` | `backend` | `deploy-physical-01` | 无 |

workflow 使用累计标签：

```yaml
runs-on: [self-hosted, linux, x64, "<validated-target-label>"]
```

- `production` 是环境，不再作为唯一目标标签。
- target label 只能来自数据库中已启用、Agent 在线且角色匹配的 target。
- deployment payload 必须由 Admin 签名，workflow 验签后才能把 target label 写入 job output。
- 同一唯一 label 只能注册一个实际 runner；Agent 上报 runner service 名称和配置 label 供预检。

### 4.4 运行目录

继续使用每台目标机本地目录：

```text
/srv/my-sp-pr/<unit>/<environment>/
  releases/<sha>-<deployment-id>/
  current -> releases/<...>/
  previous -> releases/<...>/

/etc/my-sp-pr/<unit>/<environment>/
  runtime.env
```

规则：

- environment 首期固定 `production`。
- 前端 Nginx root 指向对应 `current`。
- 后端 PM2 名称改为 `<unit>-<environment>`，首期如 `gateway-production`。
- release 目录包含来源 SHA、control SHA、deployment ID、artifact digest、安装时间和 config fingerprint。
- 每个 unit/environment 保留最近 10 个成功版本；`current`、`previous` 和被 release 记录引用的回滚目标不清理。
- 未成功的临时目录在失败流程或下次预检中清理。

### 4.5 部署执行器

在服务层定义受控 executor/preset 注册表：

- `pnpm-vite-static-v1`
- `pnpm-node-service-v1`

每个 preset 固定：

- 允许的 unit kind。
- 构建步骤。
- 制品结构。
- 目标 role。
- 安装、激活、健康检查和回滚策略。
- 允许的 variable scope。

不把 shell 命令保存在数据库或 manifest。未来新增 Docker/systemd/其他语言时必须通过代码新增并审核 preset。

## 5. Manifest V2

将 `deploy.manifest.json` 升级到 version 2，并让解析器在迁移期兼容 version 1。

每个 unit 增加或调整：

- `targetRole`: `frontend | backend`。
- `dependencies`: 同仓库 unit ID 数组。
- `migrationPaths`: 用于识别目标 SHA 相对当前生产 SHA 的 migration 变化。
- `defaultRef` 改为可选；缺省使用 GitHub 仓库默认分支。
- `health`：
  - `publicPath`
  - 可选 `internalReadyPath`
  - 固定超时/重试策略由 preset 管理，不由用户填写脚本。
- 保留 package、artifact、preset、variables 和 migration capability。

当前依赖：

- `pr-chat-api`、`pr-auth-api`、`pr-admin-api`：第一波，可并行。
- `gateway`：依赖三个 API，第二波。
- `pr-chat-web`：依赖 `gateway` 和 `pr-chat-api`。
- `pr-admin-web`：依赖 `gateway` 和 `pr-admin-api`。
- `pr-sso-web`：依赖 `gateway` 和 `pr-auth-api`。
- 三个前端为第三波，可并行。

校验器必须拒绝：

- 重复 ID、未知 preset、kind/targetRole 不匹配。
- 绝对路径、`.`、`..`、反斜杠和越界路径。
- 未声明依赖、依赖环和跨仓库依赖。
- 敏感 build variable。
- 任意 command/script 字段。
- migration unit 缺失 `migrationPaths`。
- 显式 default ref 不存在。

## 6. Data Model

不修改已执行的 `0002_admin_auth_deploy_mvp.sql`。新增后续 Drizzle migration，采用先增量、后切换的方式保留现有数据。

### 6.1 `deploy_repositories`

- `id` UUID。
- GitHub repository ID、full name、owner、installation ID。
- default branch、HTML URL。
- manifest path、manifest version、最后同步 control SHA。
- enabled、created/updated/synchronized time。
- repository ID 和 lower(full name) 唯一。

当前仓库生成首条记录；后续 import 只能选择 GitHub App installation 可见且 owner 在白名单中的仓库。

### 6.2 扩展 `deploy_projects`

该表继续表示可部署 unit，避免无价值的大范围命名迁移：

- 新增 `repository_record_id` 外键。
- 新增 `target_role`。
- manifest snapshot 增加 dependencies、migrationPaths 和 health 对象。
- default ref 允许为空，读取时回退 repository default branch。
- 保留现有 slug、kind、preset、package/artifact path 和 enabled。
- 唯一约束迁移为 `(repository_record_id, unit_id)`。

### 6.3 `deploy_targets`

- `id` UUID、`key`、显示名称。
- role：`frontend | backend`。
- environment：首期 `production`。
- runner label、预期 OS=`linux`、arch=`x64`。
- deploy/config root。
- enabled。
- agent status：`pending | online | degraded | offline | disabled`。
- last seen、last snapshot time、last error code。
- created/updated time。
- key 和 runner label 唯一。

不得保存 SSH 地址、SSH 私钥或通用 sudo 凭据。

### 6.4 `deploy_target_credentials`

- target ID。
- token ID、token hash、created/last used/revoked time。
- token 明文只在创建或轮换后返回一次。
- 同 target 同时只允许一个有效 token。

### 6.5 `deploy_target_snapshots`

首期只保留最近状态和有限事件，不建设时序数据库：

- target ID、agent version、hostname 摘要。
- OS/arch、Node/PM2/Nginx/Runner service 状态。
- 磁盘总量/可用量、内存总量/可用量、load average。
- 已安装 release 列表和 current/previous 指向。
- PM2 应用名、状态、PID、restart count、memory。
- sampled at、received at。

每个 target 保留最新一条完整 snapshot；online/degraded/offline 状态变化写 audit/event，不长期保存每分钟指标。

### 6.6 扩展 `deploy_environments`

现有表继续表示“unit 在某环境的部署绑定”：

- 新增 `target_id` 外键。
- 保留 GitHub Environment、public origin、health URL、ref 策略和 production 标识。
- `runner_target` 进入兼容期，只读展示，实际路由改用 target.runnerLabel。
- 唯一约束保持 project + environment name。
- target role 必须与 project.targetRole 匹配。
- production 环境必须有允许 branch 或 tag，且 GitHub Environment 必须真实存在。

### 6.7 `deploy_release_batches`

- `id` UUID。
- repository ID、environment name。
- mode：`single | full | rollback`。
- requested ref、resolved source SHA、control SHA。
- actor subject/username。
- status：
  - `blocked`
  - `queued`
  - `running`
  - `succeeded`
  - `partial`
  - `failed`
  - `cancelling`
  - `cancelled`
- typed confirmation 的校验结果，不保存用户输入明文。
- migration risk acknowledged、created/started/finished time。
- failure stage/code。

同 repository/environment 只允许一个原生活动 batch。兼容记录带 `legacy=true`，保留 MVP 原有的不同 unit 并行语义，不进入该唯一索引；M4 切换写入口前必须停止 legacy 写入并等待旧活动任务结束。

### 6.8 `deploy_release_items`

- batch ID、project/unit ID、environment binding ID、target ID。
- dependency wave 和依赖快照。
- desired SHA。
- status：
  - `waiting`
  - `queued`
  - `building`
  - `deploying`
  - `verifying`
  - `succeeded`
  - `failed`
  - `skipped`
  - `cancelled`
  - `inactive`
- migration required/gate status。
- current deployment attempt ID。
- created/started/finished time。

同一 batch/unit/target 唯一。

### 6.9 扩展 `deployments`

deployment 变为 release item 的不可变“执行尝试”：

- release item ID、target ID。
- attempt number。
- action：`deploy | retry | rollback`。
- source deployment ID（rollback 时）。
- GitHub deployment ID、workflow run ID、log URL。
- phase：`requested | build | artifact | target_preflight | install | activate | verify | complete`。
- artifact name、artifact digest、artifact expiry。
- applied config fingerprint，不保存 secret value。
- 原有 ref/SHA、actor、migration 标志、failure 和时间字段继续保留。

重试创建新 deployment attempt，不覆盖失败记录。

### 6.10 `deploy_migration_gates`

- release item ID、unit ID。
- base SHA、target SHA。
- changed migration paths。
- status：`required | verified | waived`。
- GitHub migration workflow run ID/URL。
- verified actor/time 和备注摘要。

首期不提供普通 waiver。只有成功验证人工 migration workflow 后才能从 `required` 变为 `verified`；无法验证时保持阻塞。

### 6.11 现有表复用

- `deployment_events` 增加 phase、target ID、workflow run ID 和结构化 code。
- `admin_audit_logs` 增加可选 metadata JSON，但必须过滤 secret、token、数据库 URL、请求体和完整日志。

### 6.12 数据迁移

迁移分两步：

1. 增量 migration：
   - 创建新表和 nullable 外键。
   - 按现有 distinct repository 字段生成 repository 记录。
   - 将现有 project 关联到 repository。
   - 按旧 `runnerTarget` 生成 `legacy-*` pending target，并关联现有 environment。
   - 每条历史 deployment 创建一个 synthetic single batch 和 release item。
   - 回填 attempt、phase 和关联字段。
2. 应用切换并验证：
   - 新代码同时读取已回填数据。
   - 比对 project/environment/deployment/event/audit 行数。
   - 完成真实目标绑定后，不再写 `runner_target`。
   - 本阶段不删除兼容列；清理列作为后续独立 migration。

M1 兼容细节：

- `0003_deployment_platform_models` 由 Kit 生成；`0004_deployment_platform_backfill` 使用 Kit custom 容器完成回填和 DML 授权；不修改 `0000`–`0002`。
- 旧 repository 的 installation/default branch 不可推断，保留 null；后续真实同步会补全。v1 的 project default ref 和旧唯一索引暂时保留，nullable/default branch 回退随 M2 manifest 升级切换。
- legacy target 按 role/environment/旧 runnerTarget 分组，停用且 pending；不能将其视为真实主机或将旧环境标签用于新目标路由。
- 历史 migration 请求标为 `legacy_unknown`，不伪造人工迁移证据；没有历史 workflow phase 的活动记录保持 `requested`，终态为 `complete`。
- 历史 deployment、event、audit 原字段完整保留。旧 rollback 引用不存在时，新外键置 null，原 rollback 字段仍保留。
- 兼容写入口在事务内同步 repository/target/batch/item，webhook、queued/error 更新同步 legacy 状态。
- M1 只开放 repositories/targets/releases 的列表和详情以及 audit 分页查询，共 7 个 super 只读 API。import、target CRUD、Agent、preview 和批次写接口由后续里程碑实现。

## 7. Contracts And APIs

所有浏览器 API 继续位于 `backend/contracts/src/admin.contract.ts`，经生成器进入 Gateway 和 Admin SDK。浏览器写操作继续要求 Admin session、在线 UserInfo、`super` 和 CSRF。

### 7.1 仓库与目录

- `GET /api/admin/deploy/repositories`
- `GET /api/admin/deploy/repositories/available`
- `POST /api/admin/deploy/repositories/import`
- `GET /api/admin/deploy/repositories/{repositoryId}`
- `POST /api/admin/deploy/repositories/{repositoryId}/sync`
- `GET /api/admin/deploy/projects`
- `GET /api/admin/deploy/projects/{projectId}`

import/sync 返回默认分支、control SHA、manifest 版本、unit 数和校验结果。

### 7.2 目标主机

- `GET /api/admin/deploy/targets`
- `POST /api/admin/deploy/targets`
- `GET /api/admin/deploy/targets/{targetId}`
- `PATCH /api/admin/deploy/targets/{targetId}`
- `POST /api/admin/deploy/targets/{targetId}/agent-token`
- `POST /api/admin/deploy/targets/{targetId}/agent-token/rotate`
- `GET /api/admin/deploy/targets/{targetId}/releases`

创建/轮换 token 的响应只返回一次明文；普通详情永不返回 token。

### 7.3 Agent

- `POST /api/admin/deploy/agents/heartbeat`

该接口不使用浏览器 session：

- `Authorization: Bearer <agent-token>`。
- token 经哈希查找并恒定时间校验。
- body 使用严格 Schema 和较小 body limit。
- target ID/token ID、agent version、时间偏差和 nonce 校验。
- 只接受允许字段，不接受命令、日志正文或任意路径。
- 失败响应不泄露 target 是否存在。

### 7.4 环境绑定

保留并调整现有 project environment API：

- 创建/修改必须使用 `targetId`，不再接受任意 runner label。
- 返回 target 摘要、Agent 状态、配置完整性、当前部署版本和漂移。
- Environment 配置检查必须区分：
  - environment 不存在。
  - variables 缺失。
  - secrets 缺失。
  - target 未绑定/离线/角色错误。
  - public health 配置无效。

### 7.5 发布

- `POST /api/admin/deploy/releases/preview`
  - 输入 repository、environment、mode、unit IDs、ref。
  - 返回固定 SHA、commit、选中 unit、依赖波次、目标、配置缺口、migration gate 和阻塞原因。
- `POST /api/admin/deploy/releases`
  - 使用 preview token/版本创建 batch。
  - production 必须输入 repository slug 强确认。
- `GET /api/admin/deploy/releases`
- `GET /api/admin/deploy/releases/{releaseId}`
- `POST /api/admin/deploy/releases/{releaseId}/cancel`
- `POST /api/admin/deploy/release-items/{itemId}/retry`
- `POST /api/admin/deploy/release-items/{itemId}/migration-evidence`
- `POST /api/admin/deploy/deployments/{deploymentId}/rollback`

preview token 包含 source/control SHA 和配置版本摘要；创建时任何事实变化都返回冲突，要求重新预览。

### 7.6 审计

- `GET /api/admin/deploy/audit`
- 支持 actor、action、resource、outcome、时间范围和游标分页。
- 响应只包含结构化摘要，不返回 secret、token、环境文件或完整 webhook payload。

### 7.7 主要错误码

- `TARGET_OFFLINE`
- `TARGET_ROLE_MISMATCH`
- `TARGET_CONFIGURATION_INVALID`
- `ENVIRONMENT_NOT_FOUND`
- `CONFIGURATION_INCOMPLETE`
- `REF_NOT_ALLOWED`
- `MANIFEST_CHANGED`
- `MIGRATION_REQUIRED`
- `RELEASE_CONFLICT`
- `WORKFLOW_STALE`
- `ARTIFACT_EXPIRED`
- `ROLLBACK_UNAVAILABLE`
- `CANCELLATION_UNSAFE`
- `GITHUB_UNAVAILABLE`

## 8. Backend Implementation

### 8.1 服务拆分

将当前过大的 `deployment.service.ts` 拆成：

- `repository-catalog.service.ts`
  - GitHub repository import、default branch、manifest sync。
- `target.service.ts`
  - target CRUD、token、Agent snapshot 和状态判定。
- `release-preview.service.ts`
  - ref/SHA、依赖 DAG、配置、target、migration diff 和 preview token。
- `release.service.ts`
  - batch/item/attempt 创建、取消、重试、回滚和审计。
- `release-orchestrator.ts`
  - 启动 ready wave、处理成功/失败、恢复重启后的 batch。
- `deployment-reconciler.ts`
  - 对账 GitHub deployment/workflow 状态并识别 stale。
- `deployment-authorization.ts`
  - 生成和校验 workflow payload 签名。

controllers 只负责契约输入、principal、CSRF 和输出验证；业务状态机不得放在页面或 controller。

### 8.2 持久编排

- pr-admin 启动后运行单个后台 orchestrator，退出时停止接受新循环并等待当前数据库事务结束。
- 多实例通过 PostgreSQL advisory lock 保证同一时刻只有一个调度器推进 batch。
- 每 15 秒扫描可推进 item。
- 同 repository/environment 只有一个活动 batch。
- 同 unit/environment/target 只有一个活动 attempt。
- 当前 wave 全部成功后才创建下一 wave 的 GitHub Deployment。
- 任一 item 失败：
  - 尚未开始的后续 wave 标记 skipped。
  - 已成功 item 保持 succeeded。
  - batch 标记 failed 或 partial，不伪装原子回滚。
- pr-admin-api 自发布重启后，根据数据库状态继续推进。

### 8.3 状态对账

- webhook 仍是主要状态入口。
- 非终态 attempt 60 秒没有新 event 后进入主动对账队列。
- 每 30 秒通过 GitHub API读取 deployment status 和 workflow run。
- 从可信 `log_url` 或 workflow API 保存 run ID。
- webhook 重放继续依赖 delivery ID 去重。
- 旧事件不得覆盖终态；允许 succeeded 后接收 GitHub inactive。
- 无法查询的任务不立即标成功或失败，先标 stale；超过 60 分钟且 GitHub 无活动 run 后标 `WORKFLOW_STALE`。

### 8.4 取消

- waiting/queued/building 阶段允许取消。
- 有 workflow run ID 时调用 GitHub Actions cancel API。
- deploy/install/activate/verify 阶段不提供强制取消，返回 `CANCELLATION_UNSAFE`，避免中断软链切换。
- batch 取消只取消未进入目标安装的 item；已经成功或正在安装的 item保留真实状态。

### 8.5 重试

- 只允许 failed/cancelled/stale item 重试。
- 重试沿用同一 source SHA、control SHA、target 和 preview 配置约束。
- 配置、manifest 或 target 已变化时拒绝直接重试，要求新建 release。
- 每次重试创建新 deployment attempt，attempt number 递增。

### 8.6 回滚

- 只允许回滚到同 unit/environment/target 的成功 attempt。
- 优先检查 Agent 上报的本地 release inventory。
- 本地版本存在时在目标 runner 上直接切换并健康检查。
- 本地版本不存在时，尝试从原 workflow run 下载 30 天保留期内的原始 artifact。
- artifact 过期且本地版本不存在时返回 `ROLLBACK_UNAVAILABLE`，绝不重建旧 SHA 后冒充原制品。
- 回滚使用当前 GitHub Environment runtime 配置。
- 若当前 config fingerprint 与原版本不同，必须显示差异警告并再次确认。
- 数据库不会回滚。

### 8.7 Migration 门禁

- 使用 GitHub compare API比较该 unit 当前成功 SHA 与目标 SHA。
- 变更命中 manifest `migrationPaths` 时创建 required gate。
- 无历史成功版本、compare 结果截断、base 不可达或 GitHub 无法确定时，保守视为 required。
- required gate 阻止对应 item 和其依赖项启动。
- Admin 不提供“执行迁移”按钮。
- 仓库增加独立 `.github/workflows/migrate.yml`：
  - 只能人工 `workflow_dispatch`。
  - 输入 unit、target、SHA 和 gate ID。
  - GitHub-hosted runner 构建迁移包。
  - backend target runner 下载包，只运行固定 `dist/db/migrate.js`。
  - 使用 GitHub Environment migration secret，不写入 runtime.env。
  - 成功后上传唯一命名的 `migration-evidence-<gate-id>` artifact；其中只包含 repository、workflow path、gate ID、unit、target、source/control SHA、run ID、完成时间和结果，不包含连接串。
- 操作者在 Admin 提交 migration workflow run URL。
- Admin 通过 Actions API验证：
  - repository、workflow path、control SHA 和 run ID。
  - evidence artifact 的 gate ID、target SHA、unit、target。
  - conclusion 为 success。
- workflow run 或 evidence artifact 任一字段不匹配、artifact 已过期或无法下载时均不解除 gate。
- 验证通过后记录 actor/time 并解除 gate。
- 因首期无备份，迁移页固定显示不可恢复风险。

## 9. GitHub Integration

### 9.1 GitHub App

保留 installation token，不引入 PAT。目标权限：

- Metadata: read。
- Contents: read。
- Deployments: read/write。
- Environments: read。
- Actions: read/write（查询 artifact/run、取消安全阶段任务）。

不申请 environment secret value 读取权限或 repository contents 写权限。

### 9.2 多仓库准备

- 配置保留 App ID、private key、owner 白名单和 webhook secret。
- repository full name、repository ID、installation ID 从单一环境变量迁移到数据库。
- 现有 `GITHUB_REPOSITORY`、`GITHUB_INSTALLATION_ID` 仅用于首次导入兼容；完成迁移后标记 deprecated。
- import 时验证：
  - App installation 可见。
  - owner 白名单。
  - 默认分支存在合法 manifest。
  - 标准 deployment workflow 存在。
  - 只使用平台支持 preset。

### 9.3 Deployment 授权

不能只相信 GitHub deployment payload，因为拥有仓库写权限的人也可能创建 deployment。

- Admin 使用独立部署授权私钥签名 canonical payload。
- payload 包含 repository ID、unit ID、source SHA、control SHA、manifest version、environment、target key/label、deployment ID、issued/expiry time 和随机 nonce。
- workflow 只持版本控制中的公钥 key ring。
- build job 在输出 runner label 前完成签名、期限、repository、SHA、manifest 和 target role 校验。
- 私钥不进入前端、workflow 或数据库明文；以受保护文件路径配置。
- key ring 支持先加新公钥、再切换签名 key、最后移除旧 key。

### 9.4 GitHub Environment

- 每个 repository + unit + production 使用独立 Environment，例如 `my-sp-pr-pr-auth-api-production`。
- 发布前先 GET environment 本体，404 必须判定不存在；不能只检查变量和 secret 列表。
- 检查 manifest 声明的普通变量值和 secret 名称。
- build job 不绑定 Environment。
- deploy/migration job 才绑定 Environment。
- branch/tag 策略同时在 Admin 和 GitHub Environment 配置；Admin 负责先解析为不可变 SHA。
- 当前单人确认不依赖 required reviewers，避免受私有仓库套餐能力影响。

## 10. Workflow And Release Scripts

### 10.1 `.github/workflows/deploy.yml`

重构为以下步骤：

1. `authorize`
   - 验签 signed payload。
   - 校验 repository、unit、source/control SHA、environment、target 和过期时间。
   - checkout control SHA 的 manifest/脚本。
   - 输出唯一 target label。
2. `build`
   - GitHub-hosted Ubuntu。
   - checkout source SHA。
   - Node 24、pnpm frozen install。
   - 执行受控 preset 的 generate/typecheck/build/package。
   - 生成 metadata/checksum。
   - artifact 名包含 deployment ID，保留 30 天。
   - 不接触 production secret。
3. `deploy`
   - `[self-hosted, linux, x64, target-label]`。
   - 绑定精确 GitHub Environment。
   - 不 checkout source、不 install 依赖、不 build。
   - 下载并校验 artifact。
   - preflight、install、activate、verify。
4. `status`
   - 每个阶段写严格枚举的 deployment status description 和 log URL。
   - failure 时写实际阶段和脱敏错误码。

继续将所有第三方 action 固定到完整 commit SHA，并使用最小 `GITHUB_TOKEN` permissions。

### 10.2 `scripts/deploy/build.mjs`

- 支持 manifest v2 和 source/control SHA 一致性。
- 输出统一 `release.json`：
  - schema version。
  - repository/unit/preset。
  - source/control SHA。
  - deployment/release/item ID。
  - target role。
  - build timestamp。
- 生成 checksums 和归档 digest。
- 不读取 runtime/migration secret。

### 10.3 `scripts/deploy/preflight.mjs`

只执行固定检查：

- Linux/x64、Node 24、PM2、Nginx、`flock`、`tar`。
- target key、role 和 runner label 与签名 payload 一致。
- deploy/config root 为允许绝对路径。
- 目录 owner/mode。
- 至少 2 GiB 或 15% 可用磁盘；任一条件不满足则失败。
- service 端口未被错误进程占用。
- runtime variable/secret 完整。
- health URL 与绑定的 public origin/health path 一致。
- 不执行任意 manifest 命令。

### 10.4 `scripts/deploy/install.mjs`

- 移除自动 migration 分支。
- 保留归档路径、符号链接和 SHA256 防护。
- 验证签名上下文、artifact digest 和 target role。
- 将 runtime.env 写到 release 外，权限 0600。
- PM2 名称使用 unit + environment。
- 记录本次 config fingerprint，不记录值。
- readiness/health 失败恢复 old current 和 PM2。
- 成功后写 `.success` 与部署状态文件。
- 保留 10 个成功版本。

### 10.5 `scripts/deploy/rollback.mjs`

- 只接受 deployment ID 和已验证 release metadata。
- 目标版本必须属于当前 unit/environment。
- 原子更新 previous/current。
- PM2/static 激活后执行同一健康策略。
- 失败恢复回滚前版本。
- 不执行 migration，不修改 GitHub Environment 配置。

### 10.6 Agent

新增 `scripts/deploy/agent.mjs` 和 systemd unit 示例：

- Agent 与目标 self-hosted runner 使用同一个受限 `my-sp-pr-deploy` OS 账号和 `PM2_HOME`，以便读取实际 PM2 状态；该账号不拥有通用 sudo。
- 启动读取 target ID、Gateway endpoint 和一次性配置后的 agent token。
- 每 60 秒上报一次。
- 使用 `execFile` 固定调用 `pm2 jlist`、`systemctl is-active nginx` 和 runner service 状态；不拼接 shell。
- 使用 Node `os`/`fs` API采集内存、负载、磁盘和 release metadata。
- 不读取 runtime.env 内容，不上报环境变量、日志正文、命令行 secret 或数据库 URL。
- 120 秒内视为 online，120–300 秒为 degraded，超过 300 秒为 offline。
- 磁盘低于 15%/2 GiB 为 degraded，低于 5%/1 GiB 阻止发布。
- Agent 失败不影响已运行应用，只阻止新的发布。

### 10.7 PM2

调整 `deploy/pm2/ecosystem.config.cjs`：

- 进程名 `<unit>-<environment>`。
- 继续 fork 单实例、autorestart、memory restart 和 12 秒 kill timeout。
- 不启用 cluster mode，不声称零停机。
- environment 和路径必须来自经过验证的部署变量。

## 11. Admin Frontend

### 11.1 信息架构

保持 Ant Design 6、现有主题、同源 API 和当前 AppLayout 修改。顶部平台导航继续只有：

- `Dashboard`：现有管理平台首页，不混入部署业务。
- `部署平台`：仅 `super` 可见，默认进入 `/deploy`。

部署平台左侧菜单调整为：

| 菜单 | 路由 | 作用 |
| --- | --- | --- |
| 概览 | `/deploy` | 聚合生产发布、目标机和阻塞风险 |
| 仓库 | `/deploy/repositories` | 管理 GitHub 仓库及 manifest 同步 |
| 应用 | `/deploy/projects` | 管理可部署 unit 和 production 绑定 |
| 目标主机 | `/deploy/targets` | 管理三台机器、Agent 和运行状态 |
| 发布中心 | `/deploy/releases` | 创建单应用/整组发布并查看历史 |
| 审计 | `/deploy/audit` | 查询所有高风险操作 |

首期不增加独立“配置中心”“日志中心”和“数据库中心”：

- 配置状态归属应用的 production 绑定页，值仍在 GitHub Environment。
- 构建/部署日志通过 release/attempt 详情跳转 GitHub Actions。
- 数据库只在概览、发布预览和 migration gate 中展示风险，不提供数据库管理操作。

### 11.2 路由与页面文件

| 路由 | 页面文件 | 类型 |
| --- | --- | --- |
| `/deploy` | `DeployOverviewPage.tsx` | 新增 |
| `/deploy/repositories` | `DeployRepositoriesPage.tsx` | 新增 |
| `/deploy/repositories/:repositoryId` | `DeployRepositoryDetailPage.tsx` | 新增 |
| `/deploy/projects` | `DeployProjectsPage.tsx` | 重构现有 |
| `/deploy/projects/:projectId` | `DeployProjectPage.tsx` | 重构现有 |
| `/deploy/projects/:projectId/environments/:environmentId` | `DeployEnvironmentPage.tsx` | 保留并重构为 production 绑定详情 |
| `/deploy/targets` | `DeployTargetsPage.tsx` | 新增 |
| `/deploy/targets/:targetId` | `DeployTargetDetailPage.tsx` | 新增 |
| `/deploy/releases` | `DeployReleasesPage.tsx` | 由现有 DeploymentsPage 重构 |
| `/deploy/releases/new` | `DeployReleaseCreatePage.tsx` | 新增 |
| `/deploy/releases/:releaseId` | `DeployReleaseDetailPage.tsx` | 新增 |
| `/deploy/deployments/:deploymentId` | `DeploymentDetailPage.tsx` | 保留为单次 attempt 技术详情 |
| `/deploy/audit` | `DeployAuditPage.tsx` | 新增 |

兼容处理：

- 旧 `/deploy/projects` 和项目/环境 URL 保留。
- 旧 `/deploy/deployments` 301/客户端 replace 到 `/deploy/releases`，保留 query。
- 已收藏的 `/deploy/deployments/:deploymentId` 继续可访问。
- `/deploy` 不再跳转项目列表，改为实际概览。

### 11.3 模块一：部署概览

页面：`DeployOverviewPage.tsx`

目标：进入平台后先回答“现在是否安全、正在发布什么、三台机器是否正常、线上是什么版本”。

页面区块：

1. 生产状态摘要
   - 当前活动 release。
   - 最近一次成功 release。
   - 最近一次失败/partial release。
   - blocked migration 数量。
   - 配置不完整 unit 数量。
2. 目标主机摘要
   - `front-01`、`back-01`、`physical-01`。
   - online/degraded/offline/disabled。
   - 最后心跳、磁盘余量、内存余量、runner service。
   - 点击进入 target 详情。
3. 当前部署矩阵
   - 行为 7 个 unit。
   - 列为目标机、当前 SHA、发布时间、状态、是否漂移。
   - physical 首期显示“未绑定应用”，不显示错误。
4. 风险与阻塞
   - PostgreSQL 位于后端服务器。
   - “未配置数据库备份”固定 error Alert。
   - Environment 缺失、Agent 离线、磁盘不足、migration gate。
5. 最近发布
   - 最近 10 个 release batch。
   - 状态、模式、SHA、发起人、开始/结束时间。

操作：

- “新建发布”进入 `/deploy/releases/new`。
- “查看全部发布”进入 `/deploy/releases`。
- 概览本身不提供重启、SSH、执行命令或编辑 secret。

加载与失败：

- 各摘要使用一个聚合 API，避免页面串行发起大量请求。
- GitHub 不可用时仍展示数据库和 Agent 最近状态，并标记 GitHub 数据过期。
- 部分 target 无 snapshot 时显示 pending，不把整页判定失败。

### 11.4 模块二：仓库管理

#### 仓库列表

页面：`DeployRepositoriesPage.tsx`

字段：

- 仓库名称和 GitHub 链接。
- repository ID、owner。
- 默认分支。
- manifest 版本和 control SHA。
- unit 数量。
- enabled 状态。
- 最近同步时间和同步结果。

操作：

- “导入仓库”打开受信仓库选择 Modal。
- “同步清单”只同步选中仓库默认分支。
- 点击行进入仓库详情。

导入 Modal：

- 只列出 GitHub App 可见且 owner 在白名单中的仓库。
- 显示默认分支、manifest 是否存在、标准 workflow 是否存在。
- 不允许手输任意 Git URL、token 或构建命令。
- manifest/workflow 不合格时按钮禁用并显示原因。

#### 仓库详情

页面：`DeployRepositoryDetailPage.tsx`

区块：

- 基本信息：full name、repository ID、installation ID 摘要、默认分支。
- 当前控制版本：control SHA、manifest version、同步时间。
- manifest 校验：有效/无效、结构化错误路径和原因。
- unit 列表：类型、preset、target role、依赖、启用状态。
- 同步记录：操作者、旧/新 control SHA、增删改 unit 数。

操作：

- 同步默认分支 manifest。
- 启用/停用仓库；有活动 release 时禁止停用。
- 跳转 GitHub 仓库和 workflow。

特殊状态：

- 当前仓库必须显示远端默认分支 `master`。
- manifest 的 `defaultRef` 缺省时显示“跟随 master”。
- manifest 变化不会静默改写进行中的 release，旧 release 继续使用已固定 control SHA。

### 11.5 模块三：应用管理

#### 应用列表

页面：重构 `DeployProjectsPage.tsx`

字段：

- 应用名称、unit ID。
- 所属仓库。
- kind、preset、target role。
- production 目标机。
- 当前生产 SHA。
- 最近发布状态和时间。
- 配置状态。
- Agent/目标状态。
- 版本漂移状态。

筛选：

- 仓库。
- frontend/backend。
- target。
- 配置完整/缺失。
- 健康/异常。

操作：

- 点击应用进入详情。
- “发布”预填 single 模式并进入发布创建页。
- “同步清单”移动到仓库模块；应用列表不再承担全局仓库同步。

#### 应用详情

页面：重构 `DeployProjectPage.tsx`

区块：

1. Manifest
   - package/preset/artifact path。
   - target role。
   - dependencies。
   - migration capability/path。
   - public/internal health。
2. Production 绑定
   - target、GitHub Environment、public origin、health URL。
   - branch/tag 规则。
   - 配置完整性。
   - Agent 和当前版本。
3. 发布历史
   - 该 unit 的 release item/attempt。
   - SHA、target、actor、phase、结果。
4. 版本状态
   - manifest 期望版本。
   - Agent 上报 current/previous。
   - 不一致时显示 drift。

操作：

- 新建或编辑 production 绑定。
- 发起该应用单独发布。
- 查看 GitHub Environment。
- 打开 target 详情。
- 不在此页直接回滚；回滚从成功 attempt 详情发起。

#### Production 绑定详情

页面：重构 `DeployEnvironmentPage.tsx`

现有“环境”概念在首期只有 production，该页面负责 unit 与 target/GitHub Environment 的绑定。

展示：

- target 使用 Select，候选项只包含 role 匹配且 enabled 的主机。
- runner label 只读展示，不能自由输入。
- GitHub Environment 是否真实存在。
- manifest variables/secrets 的名称、scope、required、configured。
- secret 只显示“已配置/缺失”，不显示值。
- branch/tag 策略。
- public origin、health URL 和最近验证结果。
- 当前 SHA、config fingerprint、最近 Agent snapshot。

操作：

- 编辑绑定。
- 跳转 GitHub Environment 设置。
- 发起 single release。

阻止保存：

- target role 不匹配。
- production 无 branch/tag 限制。
- public origin/health URL 非 HTTPS 或不匹配。
- target 正被其他 active binding 冲突占用时。

### 11.6 模块四：目标主机

#### 目标主机列表

页面：`DeployTargetsPage.tsx`

字段：

- target 名称/key。
- role。
- environment。
- runner label。
- Agent 状态和最后心跳。
- 磁盘、内存、load。
- runner/Nginx/PM2 摘要。
- 已绑定 unit 数量。
- 当前活动 deployment。

操作：

- 新建 target。
- 查看详情。
- 启用/停用。
- 筛选 role/status。

新建 target Modal：

- 输入 key、显示名称、role、runner label、deploy root、config root。
- OS/arch 首期固定 Linux/x64。
- 创建后显示一次 Agent token 和明确的关闭后不可恢复提示。
- 不自动安装 runner、Agent、Node、PM2 或 Nginx。

#### 目标主机详情

页面：`DeployTargetDetailPage.tsx`

区块：

1. 身份和连接状态
   - key/role/runner label。
   - Agent version、最后心跳、时钟偏差。
   - online/degraded/offline 原因。
2. 资源
   - 磁盘总量/可用量/百分比。
   - 内存和 load average。
   - 仅显示最新 snapshot，不绘制长期趋势图。
3. 服务
   - runner service、Nginx、PM2。
   - PM2 应用、PID、状态、restart count、memory。
4. Release inventory
   - 每个 unit 的 current、previous 和本地成功版本。
   - SHA、deployment ID、安装时间、config fingerprint。
5. 绑定
   - 当前绑定到该 target 的 unit。

操作：

- 编辑显示名称、role、runner label 和目录。
- 轮换/撤销 Agent token。
- 启用/停用 target。
- 查看对应应用和 release。

限制：

- 页面没有终端、文件浏览器、任意命令、PM2 restart 或 Nginx reload 按钮。
- 有 active deployment 时不能修改 role/label/root 或停用。
- `physical-01` 无绑定时正常显示 ready/idle。

### 11.7 模块五：发布中心

#### 发布列表

页面：由 `DeploymentsPage.tsx` 重构为 `DeployReleasesPage.tsx`

字段：

- batch 状态。
- 仓库/environment。
- mode：single/full/rollback。
- requested ref 和 resolved SHA。
- 成功/总 item 数。
- 当前 wave。
- 发起人。
- 创建、开始和结束时间。

筛选：

- 仓库。
- mode。
- status。
- actor。
- 时间范围。

操作：

- 新建发布。
- 打开 release 详情。
- 不在列表行直接执行危险操作。

#### 新建发布

页面：`DeployReleaseCreatePage.tsx`

步骤使用 Ant Design Steps，但页面保持单层布局：

1. 选择范围
   - repository。
   - production。
   - single/full。
   - single 时选择 unit；full 自动选仓库所有 enabled unit。
2. 选择版本
   - branch/tag/完整 SHA。
   - 默认值来自 repository default branch。
3. 发布预览
   - commit、source SHA、control SHA。
   - unit、target 和依赖波次。
   - Environment/config、Agent、磁盘和 health 检查。
   - migration changed paths 和 gate。
4. 风险确认
   - production、无数据库备份、短暂中断、数据库不自动回滚。
   - 输入 repository slug。
5. 创建
   - 无阻塞项时创建 queued batch。
   - 有 migration gate 时创建 blocked batch，并进入 release 详情等待证据。

preview 变化：

- 切换 repository/mode/unit/ref 后取消旧请求并重新预览。
- preview 返回 token；创建时服务端重新核对。
- commit/manifest/config/target 任一变化都要求重新确认。

#### Release 详情

页面：`DeployReleaseDetailPage.tsx`

顶部：

- batch 状态、mode、repository、environment。
- requested ref、resolved SHA、control SHA。
- actor、创建/开始/结束时间。
- 成功/失败/跳过 item 计数。

波次视图：

- Wave 1：业务 API。
- Wave 2：Gateway。
- Wave 3：Web。
- 每个 item 显示 target、当前 phase、attempt、耗时和阻塞原因。
- full release 的 partial 状态必须突出显示线上已混合版本。

时间线：

- preview/confirmation。
- migration gate。
- GitHub deployment 创建。
- build/artifact/preflight/install/activate/verify。
- cancel/retry/rollback。

操作状态：

- waiting/queued/building：显示取消。
- deploy/install/activate/verify：不显示强制取消。
- failed/cancelled/stale：显示重试。
- succeeded/inactive：显示回滚到该 attempt。
- blocked migration：显示“提交迁移证据”。

迁移证据 Modal：

- 显示 changed migration paths。
- 显示人工 workflow 操作说明和无备份警告。
- 输入 GitHub workflow run URL。
- 服务端验证后刷新 gate；前端不接受手工勾选“已完成”。

#### Deployment Attempt 详情

页面：保留并重构 `DeploymentDetailPage.tsx`

该页用于技术排障，不替代 release 业务视图：

- 所属 release/item/attempt number。
- source/control SHA。
- target。
- GitHub deployment/run/artifact。
- artifact digest/expiry。
- config fingerprint。
- 当前 phase、失败 stage/code。
- webhook/reconcile event 时间线。
- GitHub Actions 日志链接。
- 成功 attempt 的回滚入口。

### 11.8 模块六：审计

页面：`DeployAuditPage.tsx`

字段：

- 时间。
- actor。
- action。
- resource type/name。
- outcome。
- reason 摘要。
- request ID。

筛选：

- actor。
- action。
- resource type。
- outcome。
- 时间范围。

详情 Drawer：

- 展示经过字段白名单过滤的 metadata。
- 不展示 token、secret、数据库 URL、runtime.env、完整 webhook 或日志正文。

审计覆盖：

- repository import/sync/enable/disable。
- target create/update/enable/disable/token rotate/revoke。
- environment binding create/update。
- release preview/create/cancel/retry。
- migration evidence。
- rollback。
- webhook mismatch、GitHub error、workflow stale 和 Agent authentication failure。

### 11.9 公共组件

新增或重构：

- `RepositoryStatus.tsx`
- `TargetStatus.tsx`
- `ReleaseStatus.tsx`
- `ReleasePhaseTimeline.tsx`
- `ReleaseWaveTable.tsx`
- `PreflightCheckList.tsx`
- `ConfigurationStatusTable.tsx`
- `MigrationGateAlert.tsx`
- `VersionDriftIndicator.tsx`
- `RiskConfirmationModal.tsx`

原则：

- 状态枚举集中映射文本、颜色和图标，不在各页面重复 switch。
- 表格默认紧凑，长 SHA/路径使用可复制文本和截断 Tooltip。
- 危险操作使用 Modal + typed confirmation。
- 不把页面 section 包装成层层嵌套 Card。
- 图标使用现有 Ant Design icons。

### 11.10 Hooks 和前端状态

保留 `useAbortable`/`useApiAction` 模式并拆分：

- `useDeployOverview.ts`
- `useDeployRepositories.ts`
- `useDeployProjects.ts`
- `useDeployTargets.ts`
- `useDeployReleases.ts`
- `useDeployAudit.ts`

轮询：

- release 非终态每 3 秒刷新。
- target 列表/详情每 15 秒刷新。
- overview 每 15 秒刷新。
- 终态 release 停止自动轮询。
- 页面卸载、参数变化和手动刷新时取消旧请求。

不新增全局状态管理库。筛选条件放 URL query，表单/Modal 状态留在页面局部。

### 11.11 页面权限与异常

- `SessionGate` 继续负责登录。
- `/deploy/*` 整体由 `SuperGate` 保护。
- 非 super 不显示顶部部署平台入口和任何侧栏项。
- 前端隐藏不是授权；后端每个接口仍单独校验。
- 所有页面覆盖：
  - loading/skeleton。
  - 空状态。
  - 403。
  - GitHub 不可用。
  - Agent pending/offline。
  - Environment/配置缺失。
  - release conflict/stale。
  - failed/partial/succeeded。
- 破坏性操作失败后保留用户输入和上下文，不跳转到虚假成功页。

## 12. Security Controls

- 仅 `super` 可见部署导航；所有后端 API 独立执行 `requireSuper`。
- 浏览器写操作继续验证 Origin 和 CSRF。
- Agent bearer token 只保存 hash，支持轮换和撤销。
- deployment payload 使用非对称签名和短有效期，workflow 先验签再选择 runner。
- source SHA、control SHA、manifest version、unit、environment 和 target 全部进入签名。
- build 与 production secret 隔离。
- self-hosted runner 使用专用 OS 用户，不授予通用 sudo，不运行 PR/fork workflow。
- 前端 runner 无数据库和后端 secret。
- 后端 runner 仅获得当前 GitHub Environment 显式映射的 secret。
- migration secret 只进入人工 migration workflow 的迁移子进程。
- artifact 校验文件清单、SHA256、路径和符号链接边界。
- GitHub Environment 必须存在，不能由拼错名称的 workflow 隐式创建后继续发布。
- health/public origin 只接受 HTTPS production URL；后端公网入口须校验证书并受来源白名单限制，内部地址按 target role 和实际网络策略校验。
- audit、错误和 Agent payload 不保存凭据、请求体、SQL 参数或日志正文。
- `.github/workflows/`、`scripts/deploy/`、`deploy.manifest.json` 建议加入 CODEOWNERS/分支保护；若仓库只有一名维护者，记录为人工仓库设置而非平台双人审批。

## 13. Failure Modes

| 场景 | 行为 |
| --- | --- |
| SSO 不可用 | fail closed，禁止读取/操作部署平台 |
| GitHub App 配置失效 | 禁止新发布，历史和 Agent 状态仍可读 |
| manifest 与 preview 后发生变化 | 返回 `MANIFEST_CHANGED`，要求重新预览 |
| target/Agent 离线 | 阻止创建对应 deployment |
| runner 实际未接任务 | attempt 进入 stale，对账后失败，不推进下一波 |
| GitHub Environment 不存在 | 阻止发布，不让 workflow 自动创建空环境 |
| variable/secret 缺失 | 阻止发布 |
| 磁盘不足 | target preflight 失败，不写 release |
| build 失败 | 不接触目标机和 production secret |
| artifact 摘要失败 | 不切换 current |
| PM2 reload/health 失败 | 恢复 previous；数据库状态不变 |
| 部分 wave 失败 | 停止后续 wave，batch 标记 partial/failed |
| webhook 丢失/乱序/重复 | 主动对账；终态保护；delivery 幂等 |
| Admin 自发布重启 | workflow 继续；服务恢复后 orchestrator 从数据库续跑 |
| migration 变化 | batch blocked，验证人工 migration run 后继续 |
| rollback artifact 过期 | 优先本地版本；均不存在则明确拒绝 |
| PostgreSQL 故障 | Admin 和业务不可用；GitHub workflow 状态保留，恢复后对账 |
| Agent token 泄露 | 撤销/轮换；token 不能执行命令或发布 |

## 14. Proposed File Changes

### 14.1 Contracts And Generated Artifacts

- `backend/contracts/src/admin.contract.ts`
  - 新增 repository、target、Agent、release batch、migration evidence 和 audit 契约。
  - 调整 environment/deployment Schema 和错误码。
- `backend/contracts/src/shared.ts`
  - 仅在确有跨服务复用时增加共享枚举；部署领域类型优先留在 admin contract。
- 生成：
  - `backend/contracts/dist/`
  - `backend/gateway/generated/openapi.json`
  - `backend/pr-admin/generated/openapi.json`
  - `frontend/pr-admin/src/api/generated/`

生成文件只通过 `pnpm generate:api` 更新。

### 14.2 Admin Database

- `backend/pr-admin/src/db/schema/index.ts`
  - 新表、字段、索引、check 和关系。
- `backend/pr-admin/drizzle/<next>_deployment_platform_v2.sql`
- `backend/pr-admin/drizzle/meta/*`
  - 由 Drizzle 生成后补充必要的数据回填 SQL。
- 不修改已有 migration。

### 14.3 Admin Backend

- 修改 `backend/pr-admin/src/config/env.ts`、`.env.example`
  - 多仓库 GitHub App 配置。
  - deployment signing key。
  - orchestrator/reconciler 间隔。
  - Agent heartbeat 限制。
- 修改 `backend/pr-admin/src/github/github-app.ts`
  - 按 installation ID 获取 token。
- 扩展 `backend/pr-admin/src/github/github-client.ts`
  - repositories、environment 本体、compare、workflow runs/artifacts/cancel。
- 修改 `backend/pr-admin/src/github/webhook.ts`
  - 严格 phase、run ID 和事件映射。
- 修改 `backend/pr-admin/src/deploy/manifest.ts`
  - manifest v2、依赖 DAG 和兼容解析。
- 拆分/替换 `backend/pr-admin/src/services/deployment.service.ts`。
- 新增：
  - `services/repository-catalog.service.ts`
  - `services/target.service.ts`
  - `services/release-preview.service.ts`
  - `services/release.service.ts`
  - `services/release-orchestrator.ts`
  - `services/deployment-reconciler.ts`
  - `deploy/deployment-authorization.ts`
  - 对应 repository/controller/routes。
- 修改 `backend/pr-admin/src/app.ts`
  - Agent endpoint 单独 body limit/auth 装配。
- 修改 `backend/pr-admin/src/server.ts`
  - orchestrator/reconciler 生命周期和优雅关闭。
- 扩展 `backend/pr-admin/src/tests/verify-admin.ts`。

### 14.4 Admin Frontend

- 修改 `frontend/pr-admin/src/App.tsx`
  - 新路由和旧 deployment URL 的兼容跳转。
- 修改当前工作区版本的 `frontend/pr-admin/src/components/AppLayout.tsx`
  - 只追加菜单，不回退用户现有布局。
- 重构现有页面：
  - `frontend/pr-admin/src/pages/DeployProjectsPage.tsx`
  - `frontend/pr-admin/src/pages/DeployProjectPage.tsx`
  - `frontend/pr-admin/src/pages/DeployEnvironmentPage.tsx`
  - `frontend/pr-admin/src/pages/DeploymentsPage.tsx`
  - `frontend/pr-admin/src/pages/DeploymentDetailPage.tsx`
- 新增：
  - `frontend/pr-admin/src/pages/DeployOverviewPage.tsx`
  - `frontend/pr-admin/src/pages/DeployRepositoriesPage.tsx`
  - `frontend/pr-admin/src/pages/DeployRepositoryDetailPage.tsx`
  - `frontend/pr-admin/src/pages/DeployTargetsPage.tsx`
  - `frontend/pr-admin/src/pages/DeployTargetDetailPage.tsx`
  - `frontend/pr-admin/src/pages/DeployReleasesPage.tsx`
  - `frontend/pr-admin/src/pages/DeployReleaseCreatePage.tsx`
  - `frontend/pr-admin/src/pages/DeployReleaseDetailPage.tsx`
  - `frontend/pr-admin/src/pages/DeployAuditPage.tsx`
- 新增或重构组件：
  - `frontend/pr-admin/src/components/RepositoryStatus.tsx`
  - `frontend/pr-admin/src/components/TargetStatus.tsx`
  - `frontend/pr-admin/src/components/ReleaseStatus.tsx`
  - `frontend/pr-admin/src/components/ReleasePhaseTimeline.tsx`
  - `frontend/pr-admin/src/components/ReleaseWaveTable.tsx`
  - `frontend/pr-admin/src/components/PreflightCheckList.tsx`
  - `frontend/pr-admin/src/components/ConfigurationStatusTable.tsx`
  - `frontend/pr-admin/src/components/MigrationGateAlert.tsx`
  - `frontend/pr-admin/src/components/VersionDriftIndicator.tsx`
  - `frontend/pr-admin/src/components/RiskConfirmationModal.tsx`
- 拆分 hooks：
  - `frontend/pr-admin/src/hooks/useDeployOverview.ts`
  - `frontend/pr-admin/src/hooks/useDeployRepositories.ts`
  - `frontend/pr-admin/src/hooks/useDeployProjects.ts`
  - `frontend/pr-admin/src/hooks/useDeployTargets.ts`
  - `frontend/pr-admin/src/hooks/useDeployReleases.ts`
  - `frontend/pr-admin/src/hooks/useDeployAudit.ts`
- `frontend/pr-admin/src/hooks/useDeployData.ts` 在调用迁移完成后删除或缩减为不重复的共享逻辑。
- 沿用 `requestApi`、生成 SDK、ahooks AbortController 和 Ant Design 6。

### 14.5 Release Infrastructure

- 升级 `deploy.manifest.json` 到 v2。
- 重构 `.github/workflows/deploy.yml`。
- 新增 `.github/workflows/migrate.yml`，只支持人工 workflow dispatch。
- 修改：
  - `scripts/deploy/validate-manifest.mjs`
  - `scripts/deploy/build.mjs`
  - `scripts/deploy/install.mjs`
  - `scripts/deploy/github-status.mjs`
- 新增：
  - `scripts/deploy/verify-authorization.mjs`
  - `scripts/deploy/preflight.mjs`
  - `scripts/deploy/rollback.mjs`
  - `scripts/deploy/agent.mjs`
- 修改 `deploy/pm2/ecosystem.config.cjs`。
- 新增 systemd/Nginx 示例文件，但不提供远程安装器：
  - `deploy/systemd/my-sp-pr-agent.service.example`
  - `deploy/nginx/*.conf.example`

### 14.6 Commands And Documentation

- 修改根 `package.json`
  - manifest v2 校验。
  - Agent 本地校验或 dry-run 命令。
  - release script dry-run 命令。
- 更新 `README.md`
  - 三机 production 拓扑。
  - 前端反代、后端 loopback、PostgreSQL 本机部署。
  - GitHub App、Environment、runner labels、Agent 注册。
  - 人工 migration workflow。
  - 首次 bootstrap、自发布、故障处理和回滚。
  - 明确无备份风险。
- 更新 `AGENTS.md`
  - 新模型、命令、目标机和部署边界。

## 15. Implementation Order

### Milestone 0：冻结事实和兼容基线

1. 保存当前生成产物和数据库 schema 基线。
2. 为现有 7 个 unit、环境、deployment、event、audit 建立迁移计数断言。
3. 记录当前远端默认分支 `master`，修正 manifest/default ref 规则。
4. 明确生产 target key、公网 TLS 链路、域名、runner service 名和目录 owner，值放部署配置/文档，不硬编码业务源码。

### Milestone 1：契约和数据模型

1. 定义 repository、target、release batch/item、migration gate 和 audit Schema。
2. 增加 Drizzle schema 和增量 migration。
3. 实现历史数据回填和兼容读取。
4. 生成 OpenAPI/SDK，先完成后端类型闭环。

2026-09-24 验证结果：M1 按第 6.12 节兼容范围完成。14 个变更手写代码文件精确 lint、Kit 元数据检查、全部包类型检查和构建通过（Vite 保留大 chunk 提示）。`pnpm verify:admin` 在临时 PG18 完成空库/0002 升级、原字段与行数保留、七种旧状态、外键与唯一约束、权限、分页、Gateway HTTP 及既有 SSO/BFF 验证，临时数据库和监听器均已清理。GitHub/OIDC 外部上游使用测试替身，未验证生产 App 和主机。正式库尚未执行 `0003`/`0004`，启用新后端前需显式迁移；本轮没有改动本地登录配置或接入剩余前端页面。

### Milestone 2：仓库目录和 Manifest V2

1. 实现多 installation GitHub client。
2. 实现 repository import/sync。
3. 实现 manifest v1/v2 解析、DAG、default branch 和 control SHA。
4. 将当前 manifest 升级为 v2 并验证 7 个 unit。

2026-09-24：M2 实现与验证完成。

- 新增仓库 available/import/sync 三个 API，经 Gateway、要求 super；两个写接口校验 Origin/CSRF。可见性由 App installation 与 owner 白名单共同决定，分页有明确上限。
- installation token 独立缓存并合并并发刷新；环境配置、refs、旧发布请求按项目所属仓库发起；webhook 校验目录中的仓库 ID、名称和 installation。
- 默认分支 SHA 固定后读取 manifest/workflow，显式 ref 校验通过后才进入同步事务。新增 `0005_repository_manifest_v2`，保留旧项目 ID/slug，导入仓库使用带 repository ID 的 slug；同 SHA 下移除 unit 也能停用。冲突返回 409，失败不留下部分目录或 unit。
- 当前清单为 V2，三个 API → Gateway → 三个前端依赖波次已校验；V1 仍兼容。Admin 和无依赖 runner 解析器拒绝越界路径、未知字段/preset、敏感构建变量、重复变量/依赖及依赖环，已有 build/install 工具支持 V2。
- 验证通过：19 个本次变更手写代码文件精确 lint、Kit `db:check`、`deploy:validate`、全部包类型检查与构建（Vite 仍提示大 chunk）；最终 Admin 类型复查和 `pnpm verify:admin` 通过。临时 PG18 验证空库及 0002 升级到 0005、旧数据保留；本地 GitHub HTTP 服务验证分页/token 隔离、无兼容环境变量导入、master 回退、缺失 ref/workflow、错误清单、事务回滚和跨仓库发布；真实 Gateway 请求覆盖新读写接口的鉴权与 CSRF。临时数据库、密钥和监听器已清理。

正式库未执行迁移，本地登录与生产配置未改动；未连接生产 GitHub App、runner 或三台主机。仓库导入 UI、Agent、精确 runner 路由、签名授权及波次执行器仍属后续里程碑，现有 workflow 继续限定七个 unit。下一步为 M3 目标主机和 Agent。

### Milestone 3：目标主机和 Agent

1. 实现 target CRUD、绑定约束和 token 生命周期。
2. 实现 heartbeat auth、snapshot 和状态阈值。
3. 实现 Agent、systemd 示例和手工注册流程。
4. 在 UI 完成 target 列表、详情、token 一次性展示和 unit 绑定。

### Milestone 4：发布预览和状态机

1. 实现 ref/source SHA/control SHA 固定。
2. 实现配置、target、Agent、ref 和 migration diff 预检。
3. 实现 preview token 和 production 强确认。
4. 实现 batch/item/attempt 状态机、并发索引和审计。

### Milestone 5：Workflow 和本地安装

1. 实现 deployment payload 签名/验签。
2. 重构 build/deploy workflow 和阶段状态。
3. 重构 build/preflight/install/status 脚本。
4. 实现 30 天 artifact 和目标机 10 版保留。
5. 更新 PM2 环境化进程名和 Nginx 示例。

### Milestone 6：编排、对账、取消和重试

1. 实现 durable orchestrator 和波次推进。
2. 实现 GitHub status/workflow 对账。
3. 实现安全取消和 attempt 重试。
4. 覆盖 Admin 自发布重启恢复。

### Milestone 7：Migration 门禁和回滚

1. 实现 migration path compare 和保守阻塞。
2. 增加人工 migration workflow。
3. 实现 workflow run evidence 验证。
4. 实现本地优先、原 artifact 次选的代码回滚。
5. 展示 config fingerprint 和数据库不可回滚风险。

### Milestone 8：完整管理 UI

1. 概览。
2. 仓库/应用。
3. target。
4. 发布预览、release 详情。
5. 审计。
6. 全部错误、空、加载、stale、partial 和权限状态。

### Milestone 9：文档、演练和生产上线

1. 更新 README/AGENTS 和手工主机准备清单。
2. 在临时目录和临时 PG18 完成自动验证。
3. 在物理机做不绑定 production unit 的 Agent/runner/preflight 验证。
4. 人工初始化后端 PostgreSQL 和三台 runner/Agent。
5. 手工部署控制面。
6. 先发布一个无数据库变更的前端 unit。
7. 再发布一个无 migration 的后端 attempt。
8. 验证整组发布、失败恢复和回滚。
9. 最后验证人工 migration gate；无备份状态下不得用破坏性 migration 演练生产库。

## 16. Verification

### 16.1 静态和生成检查

- `pnpm generate:api`
- `pnpm deploy:validate`
- 只对本次实际修改/新增的手写 JS/MJS/TS/TSX 文件运行显式路径 lint。
- 不 lint 自动生成文件、JSON、YAML、SQL 或 Markdown。
- 不运行全项目 lint、format 或 fix。
- 对受影响包执行 typecheck：
  - contracts
  - pr-admin API
  - Gateway
  - pr-admin Web
  - 被 manifest/build 调整影响的 7 个应用
- 最后执行 `pnpm build`，单独报告 build，不称为测试。

### 16.2 数据库迁移验证

在新建的临时 PG18 数据库执行：

1. 从空库运行全部 migration。
2. 从现有 admin `0002` schema 运行增量 migration。
3. 插入现有 project/environment/deployment/event/audit 样例后迁移。
4. 验证所有行数、外键、synthetic batch/item 和 legacy target。
5. 验证活动 batch、item、attempt 并发唯一约束。
6. 验证回滚 migration 不提供 down 操作。

不得在用户生产库执行自动测试或破坏性验证。

### 16.3 Admin 集成验证

扩展 `pnpm verify:admin`：

- super 成功，admin/user 全部 deploy API 403。
- repository owner/installation/repository ID 校验。
- remote default `master` 正确回退。
- manifest v1 兼容、v2 成功、非法路径/依赖环/未知 preset 失败。
- target role、唯一 label、token hash/轮换/撤销。
- heartbeat 时间、nonce、字段白名单和 offline 阈值。
- preview 事实固定和过期。
- 同 repository/environment batch 冲突。
- 单 unit/full batch 波次。
- partial、cancel、retry 和恢复。
- webhook 验签、重放、乱序和主动对账。
- migration diff/gate/evidence。
- rollback 本地存在、artifact fallback、artifact expired。
- audit 不含 secret。

### 16.4 Release 脚本验证

在临时目录 dry-run：

- 7 个 unit 构建产物完整。
- source/control SHA 和签名不匹配时拒绝。
- target role/label 不匹配时拒绝。
- tar path traversal、越界 symlink、缺文件、额外文件和 checksum 篡改时拒绝。
- runtime.env 权限为 0600，migration secret 不写入。
- 原子 current/previous 切换。
- PM2/static 激活。
- internal ready/public health/release SHA。
- install/reload/health 失败恢复。
- 同 unit/environment `flock`。
- 10 版保留及 protected release 不清理。
- rollback 不重新 build。
- Agent 不上报 secret、日志正文或 runtime.env。

### 16.5 Workflow 验证

- build job 只在 GitHub-hosted runner。
- deploy job 精确命中 `deploy-front-01` 或 `deploy-back-01`。
- `physical-01` 未绑定时不会收到现有 unit。
- build job 不获得 production Environment secret。
- target job 不 checkout source、不执行 install/build。
- 所有 action 固定完整 SHA。
- artifact retention 为 30 天。
- deployment status 的 phase、failure code 和 log URL 正确。
- queued/building 可取消；deploying 后拒绝危险取消。
- migration workflow 只能人工触发并只执行固定迁移入口。

### 16.6 浏览器验收

- 仅 super 看到部署导航；直接请求仍由后端保护。
- repository、unit、target、release、audit 页面正常。
- 目标离线、配置缺失、Environment 不存在、migration required 时无法提交。
- 单应用和整组 preview 清晰显示目标、SHA 和波次。
- release detail 可持续恢复轮询，卸载取消旧请求。
- 长仓库名、ref、SHA、错误消息不溢出。
- 深浅主题、键盘焦点和现有布局不回归。
- 不修改用户当前 AppLayout 的固定 Sider 决策。

### 16.7 真实生产前演练

需要用户提供 GitHub App、Environment、runner 和目标机后执行：

1. 三台 Agent 在线，target 状态正确。
2. 前端 job 只落到前端服务器。
3. 后端 job 只落到后端服务器。
4. 人为停掉 physical runner，不影响当前 7 个 unit。
5. 发布一个前端，校验 release SHA。
6. 发布一个后端，校验 PM2/current/health。
7. 模拟 health 失败并确认恢复 previous。
8. 丢弃一条 webhook，确认 reconciler 恢复状态。
9. 执行整组发布并确认波次。
10. 回滚到本地旧版本，确认未重新构建。

未取得真实凭据和主机时，这一节必须明确标记为未验证。

## 17. Rollout

### 17.1 人工基础设施准备

按文档人工完成：

- 三台 Linux x64 的专用 `my-sp-pr-deploy` 用户；目标 runner 和 Agent 使用该账号，Nginx/PostgreSQL 继续使用各自服务账号。
- Node.js 24、pnpm/Corepack、PM2、Nginx、`flock`、`tar`。
- 后端服务器 PostgreSQL 18、数据库、六个现有 app/migrator 角色和 schema 权限。
- `/srv/my-sp-pr`、`/etc/my-sp-pr` 目录和最小 owner/mode。
- 前端 HTTPS 域名、证书、SPA fallback 和 Gateway 反代。
- 公网 TLS 入口、前端出口 IP 白名单、frp 认证与加密；Gateway/API/PostgreSQL 保留 loopback 边界。
- 三个唯一 runner label。
- GitHub App 权限、webhook 和每 unit production Environment。
- deployment authorization signing key/public key ring。

### 17.2 控制面自举

由于平台不能在自身尚未可用时部署自身：

1. 手工构建并部署 pr-auth、Gateway、pr-admin API/Web。
2. 手工执行新增 admin migration。
3. 确认 super 登录和历史数据迁移。
4. 导入当前 repository。
5. 创建 `front-01`、`back-01`、`physical-01`。
6. 在三台机器配置 Agent token并确认 online。
7. 绑定当前 7 个 unit。
8. 之后平台接管新的应用版本发布。

### 17.3 回退

- 应用代码：目标机 previous/local release 或原 artifact。
- Admin 数据模型：新增 migration 不提供自动 down；上线前在临时库完整验证。
- 新平台不可用：GitHub workflow 和已运行应用不受影响；暂停新发布，修复控制面后对账。
- PostgreSQL 数据：首期无备份，无法承诺灾难恢复；这是已接受但必须持续可见的风险。

## 18. Acceptance Checklist

- [ ] 当前仓库默认分支正确显示为 `master`。
- [ ] 7 个 unit 的 manifest v2 和依赖 DAG 校验通过。
- [ ] 三台 target 可注册，Agent token 只显示一次。
- [ ] 三台 target 状态和 runner label 不会混淆。
- [ ] 当前前端/后端 unit 只能绑定到正确 role。
- [ ] production Environment 不存在时禁止发布。
- [ ] 单应用发布使用固定 source/control SHA。
- [ ] 整组发布按 API -> Gateway -> Web 波次执行。
- [ ] migration 变化在人工证据验证前保持 blocked。
- [ ] build 不接触生产 secret，target 不执行源码构建。
- [ ] 发布失败恢复上一代码版本并保留真实 partial 状态。
- [ ] 回滚复用原始 artifact 或本地 release，不重建旧 SHA。
- [ ] webhook 丢失后可主动对账。
- [ ] 安全阶段可取消，失败 attempt 可重试。
- [ ] 本地保留 10 版，GitHub artifact 保留 30 天。
- [ ] audit 页面可查询全部高风险动作且不泄露 secret。
- [ ] Admin 自发布重启后 batch 可恢复。
- [ ] README 明确本机 PostgreSQL、无备份、无 HA、无自动 migration。
- [ ] 只对本次变更手写代码执行精确路径 lint。

## 19. Research References

- GitHub self-hosted runner 标签为累计匹配：
  - https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/use-in-a-workflow
- GitHub self-hosted runner 不是一次性干净环境，需限制不可信 workflow：
  - https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions
- GitHub Environment 的审批、分支、secret 和环境不存在时的创建行为：
  - https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments
- GitHub deployment status 历史保留 90 天，因此本地审计不能依赖 GitHub 长期保存：
  - https://docs.github.com/en/rest/deployments/statuses
- Artifact attestation 可作为后续供应链增强；私有仓库可用性依赖 GitHub 套餐，首期不作为硬依赖：
  - https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations/using-artifact-attestations-to-establish-provenance-for-builds
