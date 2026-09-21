# my-sp-pr

React 19 + Vite + Express 5 + Node.js 24 的 pnpm workspace。包含三个前端、四个后端和一个内部契约包，前端统一通过 Gateway 访问 API。

当前提供可运行骨架和真实健康检查；登录、账号、权限、聊天、管理业务尚未实现。

## 快速开始

使用 Node.js 24 和 pnpm 10.25.0（可通过 `corepack enable` 启用）。

```sh
pnpm install
pnpm dev
```

默认不需要 `.env`。如需覆盖配置，将对应应用的 `.env.example` 复制为同目录 `.env`。根开发命令先生成接口，然后启动七个应用及一个契约监听器；`Ctrl+C` 关闭全部子进程。

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

打开 http://localhost:5173、http://localhost:5174、http://localhost:5175。前端 `/api` 由 Vite 原样代理到 `http://127.0.0.1:3000`，再由 Gateway 转发到对应下游。前端端口占用时直接报错。

## 目录

```text
frontend/
  pr-chat/                 # 客户端
  pr-admin/                # 管理平台
  pr-sso/                  # 登录系统骨架
backend/
  contracts/src/contract.ts # 唯一人工维护的接口契约
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

各前端保留页面、布局、`hooks/useHealth.ts`、`api/client.ts` 和 `api/generated/`。各后端保留 `routes`、`controllers`、`services`、`middlewares`、`config` 分层，以及自己的 `dist/`、`generated/openapi.json`。

## 命令

在根目录执行：

| 命令 | 行为 |
| --- | --- |
| `pnpm dev` | 生成接口，启动七个应用和一个监听器 |
| `pnpm dev:frontend` | 生成接口，启动三个前端和一个监听器 |
| `pnpm dev:backend` | 生成接口，启动四个后端和一个监听器 |
| `pnpm generate:api` | 离线编译契约包并生成四份 OpenAPI、三份 SDK |
| `pnpm watch:api` | 初次生成后监听统一契约 |
| `pnpm typecheck` | 先生成，再检查八个包与工具脚本 |
| `pnpm build` | 先生成、检查类型，再按依赖顺序构建 |
| `pnpm start:backend` | 并发运行四个已构建后端 |
| `pnpm preview:frontend` | 在 4173/4174/4175 预览前端构建 |
| `pnpm lint -- <文件路径…>` | 仅检查明确列出的变更文件 |

Lint 不接受目录、glob、空参数、`--fix`，不对生成目录执行 lint；保留已有 `console.log`。

```sh
pnpm lint -- backend/contracts/src/contract.ts frontend/pr-chat/src/hooks/useHealth.ts
```

单项目操作需先执行 `pnpm generate:api`。以下每条命令独立启动一个项目；编辑契约时另开一个终端执行 `pnpm watch:api`：

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
pnpm --filter @my-sp-pr/pr-chat-api... typecheck
pnpm --filter @my-sp-pr/pr-chat-api... build
```

## 接口开发

唯一接口来源是 **`backend/contracts/src/contract.ts`**。它只依赖 Zod，不依赖任何应用；四个后端通过 `workspace:*` 引用编译后的契约包，前端只使用生成 SDK。

1. 在 `serviceContracts` 对应服务下定义操作，包含全局唯一 `operationId`、`method`、相对 `path`、`exposure`、`clients`、请求 Schema 和响应 Schema。
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
- 监听器只监听集中契约；每轮独立进程避免模块缓存，失败后等待修复。四个后端显式监听编译后的契约 JS，成功发布后热重启。

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

完整 workspace 可分别运行后端，或使用 `pnpm start:backend` 做本地整体运行。独立部署不能仅复制服务 dist，需包含契约包及生产依赖：

```sh
pnpm build
pnpm --filter @my-sp-pr/pr-chat-api deploy --prod --legacy .deploy/pr-chat
pnpm --filter @my-sp-pr/gateway deploy --prod --legacy .deploy/gateway

# 可将各打包目录复制到独立环境，用 Node 24 运行
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
