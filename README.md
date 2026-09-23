# my-sp-pr

React 19 + Ant Design 6 + Vite + Express 5 + Node.js 24 的 pnpm workspace。包含三个前端、四个后端、契约包和数据库包，前端统一通过 Gateway 访问 API。

当前提供真实健康检查、PostgreSQL 18 + Drizzle，以及基于 oidc-provider 的 SSO：用户名密码登录、持久化中央会话、`super/admin/user` 三角色准入和当前浏览器退出。Admin 已通过 OIDC BFF 接入 SSO；`admin` 可进入平台，只有 `super` 可使用 GitHub Deployment 发布模块。Chat 尚未接入登录，注册、账号管理、系统设置和聊天业务权限后续单独实现。

## 快速开始

使用 Node.js 24 和 pnpm 10.25.0（可通过 `corepack enable` 启用）。

```sh
pnpm install
pnpm generate:api
pnpm db:bootstrap # 首次空库初始化；先按下方说明配置管理员 URL
pnpm db:migrate
pnpm --filter @my-sp-pr/pr-auth-api auth:keys
pnpm --filter @my-sp-pr/pr-auth-api auth:bootstrap owner # 首账号为 super
pnpm dev
```

三个业务后端必须配置各自 `.env` 并完成数据库迁移；Admin 还需要 OIDC 会话密钥，启用发布时需要 GitHub App 配置。已初始化的数据库跳过 db:bootstrap。已有身份配置/用户跳过 auth:keys/auth:bootstrap，前者不覆盖已有文件，后者只允许空用户库。密码在终端隐藏输入，15–128 字符。根开发命令先生成接口、编译数据库包，再启动七个应用、契约监听和数据库包编译监听；`Ctrl+C` 关闭全部子进程。

| 项目路径 | 包名 | 开发端口 | 预览端口 | 健康接口 |
| --- | --- | --- | --- | --- |
| frontend/pr-chat | @my-sp-pr/pr-chat-web | 5173 | 4173 | 经 Gateway 查询 pr-chat |
| frontend/pr-admin | @my-sp-pr/pr-admin-web | 5174 | 4174 | 经 Gateway 查询 pr-admin |
| frontend/pr-sso | @my-sp-pr/pr-sso-web | 5175 | 4175 | 经 Gateway 查询 pr-auth |
| backend/gateway | @my-sp-pr/gateway | 3000 | — | /api/health |
| backend/pr-chat | @my-sp-pr/pr-chat-api | 3001 | — | /api/chat/health |
| backend/pr-auth | @my-sp-pr/pr-auth-api | 3002 | — | /api/auth/health |
| backend/pr-admin | @my-sp-pr/pr-admin-api | 3003 | — | /api/admin/health |
| backend/contracts | @my-sp-pr/contracts | — | — | 无监听端口 |
| backend/database | @my-sp-pr/database | — | — | 无监听端口 |

打开 http://localhost:5173、http://localhost:5174、http://localhost:5175。前端 `/api` 由 Vite 原样代理到 `http://127.0.0.1:3000`，再由 Gateway 转发到对应下游。前端端口占用时直接报错。

## 目录

```text
frontend/
  pr-chat/                 # 客户端
  pr-admin/                # 管理平台
  pr-sso/                  # 专用登录、状态和退出页面
backend/
  contracts/src/           # *.contract.ts 分服务维护，shared.ts 共享，contract.ts 聚合
  database/                # PG Pool、Drizzle、配置、迁移、初始化与集成验证
  gateway/                 # 唯一浏览器 API 入口
  pr-chat/                 # 客户端业务服务
  pr-auth/                 # 身份服务
  pr-admin/                # 管理服务
scripts/
  api-projects.ts          # 文档与 SDK 的输出目录映射
  generate-api.ts          # 编译契约、生成文档与 SDK、按内容发布
  watch-api.ts             # 防抖、串行生成与失败恢复
  lint-files.mjs           # 仅允许显式指定变更文件
  deploy/                  # 固定 preset 构建、制品校验、版本切换与状态回写
deploy.manifest.json       # 7 个独立发布 unit 及变量白名单
.github/workflows/deploy.yml # GitHub Deployment 构建/发布工作流
```

各前端保留页面、布局、`hooks/useHealth.ts`、`api/client.ts` 和 `api/generated/`。各后端保留 `routes`、`controllers`、`services`、`middlewares`、`config` 分层，以及自己的 `dist/`、`generated/openapi.json`。三个业务服务独立维护 `src/db/schema/`、`drizzle.config.ts` 和版本管理中的 `drizzle/` 迁移。

## 前端组件与主题

