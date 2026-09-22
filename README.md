# my-sp-pr

React 19 + Vite + Express 5 + Node.js 24 的 pnpm workspace。包含三个前端、四个后端、契约包和数据库包，前端统一通过 Gateway 访问 API。

当前提供可运行骨架、真实健康检查及 PostgreSQL 18 + Drizzle 基础设施；登录、账号、权限、聊天、管理业务和业务表尚未实现。

## 快速开始

使用 Node.js 24 和 pnpm 10.25.0（可通过 `corepack enable` 启用）。

```sh
pnpm install
pnpm db:bootstrap # 首次空库初始化；先按下方说明配置管理员 URL
pnpm db:migrate
pnpm dev
```

三个业务后端必须配置各自 `.env` 并完成数据库迁移；已初始化的数据库跳过 bootstrap。根开发命令先生成接口、编译数据库包，再启动七个应用、契约监听和数据库包编译监听；`Ctrl+C` 关闭全部子进程。前端与 Gateway 可独立启动。

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
  pr-sso/                  # 登录系统骨架
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
```

各前端保留页面、布局、`hooks/useHealth.ts`、`api/client.ts` 和 `api/generated/`。各后端保留 `routes`、`controllers`、`services`、`middlewares`、`config` 分层，以及自己的 `dist/`、`generated/openapi.json`。三个业务服务独立维护 `src/db/schema/`、`drizzle.config.ts` 和版本管理中的 `drizzle/` 迁移。

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
- `clients` 只筛选 SDK 消费者，不构成权限控制。当前每份 SDK 包含 Gateway 健康操作和对应下游健康操作。
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

服务首次真实探测检查 PG18、数据库名、运行角色和 Schema 权限；失败不监听 HTTP。运行中失败保留进程，内部 `/api/auth/ready`、`/api/chat/ready`、`/api/admin/ready` 返回 503 `DATABASE_NOT_READY`，恢复后下一次检查返回 200。响应 `Cache-Control: no-store`。原 health 仅检查存活，数据库失败时仍可 200；Gateway 对 ready 始终 404，前端无 readiness SDK。readiness 不代替迁移版本检查。

退出时先停止 HTTP 并等待在途请求，再关闭 Pool，10 秒超时强制退出；PM2 `kill_timeout` 为 12 秒。SIGINT/SIGTERM、重复信号、启动中信号及端口冲突均走清理流程。

先执行 `pnpm build`，再显式运行 `pnpm verify:database`；验证使用构建后的 HTTP 服务、`DATABASE_VERIFY_ADMIN_URL` 和三个服务 `.env`，管理员另需 CREATEDB。验证脚本仅在本轮 `my_sp_pr_verify_*` 临时库内进行迁移、Drizzle 读写、权限与故障验证，最终关闭自己启动的进程并删除临时库。不会清理项目数据库；构建和类型检查不自动连接数据库。PG 主版本拒绝分支使用模拟 PG17 身份行，其余数据库操作使用真实 PG18。

可选设置 `DATABASE_VERIFY_AUTH_DEPLOY_DIR`、`DATABASE_VERIFY_GATEWAY_DEPLOY_DIR` 为已生成部署包的绝对路径；同一轮还会在临时库验证独立产物的生产迁移、HTTP 启动与 Gateway 转发。验证凭据仅通过本地环境提供，不写进命令历史或文档。

## Gateway 行为

Gateway `/api/health` 只表示网关自身可响应。停止某个下游时，该服务接口返回 502，其他服务仍可响应；下游恢复后无需重启 Gateway。

- 只按契约的公开 method/完整路径转发；不做路径重写，保留 query、编码、请求体、下游状态、响应头与响应体。GET 可接受标准 HEAD 请求，其他未声明方法或路径返回统一 404。
- 代理前不全局读取 JSON，不缓冲整段响应，不自动重试或跟随重定向。下游负责 JSON 100kb 限制。
- 普通请求默认总代理期限 8 秒，同时设置代理空闲超时；前端超时 10 秒。失败由用户点击重试，不无限重试。
- 连接/DNS/上游断开返回 502；总代理期限到达返回 504。客户端断连时取消上游。已开始的响应发生故障时关闭连接，不追加 JSON。
- 网关覆盖外部 `X-Request-Id`，生成 UUID 并传递给下游；响应暴露该头。下游复用合法 UUID，直连时可生成本地 ID。
- 清除外部 `X-User-Id`、`X-Roles`、`X-Permissions`。当前不产生登录身份。访问日志仅含请求 ID、服务、方法、无 query 路径、状态、耗时和错误类别。
- 仅 Gateway 管理 CORS；下游默认绑定 `127.0.0.1`。跨容器部署可设置 `HOST=0.0.0.0`，同时通过私网与防火墙控制访问。CORS 不替代身份鉴权或网络隔离。

健康响应示例：

```json
{"success":true,"data":{"status":"ok","service":"pr-chat","timestamp":"2026-09-21T00:00:00.000Z","uptime":123}}
```

错误格式为 `{"success":false,"error":{"code":"NOT_FOUND","message":"接口不存在"}}`。约定：非法 JSON 400、跨域拒绝 403、未知接口 404、超过 100kb 为 413、服务错误 500、上游不可用 502 `UPSTREAM_UNAVAILABLE`、超时 504 `UPSTREAM_TIMEOUT`。

## 环境变量

前端各自读取应用目录 `.env`。`VITE_API_BASE_URL` 默认 `/api`，生产可统一设置为 `https://api.example.com/api`；此值在构建时写入静态资源，不能存放密钥。

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
| CORS_ORIGINS | http://localhost:5173,http://localhost:5174,http://localhost:5175 | 不使用 |

Gateway 在生产环境必须显式设置三个上游和 CORS 白名单。Origin 仅接受 HTTP/HTTPS，不含凭据、路径、query、hash 或末尾斜杠。上游不得指向已知的网关自身地址；部署时也需排除 DNS 别名或负载均衡导致的自环。

修改下游端口时只同步 Gateway 的对应 `*_SERVICE_URL`，前端无需感知。使用 `127.0.0.1` 访问前端时，将对应 Origin 加入 Gateway 白名单。无 Origin 请求允许访问，支持 OPTIONS 预检，当前不启用 Cookie 跨域凭据。

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
  CORS_ORIGINS=https://chat.example.com,https://admin.example.com,https://sso.example.com \
  node .deploy/gateway/dist/server.js
```

Gateway 的 HTTPS 入口可由部署平台或反向代理提供；不托管前端资源。下游不暴露公网端口。可在负载均衡后运行多个无会话状态的 Gateway 实例。

本地生产联调（先停止开发服务释放端口）：

```sh
VITE_API_BASE_URL=http://localhost:3000/api pnpm build

# 终端一
NODE_ENV=production \
  CHAT_SERVICE_URL=http://127.0.0.1:3001 \
  AUTH_SERVICE_URL=http://127.0.0.1:3002 \
  ADMIN_SERVICE_URL=http://127.0.0.1:3003 \
  CORS_ORIGINS=http://localhost:4173,http://localhost:4174,http://localhost:4175 \
  pnpm start:backend

# 终端二
pnpm preview:frontend
```

访问三个预览端口，浏览器请求统一到 3000。验收后执行 `pnpm build` 恢复默认构建（确保 `.env` 未覆盖 API 地址）。`vite preview` 仅用于本地验证。

后续登录阶段再确定 OIDC/OAuth2、会话和业务授权协议；聊天长连接接入时单独设计 SSE/WebSocket、心跳及路由超时策略。