三个前端使用 Ant Design 6，采用蓝灰配色；SSO 仅保留登录、状态、退出、错误和 404 页面。后续基础 UI 优先使用 Antd 组件，Tailwind CSS 用于布局、间距与响应式。完整设计约定见 [AGENTS.md](AGENTS.md#ui-组件与主题设计规范)。

顶栏提供“浅色 / 深色 / 跟随系统”，默认跟随系统。各应用将偏好保存在独立的 `my-sp-pr:pr-chat:theme`、`my-sp-pr:pr-admin:theme`、`my-sp-pr:pr-sso:theme` 键中，同应用同源标签页同步；不做跨域或账号同步。手动选择不受系统变化影响；非法值或删除偏好回到系统，存储不可用时仍可在当前标签页切换。

各前端独立维护以下文件，不跨应用导入 UI 源码：

| 文件 | 职责 |
| --- | --- |
| `src/theme/config.ts` | 主色 `#1677FF`、深浅背景及 Antd 默认/暗色算法 |
| `src/theme/ThemeProvider.tsx` | 中文语言、Antd App 上下文、CSS Token 和样式层级 |
| `src/theme/theme-store.ts`、`src/hooks/useTheme.ts` | 偏好持久化、系统变化、标签同步与减少动画订阅 |
| `src/components/ThemeSwitcher.tsx` | 三态主题菜单 |
| `index.html` | 加载应用前设置主题背景，避免深色首屏闪烁 |
| `src/styles/index.css` | Tailwind 与 Antd 层级、页面语义样式及减少动画 |

浅色页面背景 `#F5F5F5`、内容及浮层 `#FFFFFF`；深色页面背景 `#141414`、内容及浮层 `#1F1F1F`。其他颜色由 Antd Token 派生，辅助文字、链接、选中态和主按钮在统一主题中选择更清晰的算法色阶。修改背景或 `project.id` 时同步首屏脚本；新增消息、通知与确认框使用 `App.useApp()` 以继承主题。主题切换保留页面状态，健康检查仍请求真实 Gateway 与对应服务。

## 命令

在根目录执行：

| 命令 | 行为 |
| --- | --- |
| `pnpm dev` | 生成接口、编译数据库包，启动七个应用和两个监听器 |
| `pnpm dev:frontend` | 生成接口，启动三个前端和一个监听器 |
| `pnpm dev:backend` | 生成接口、编译数据库包，启动四个后端和两个监听器 |
| `pnpm generate:api` | 离线编译契约包并生成四份 OpenAPI、三份 SDK |
| `pnpm watch:api` | 初次生成后监听统一契约 |
| `pnpm typecheck` | 先生成、编译数据库声明，再检查九个包与工具脚本 |
| `pnpm build:database` | 离线编译数据库包 |
| `pnpm db:bootstrap` | 首次空库初始化账号并生成本地服务环境文件 |
| `pnpm db:migrate` | 编译数据库包，按 auth → chat → admin 显式迁移 |
| `pnpm verify:database` | 在临时 PG18 库运行集成验证，需管理员及服务凭据 |
| `pnpm verify:auth` | 生成/构建身份服务与 Gateway，在独立临时库验证真实 OIDC 流程及并发 |
| `pnpm verify:admin` | 在独立临时库验证 Admin 会话、发布状态机、并发和 webhook |
| `pnpm deploy:validate` | 校验 `deploy.manifest.json` 的 preset、路径和变量白名单 |
| `pnpm build` | 先生成、检查类型，再按依赖顺序构建 |
| `pnpm start:backend` | 并发运行四个已构建后端 |
| `pnpm preview:frontend` | 在 4173/4174/4175 预览前端构建 |
| `pnpm lint -- <文件路径…>` | 仅检查明确列出的变更文件 |

Lint 不接受目录、glob、空参数、`--fix`，不对生成目录执行 lint；保留已有 `console.log`。

```sh
pnpm lint -- backend/contracts/src/contract.ts frontend/pr-chat/src/hooks/useHealth.ts
```

单项目操作需先执行 `pnpm generate:api`，业务后端另需 `pnpm build:database` 和已迁移的数据库。以下每条命令独立启动一个项目；编辑契约时另开终端执行 `pnpm watch:api`，编辑数据库包时执行 `pnpm --filter @my-sp-pr/database dev`：

```sh
pnpm --filter @my-sp-pr/pr-chat-web dev
pnpm --filter @my-sp-pr/pr-admin-web dev
pnpm --filter @my-sp-pr/pr-sso-web dev
pnpm --filter @my-sp-pr/gateway dev
pnpm --filter @my-sp-pr/pr-chat-api dev
pnpm --filter @my-sp-pr/pr-auth-api dev
pnpm --filter @my-sp-pr/pr-admin-api dev
```

只联调一个前端时，仍需启动 Gateway 和对应下游。单项目构建示例（`...` 包括该包依赖）：

```sh
pnpm generate:api
pnpm build:database
pnpm --filter @my-sp-pr/pr-chat-api... typecheck
pnpm --filter @my-sp-pr/pr-chat-api... build
```

## 接口开发

接口集中在 **`backend/contracts/src/`**：操作在对应 `*.contract.ts`，共享响应在 `shared.ts`，`contract.ts` 仅聚合。契约只依赖 Zod，不导入 ORM 或业务表；四个后端通过 `workspace:*` 引用编译产物，前端只使用生成 SDK。

1. 在对应服务 `*.contract.ts` 定义操作，包含全局唯一 `operationId`、`method`、相对 `path`、`exposure`、`clients`、请求 Schema 和响应 Schema。
2. 在对应后端实现控制器和业务，路由使用 `fullPath`、`expressPath`，输入输出校验复用契约。
3. 运行 `pnpm generate:api`，或由开发监听器自动生成。
4. 前端调用生成函数并显式传入 `apiClient`，通过 ahooks 管理加载、失败、刷新和取消。

接口完整路径为 `/api + namespace + operation.path`。路径参数写作 `/items/{id}`，共享 `expressPath` 转为 Express 的 `/items/:id`。不在应用中重复声明命名空间。

```ts
const payload = await requestApi(
  (signal) => getChatHealth({ client: apiClient, throwOnError: true, signal }),
  active.signal,
);
return unwrapResponse(payload);
```

请求参数沿用 Zod-to-OpenAPI 结构，例如 `request: { params: z.object(...), query: z.object(...), body: { required: true, content: { 'application/json': { schema } } } }`。相应服务控制器负责实际校验，生成器不生成业务处理逻辑。

- `exposure: 'public'` 的操作进入 Gateway；`internal` 操作的 `clients` 必须为空，只保留在下游文档与下游路由。
- `clients` 只筛选 SDK 消费者，不构成权限控制。每份 SDK 包含健康操作；SSO SDK 另含交互、会话、退出 JSON 操作。
- OIDC 协议路由集中在 `auth-oidc.ts`，由 discovery 描述，不生成普通 JSON SDK；包含两个根目录 discovery 和 `/api/auth/oidc/*` 中精确声明的方法/路径。标准表单、重定向和 OAuth 错误保持协议格式。
- Gateway OpenAPI 汇总全部公开操作，下游 OpenAPI 包含自身全部操作。所有文档 `servers` 为 `/api`，paths 自带 `/chat`、`/auth`、`/admin` 命名空间。
- Gateway 公开文档与 SDK 增加跨域 403，被代理操作再增加 502/504。
- 所有 `generated/` 与契约 `dist/` 均自动生成，不手工修改。SDK、OpenAPI 与源契约一起纳入版本管理，dist 是构建产物。
- 先在 `.api-codegen-tmp/` 编译和生成，全部成功再发布。内容不变不重写；变化文件通过临时文件 rename 替换。失败保留上一轮文件，I/O 发布失败尝试回滚。
- 生成前检查重复 operationId、路由、命名空间、消费者和输出冲突。开发初始化、类型检查和构建遇到生成错误立即停止。
- 监听器监控 `contracts/src/` 全部 TS 的新增、修改和删除；每轮独立进程避免模块缓存，失败后等待修复。四个后端监听 `contracts/dist/**/*.js`，三个业务后端额外监听 `database/dist/**/*.js`。热更新不执行数据库迁移。

## PostgreSQL 18 与 Drizzle

当前测试环境使用 Neon 云端 PG18；不需要安装本机 PostgreSQL。三个服务使用同库独立 Schema、独立运行 Pool 和独立迁移历史。技术包不读取 `.env`，不持有全局连接；各服务拥有自己的实例。

| 服务 | Schema | 运行角色 | 迁移角色 | 迁移记录 |
| --- | --- | --- | --- | --- |
| pr-auth | auth | my_sp_pr_auth_app | my_sp_pr_auth_migrator | auth_migrations.__drizzle_migrations |
| pr-chat | chat | my_sp_pr_chat_app | my_sp_pr_chat_migrator | chat_migrations.__drizzle_migrations |
| pr-admin | admin | my_sp_pr_admin_app | my_sp_pr_admin_migrator | admin_migrations.__drizzle_migrations |

首次准备一个空 PG18 数据库，并将管理员连接串写入根目录 `.env.database-admin` 的 `DATABASE_ADMIN_URL`。该文件已被 Git 忽略，建议权限设为 `0600`。管理员需为目标库所有者、具备 CREATEROLE；不需要 superuser。`pnpm db:bootstrap` 保留现有库及其所有者，在事务中创建六个 SQL 角色，撤销本库 PUBLIC CONNECT/TEMP 和 public Schema 权限，再显式授权。遇到已有业务对象、同名角色或已有服务数据库配置即停止，不重置密码。初始化不是日常启动步骤，也不创建数据库或安装 PG。

Bootstrap 随机生成密码，保留服务 `.env` 的其他配置，以 `0600` 写入运行/迁移 URL；管理员 URL 不写入服务配置。数据库提交后如本地文件重命名失败，凭据保留在被忽略的 `.env.bootstrap-*` 文件中，人工核对后恢复。不要重新初始化已完成的库。

运行角色仅有自身 Schema USAGE、业务表 SELECT/INSERT/UPDATE/DELETE、序列 USAGE/SELECT；不能 DDL、跨 Schema 访问或修改迁移历史。迁移角色拥有自身 Schema 和数据库 CREATE，但无 CREATEDB/CREATEROLE；迁移凭据只用于部署命令。以后业务表由对应迁移账号创建，默认权限自动授权。跨服务通过 API 协作，不跨 Schema 联表或加外键。

| 配置 | 默认值 / 约束 |
| --- | --- |
| DATABASE_URL | HTTP 运行必填，本服务 app 账号 |
| DATABASE_MIGRATION_URL | 显式迁移必填，本服务 migrator 账号；不要求 HTTP 配置 |
| DATABASE_SSL_MODE | 本机开发默认 disable；Neon 用 verify-full；生产必须显式设置 |
| DATABASE_SSL_CA_FILE | 可选绝对路径，默认系统信任链 |
| DATABASE_POOL_MAX | 5，范围 1–20 |
| DATABASE_CONNECT_TIMEOUT_MS | 2000，建连和池获取上限 |
| DATABASE_STATEMENT_TIMEOUT_MS | 3000，服务端语句上限 |
| DATABASE_QUERY_TIMEOUT_MS | 4000，驱动等待上限，必须大于 statement |
| DATABASE_IDLE_TIMEOUT_MS | 30000，空闲连接回收 |

运行 connect + query 不超过 7000ms；默认单次查询预算约 6 秒。Neon 休眠唤醒若超时，服务会明确启动失败，可在数据库唤醒后重新启动。三个单实例服务最多 15 条运行连接，迁移另占连接。扩容按实例数重新核算。

Neon `-pooler` 为事务池，不能保证 session options/advisory lock；仅对 `.neon.tech` 域名自动转换为同端点直连，运行使用应用 Pool，迁移使用独占 Client。URL 只允许 `sslmode` 和 `channel_binding` 参数，解析后移除，避免驱动覆盖 TLS 配置。`sslmode=require` 提升为证书及主机校验；`channel_binding=prefer/require` 映射到 pg 的 `enableChannelBinding`（服务器提供时协商 SCRAM-SHA-256-PLUS，pg 8 不提供强制 require 模式）。不得将其理解为严格的 channel binding 强制校验。所有 TLS 连接保持 `rejectUnauthorized: true`。

每条连接通过启动参数设置 UTC、`pg_catalog,<业务 Schema>`、lock timeout 1 秒和 idle-in-transaction timeout 10 秒。迁移采用 statement 60 秒、lock 5 秒、query 65 秒；同服务使用 `(20260922, 服务编号)` session advisory lock，抢锁失败即退出。

```sh
pnpm build:database
pnpm --filter @my-sp-pr/pr-auth-api db:generate --name=add_business_table
pnpm --filter @my-sp-pr/pr-auth-api db:check
pnpm --filter @my-sp-pr/pr-auth-api db:migrate
```

chat/admin 替换包名。Kit 命令固定从仓库根执行；0.31 读取快照不兼容绝对 out，所以 out 使用根相对路径。`db:check` 只校验迁移元数据，不检查远端漂移。自定义 SQL 用 `db:generate --custom --name=...` 创建容器；journal/snapshot 由 Kit 生成。已执行迁移不可修改，新增迁移修复；不使用 push、自动 reset/down 或启动时迁移。根串行迁移不是跨服务事务。Drizzle 在事务内应用待执行 SQL/记录，首次创建迁移历史结构可能在事务外。

服务首次真实探测检查 PG18、数据库名、运行角色和 Schema 权限；pr-auth 还检查身份配置及七张身份表的列/访问权限，失败不监听 HTTP。运行中数据库失败保留进程，内部 ready 返回 503 `DATABASE_NOT_READY`，恢复后下一次检查返回 200。原 health 仅检查存活，数据库失败时仍可 200；Gateway 对 ready 始终 404，前端无 readiness SDK。ready 不读取迁移历史，完整迁移仍须显式执行。

退出时先停止 HTTP 并等待在途请求，再关闭 Pool，10 秒超时强制退出；PM2 `kill_timeout` 为 12 秒。SIGINT/SIGTERM、重复信号、启动中信号及端口冲突均走清理流程。

先执行 `pnpm build`，再显式运行 `pnpm verify:database`；验证使用构建后的 HTTP 服务、`DATABASE_VERIFY_ADMIN_URL` 和三个服务 `.env`，管理员另需 CREATEDB。验证脚本仅在本轮 `my_sp_pr_verify_*` 临时库内进行迁移、Drizzle 读写、权限与故障验证，最终关闭自己启动的进程并删除临时库。不会清理项目数据库；构建和类型检查不自动连接数据库。PG 主版本拒绝分支使用模拟 PG17 身份行，其余数据库操作使用真实 PG18。

可选设置 `DATABASE_VERIFY_AUTH_DEPLOY_DIR`、`DATABASE_VERIFY_GATEWAY_DEPLOY_DIR` 为已生成部署包的绝对路径；同一轮还会在临时库验证独立产物的生产迁移、HTTP 启动与 Gateway 转发。验证凭据仅通过本地环境提供，不写进命令历史或文档。

## Gateway 行为

Gateway `/api/health` 只表示网关自身可响应。停止某个下游时，该服务接口返回 502，其他服务仍可响应；下游恢复后无需重启 Gateway。

- 只按契约的公开 method/完整路径转发；不做路径重写，保留 query、编码、请求体、下游状态、响应头与响应体。GET 可接受标准 HEAD 请求，其他未声明方法或路径返回统一 404。
- 代理前不全局读取 JSON，不缓冲整段响应，不自动重试或跟随重定向。下游负责 JSON 100kb 限制。
- 普通请求默认总代理期限 8 秒，同时设置代理空闲超时；SSO portal 与 Admin OIDC 回调默认 20 秒，以容纳服务端 token 交换和会话持久化。前端超时 10 秒。失败由用户点击重试，不无限重试。
- 连接/DNS/上游断开返回 502；总代理期限到达返回 504。客户端断连时取消上游。已开始的响应发生故障时关闭连接，不追加 JSON。
- 网关覆盖外部 `X-Request-Id`，生成 UUID 并传递给下游；响应暴露该头。下游复用合法 UUID，直连时可生成本地 ID。
- 清除外部 `X-User-Id`、`X-Roles`、`X-Permissions`、Forwarded 和 X-Forwarded-*。Gateway 不产生登录身份；向 pr-auth 重建固定 issuer 的 Host/proto 和可信 IP。访问日志不记录凭证或 query。
- 仅 Gateway 管理 CORS；下游默认绑定 `127.0.0.1`。跨容器部署可设置 `HOST=0.0.0.0`，同时通过私网与防火墙控制访问。CORS 不替代身份鉴权或网络隔离。

健康响应示例：

```json
{"success":true,"data":{"status":"ok","service":"pr-chat","timestamp":"2026-09-21T00:00:00.000Z","uptime":123}}
```

错误格式为 `{"success":false,"error":{"code":"NOT_FOUND","message":"接口不存在"}}`。约定：非法 JSON 400、跨域拒绝 403、未知接口 404、超过 100kb 为 413、服务错误 500、上游不可用 502 `UPSTREAM_UNAVAILABLE`、超时 504 `UPSTREAM_TIMEOUT`。

## 环境变量

Chat 的 `VITE_API_BASE_URL` 默认 `/api`，生产可指向 Gateway；此值进入静态资源，不能存放密钥。Admin 和 SSO 使用 HttpOnly Cookie，API 必须保持同源 `/api`，各站点生产入口都需反代 Gateway，不能改成跨域 Cookie API。

后端使用 Node 24 原生 `.env` 加载，路径与当前 shell 目录无关，进程环境变量优先。

| 变量 | Gateway 默认值 | 下游默认值 |
| --- | --- | --- |
| NODE_ENV | development | development |
| HOST | 0.0.0.0 | 127.0.0.1 |
| PORT | 3000 | chat 3001 / auth 3002 / admin 3003 |
| CHAT_SERVICE_URL | http://127.0.0.1:3001 | 不使用 |
| AUTH_SERVICE_URL | http://127.0.0.1:3002 | 不使用 |
| ADMIN_SERVICE_URL | http://127.0.0.1:3003 | 不使用 |
| UPSTREAM_TIMEOUT_MS | 8000（1–9999） | 不使用 |
| AUTH_FLOW_TIMEOUT_MS | 20000（10000–60000，且大于普通上游期限） | 不使用 |
| CORS_ORIGINS | http://localhost:5173,http://localhost:5174,http://localhost:5175 | 不使用 |
| SSO_PUBLIC_ORIGIN | http://localhost:5175 | pr-auth 同值；生产必须 HTTPS |
| TRUSTED_PROXY_CIDRS | 空，不信任外部代理头 | 不使用 |
| AUTH_TRUSTED_GATEWAY_CIDRS | 不使用 | pr-auth 默认 loopback |
| AUTH_CONFIG_FILE | 不使用 | pr-auth 默认 .deploy/auth.json，0600 |

Gateway 在生产环境必须显式设置三个上游、CORS 白名单和 SSO_PUBLIC_ORIGIN。Origin 不含凭据、路径、query、hash 或末尾斜杠。上游不得指向已知的网关自身地址；部署时也需排除 DNS 别名或负载均衡导致的自环。

Admin 的 OIDC 与 GitHub 配置见 `backend/pr-admin/.env.example`。`ADMIN_TOKEN_ENCRYPTION_KEYS` 是 JSON key ring，key 和 `ADMIN_CSRF_HMAC_KEY` 都是 32 字节 base64url；`ADMIN_OIDC_CLIENT_SECRET` 必须与 auth.json 中的 `pr-admin` 客户端一致。GitHub App 私钥使用目标机 `0600` 文件路径，不把 PEM 放入数据库或前端变量。

修改下游端口时只同步 Gateway 的对应 `*_SERVICE_URL`。SSO 开发固定使用 localhost，与 issuer 完全一致。discovery/JWKS 可无凭证跨域 GET；授权/退出允许顶层导航，token/UserInfo/introspection/revoke 只由后端调用；SSO JSON 写操作严格检查同源和 CSRF。不全局启用跨域 Cookie。

## 构建与独立部署

```sh
VITE_API_BASE_URL=https://api.example.com/api pnpm build
```

分别部署三个 `frontend/<项目>/dist/`，静态托管设置 SPA 回退，例如 Nginx `try_files $uri $uri/ /index.html;`。API 地址必须在构建前设置。也可保持 `/api`，由各前端站点反向代理到同一个 Gateway。

完整 workspace 可分别运行后端，或使用 `pnpm start:backend` 做本地整体运行。独立部署不能仅复制服务 dist，需包含契约包、数据库包、`drizzle/` SQL/meta 及生产依赖：

```sh
pnpm build
pnpm --filter @my-sp-pr/pr-chat-api deploy --prod --legacy .deploy/pr-chat
pnpm --filter @my-sp-pr/gateway deploy --prod --legacy .deploy/gateway

# 注入本服务 DATABASE_MIGRATION_URL 和 DATABASE_SSL_MODE 后显式迁移
NODE_ENV=production node .deploy/pr-chat/dist/db/migrate.js
# HTTP 进程仅注入 DATABASE_URL、DATABASE_SSL_MODE；不用管理员/迁移凭据
NODE_ENV=production node .deploy/pr-chat/dist/server.js
NODE_ENV=production \
  CHAT_SERVICE_URL=http://127.0.0.1:3001 \
  AUTH_SERVICE_URL=http://127.0.0.1:3002 \
  ADMIN_SERVICE_URL=http://127.0.0.1:3003 \
  SSO_PUBLIC_ORIGIN=https://sso.example.com \
  CORS_ORIGINS=https://chat.example.com,https://admin.example.com,https://sso.example.com \
  node .deploy/gateway/dist/server.js
```

Gateway 的 HTTPS 入口可由部署平台或反向代理提供；不托管前端资源。下游不暴露公网端口。可在负载均衡后运行多个无会话状态的 Gateway 实例。

SSO 本地日常联调使用 `pnpm dev` 的 localhost:5175；生产模式必须提供 HTTPS 入口。`vite preview` 仅用于本地静态资源验证，直接改变预览端口不能代替 issuer/同源反代配置。

## Admin 发布平台

`deploy.manifest.json` 登记 3 个前端和 4 个后端 unit。Admin 只接受两个固定 preset，不保存任意 shell 命令：

- `pnpm-vite-static-v1`：生成 API、目标类型检查和 Vite build。
- `pnpm-node-service-v1`：生成 API、按需构建 database、目标类型检查/build，再用 `pnpm deploy --prod --legacy` 生成独立生产包。

发布链路为 Admin → GitHub Deployment → GitHub-hosted runner 构建 → Linux self-hosted runner 安装。Admin 在创建 deployment 前把 branch/tag/SHA 解析为不可变 commit SHA；production 环境仍需配置允许的主分支或版本 tag。每项目一条永久分支不是推荐模式，共享 contracts/database/Gateway 会产生长期漂移；使用主干开发、临时功能分支发 staging、版本 tag 发 production 更可控。

每个“项目 + 环境”使用独立 GitHub Environment。manifest 中 `build` 非敏感变量可进入制品构建；`runtime` 变量/secret 只注入目标 runner；`migration` secret 只进入迁移子进程，不写入长期 `runtime.env`。Admin 读取普通变量值与 secret 名称来判断完整性，永不读取 secret value。`VITE_*` 会进入浏览器资源，不能保存密钥。

目标 runner 只支持 `staging`、`production` 两个受控 label，必须是专用 Linux/x64 用户且不能运行 PR/fork 构建。它不 checkout 应用源码、不安装依赖、不执行构建；安装工具从当前 workflow commit 读取，应用制品使用 tar 保留 pnpm 内部链接并逐项校验 SHA256。默认目录：

```text
/srv/my-sp-pr/<unit>/<environment>/
  releases/<sha>-<deployment-id>/
  current -> releases/<...>/
  previous -> releases/<...>/
/etc/my-sp-pr/<unit>/<environment>/runtime.env
```

Nginx 的前端 root 指向对应 `current`，后端由 `deploy/pm2/ecosystem.config.cjs` 按 unit 单独 reload。健康失败恢复上一版应用；已成功数据库迁移不自动回滚。保留最近 5 个成功制品，当前/上一版不会清理。

首次启用：

1. 在 GitHub 创建 App，授予目标仓库 Contents 读取、Deployments 读写、Environments 读取，并把 webhook 指向 `/api/admin/deploy/github/events`。
2. 在 pr-admin 配置 App ID、installation ID、私钥路径、webhook secret、仓库和 owner/runner 白名单。
3. 为每个 unit/environment 创建 GitHub Environment，按 manifest 配置 variables/secrets；基础设施变量 `DEPLOY_ROOT`、`DEPLOY_CONFIG_ROOT` 可覆盖默认目录。
4. 在目标机安装 Node.js 24、PM2、`flock`、Nginx 和带 `staging`/`production` 标签的专用 self-hosted runner，授权其对应 `/srv`、`/etc` 目录。
5. 执行 auth `0003`、admin `0002` 迁移，提升至少一个已有账号为 `super`，部署 Auth、Gateway、Admin API/Web 后从 Admin 同步 manifest。

```sh
pnpm deploy:validate
pnpm --filter @my-sp-pr/pr-auth-api auth:set-role owner super
```

GitHub Environments、域名/TLS、数据库角色和目标目录仍需一次性人工准备。未来仓库导入可复用 manifest/preset，但不会自动创建本系统 API 契约、Gateway 上游、数据库 namespace 或域名。

## SSO 配置、数据与权限

身份服务使用 Authorization Code + PKCE S256，内置机密客户端 `pr-sso-portal` 支持直接打开 SSO。浏览器只持有 HttpOnly Cookie，不接收 client secret 或 OIDC token。SSO Origin 就是 issuer；登录页不能接受任意 returnUrl。

中央登录最长 7 天、连续 24 小时无有效认证活动过期。退出撤销当前浏览器会话及关联授权，其他设备保留；重置密码、禁用和角色变化会撤销该用户全部设备。ID Token 5 分钟，仅用于登录验证；Access Token 为 5 分钟不透明值，当前用于 UserInfo。登记的测试/未来客户端可启用轮换刷新令牌，期限受中央会话约束。

权限固定为 `user`（默认）、`admin` 和 `super`，静态客户端通过 `allowedRoles` 控制准入，`roles` scope 返回角色。Admin 的机密 OIDC 客户端允许 `admin/super`，每次发布 API 都在线调用 UserInfo；SSO 不可用时 fail closed。只有 `super` 可访问发布 API，最后一个有效 super 不能降级或禁用。角色 scope 不代替未来聊天业务权限，管理员也不自动获得他人私人数据。当前没有 back-channel logout，不会清除其他域的 Cookie。

auth 的 `0002_sso_identity` 增量迁移创建七张表：users、auth_sessions、oidc_artifacts、browser_transactions、portal_sessions、login_rate_limits、auth_audit_logs。用户名规范化后唯一；密码为带随机盐的 scrypt 摘要。协议 payload 使用独立 AES-GCM key ring 加密，token 索引保存摘要。一次性消费、撤销和账号变更使用数据库事务锁，适合小规模部署；扩容前应压测这一串行写入点。每实例最多两个并行 KDF，约需 256 MiB 以上额外内存预算。

`auth:keys` 默认在 `backend/pr-auth/.deploy/auth.json` 生成受保护 JSON。非默认路径请通过进程环境变量 `AUTH_CONFIG_FILE` 传给该命令（密钥命令不读取服务 .env），服务启动时使用相同路径。文件包含独立 cookieKeys、encryptionKeys（id/key）、hmacKey、RS256 私有 jwks、portalSecret 和 clients；多实例配置一致，不能在每次启动时重新生成。

默认 clients 为空，仅内置 portal。启用 Admin 前在 auth.json 的 clients 中登记 `pr-admin`：secret 与 Admin 环境一致，redirect URI 为 `<ADMIN_PUBLIC_ORIGIN>/api/admin/auth/callback`，post-logout URI 为 `<ADMIN_PUBLIC_ORIGIN>/?signed_out=1`，`allowedRoles` 为 `["super","admin"]`，scopes 为 `["openid","profile","roles"]`，`refreshToken` 为 true。URI 精确匹配，生产全部 HTTPS，无通配符；不要将客户端 secret 或私钥提交到 Git。关闭动态注册、隐式授权、密码 grant、离线授权及未使用扩展。

```sh
# 已有数据库只执行增量迁移，不重复 db:bootstrap
pnpm --filter @my-sp-pr/pr-auth-api db:migrate
pnpm --filter @my-sp-pr/pr-auth-api auth:keys
pnpm --filter @my-sp-pr/pr-auth-api auth:bootstrap owner
pnpm --filter @my-sp-pr/pr-auth-api auth:set-role owner super
pnpm --filter @my-sp-pr/pr-auth-api auth:reset-password owner
pnpm --filter @my-sp-pr/pr-auth-api auth:cleanup
```

bootstrap/reset 使用 auth app 账号及隐藏密码输入，也可由受保护标准输入提供；不能把密码放命令参数。空库 bootstrap 创建 `super`；已有 admin 不自动提升。`auth:set-role` 会递增 auth_version 并撤销该账号全部会话。最后一个有效 super 不能降权/禁用。cleanup 需显式调度，按表每批最多 500 行、最多 100 批，过期状态额外保留 7 天 tombstone、审计保留 90 天；不在启动或健康检查中清理。独立产物对应 `node dist/scripts/<generate-keys|bootstrap-auth|set-role|reset-password|cleanup-auth>.js`。

Cookie/加密轮换时新 key 放前，旧 key 保留至全部 7 天状态过期并清理；HMAC key 暂不支持平滑轮换，修改会使旧 CSRF/审计关联失效，应作为计划内操作。当前配置接受完整 RSA 私钥 JWK；JWK 轮换先将新 key 加到末尾并发布，待客户端缓存刷新后移到首位签名，至少等待 token/缓存期限后移除旧 key。私钥仍只在服务端，JWKS 端点只返回公钥。登录页采用 no-referrer；退出确认页采用 same-origin，使原生表单 POST 保留 Origin 供严格同源校验，引用信息仍不发往其他站点。

生产推荐登录站点 `https://sso.example.com`。Cookie 为 Secure、HttpOnly、SameSite=Lax、无 Domain（根路径使用 __Host-），无需共享父域 Cookie。Gateway 只信任真实入口 CIDR，入口必须覆盖外来 X-Forwarded-For；pr-auth 只信任 Gateway CIDR。Nginx 示例（证书路径及 root 按部署设置）：

```nginx
server {
    listen 443 ssl;
    server_name sso.example.com;
    ssl_certificate /etc/nginx/tls/fullchain.pem;
    ssl_certificate_key /etc/nginx/tls/privkey.pem;
    root /srv/pr-sso/dist;
    add_header Referrer-Policy no-referrer always;
    add_header X-Frame-Options DENY always;
    add_header Content-Security-Policy "frame-ancestors 'none'" always;
    location ~ ^/(api/|\.well-known/(openid-configuration|oauth-authorization-server)$) {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
    }
    location / {
        add_header Cache-Control no-store;
        add_header Referrer-Policy no-referrer;
        add_header X-Frame-Options DENY;
        add_header Content-Security-Policy "frame-ancestors 'none'";
        try_files $uri $uri/ /index.html;
    }
}
```

同机配置 Gateway `TRUSTED_PROXY_CIDRS=loopback`，两端 `SSO_PUBLIC_ORIGIN=https://sso.example.com`。pr-auth 的 portal 兑换需要服务端能访问这个固定 issuer 的 token/UserInfo/JWKS 路径，请保证 DNS、TLS 和入口回环可达。

SSO 验证：`pnpm verify:auth` 需要显式 DATABASE_VERIFY_ADMIN_URL，默认读取 pr-auth/.env 中运行/迁移连接，可用 DATABASE_VERIFY_AUTH_URL、DATABASE_VERIFY_AUTH_MIGRATION_URL、DATABASE_VERIFY_SSL_MODE 指向独立测试集群。Admin 验证使用 `pnpm verify:admin`，默认读取 pr-admin/.env，可用 `DATABASE_VERIFY_ADMIN_RUNTIME_URL` 和 `DATABASE_VERIFY_ADMIN_MIGRATION_URL` 覆盖；它验证一次性登录 flow、refresh/角色撤销、super 授权、manifest 同步、SHA 固定、并发锁及 webhook 验签/重放。脚本只操作新建临时库并最终清理。`verify:database` 另覆盖三服务数据库故障/恢复。

跨主域接入通过顶层导航到固定 issuer，未来应用各自保存本域会话；仍需在真实 HTTPS 不同站点部署后验收。聊天长连接的 SSE/WebSocket、心跳和超时另行设计。
