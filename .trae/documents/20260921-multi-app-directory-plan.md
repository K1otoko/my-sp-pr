# 多前端、多后端目录调整计划：Gateway 统一入口

## 1. 概要

将当前一个前端、一个后端的 pnpm workspace 调整为三个前端应用、四个后端服务，保留现有技术栈和接口自动生成能力。

沿用已明确的项目命名、骨架范围和集中契约选择。本修订根据“由 gateway 作为统一入口”的新要求，提出以下推荐实施方案：

- 本次交付 **7 个可运行项目骨架**。
- 前端项目：`pr-chat` 客户端、`pr-admin` 管理平台、`pr-sso` 登录系统。
- 后端项目：`pr-auth` 鉴权服务、`gateway` 网关服务、`pr-chat`、`pr-admin`。
- **所有后端共用一份人工维护的接口契约**。
- **gateway 作为三个前端的唯一 API 入口**，提供自身健康检查及到三个下游服务的实际 HTTP 转发。
- 登录、账号、令牌、权限、聊天与管理业务均留待后续实现。

成功标准：七个项目能独立启动，也能通过根命令一起启动；三个前端只经 gateway 显示各自后端的真实健康状态；同一契约同时驱动服务路由、网关公开路由和前端 SDK；跨域、代理错误、超时及取消行为一致；指定文件 lint、类型检查、构建及独立运行验证通过。

本轮只完善方案文档，尚未迁移应用或安装网关依赖。

## 2. 当前状态分析

已读取当前工作区配置、生成及监听脚本、两端配置、前端页面、后端路由与契约、README，并检查目录。

- 当前应用根分别为 `frontend/` 和 `backend/`，包名为 `@my-sp-pr/frontend`、`@my-sp-pr/backend`。
- 前端已有 React 19、Vite、Tailwind CSS、ahooks，提供首页、关于页、404，以及可刷新健康状态。
- 后端已有 Express 5、Node 24、TypeScript、Zod，提供 `GET /api/health`、配置校验、CORS、统一错误和退出处理。
- 当前接口唯一来源是 `backend/src/api/contract.ts`。
- `scripts/generate-api.ts` 写死一份契约、一个 OpenAPI 输出和一个前端 SDK 输出。
- `scripts/watch-api.ts` 监听旧契约路径，防抖、串行执行生成子进程。
- `eslint.config.mjs` 的前端规则和生成目录忽略项包含旧目录层级；`scripts/lint-files.mjs` 的提示包含旧示例路径。
- 前后端 tsconfig 均从 `../tsconfig.base.json` 继承，迁入子项目后要增加一级。
- 当前默认端口为前端 `5173`、后端 `3001`、前端预览 `4173`。
- 两端均存在安装和构建产物；当前只有 `.env.example`，没有实际 `.env`。
- 当前未初始化 Git，未发现项目或祖先目录的 `AGENTS.md`。不新增 Git 初始化或提交操作。
- 已确认当前 tsx 支持 `watch --include`；pnpm 10.25.0 支持 `deploy --prod --legacy`。
- 本轮读取 npm 元数据和官方包 README，确认 `http-proxy-middleware@4.2.0` 支持 Node 24、Express、路径过滤、代理事件及流式转发；计划仅给 gateway 增加该运行依赖。

下面的新路径均是本次计划新增或迁移目标，不代表它们已经存在。计划阶段仅写入本文档。

## 3. 假设与决策

### 3.1 目标目录

```text
frontend/
  pr-chat/                 # 现有前端迁入，客户端骨架
  pr-admin/                # 管理平台骨架
  pr-sso/                  # 登录系统骨架
backend/
  contracts/               # 不监听端口的内部共享包
    src/contract.ts        # 所有服务唯一人工维护的接口定义
    dist/                  # 生成的 JS、声明文件
  pr-auth/                 # 鉴权服务骨架
  gateway/                 # 统一 API 入口、健康检查、HTTP 转发
  pr-chat/                 # 现有后端迁入
  pr-admin/                # 管理后端骨架
scripts/
  api-projects.ts          # 服务与生成输出的路径映射
  generate-api.ts
  watch-api.ts
  lint-files.mjs
```

`frontend` / `backend` 成为分类目录，不再直接包含应用级 `package.json`、`src` 和构建输出。`backend/contracts` 是供四个后端依赖的共享库，不是第八个运行服务。它解决跨项目直接导入 TypeScript 源文件时的编译边界和 Node 生产运行问题，不承担业务逻辑。

### 3.2 包名、端口与请求对应

前后端有同名目录，npm 包名加 `web` / `api` 后缀避免冲突：

| 项目路径 | 包名 | 开发/服务端口 | 前端预览 | API 入口/职责 |
| --- | --- | --- | --- | --- |
| `frontend/pr-chat` | `@my-sp-pr/pr-chat-web` | 5173 | 4173 | gateway `/api/chat/*` |
| `frontend/pr-admin` | `@my-sp-pr/pr-admin-web` | 5174 | 4174 | gateway `/api/admin/*` |
| `frontend/pr-sso` | `@my-sp-pr/pr-sso-web` | 5175 | 4175 | gateway `/api/auth/*` |
| `backend/gateway` | `@my-sp-pr/gateway` | 3000 | — | 对外 API 入口 |
| `backend/pr-chat` | `@my-sp-pr/pr-chat-api` | 3001 | — | 内部客户端业务服务 |
| `backend/pr-auth` | `@my-sp-pr/pr-auth-api` | 3002 | — | 内部身份服务 |
| `backend/pr-admin` | `@my-sp-pr/pr-admin-api` | 3003 | — | 内部管理业务服务 |
| `backend/contracts` | `@my-sp-pr/contracts` | 不启动服务 | — | — |

三个前端开发时统一使用 `VITE_API_BASE_URL=/api`，Vite 将 `/api` 原样代理到 `http://127.0.0.1:3000`。SDK 自带 `/chat`、`/admin`、`/auth` 路径，前端手写代码不拼接服务路径。

| 经 gateway 请求 | 下游目标 | 下游收到的完整路径 | 生成函数 |
| --- | --- | --- | --- |
| `/api/health` | gateway 本身 | `/api/health` | `getGatewayHealth` |
| `/api/chat/health` | `pr-chat:3001` | `/api/chat/health` | `getChatHealth` |
| `/api/admin/health` | `pr-admin:3003` | `/api/admin/health` | `getAdminHealth` |
| `/api/auth/health` | `pr-auth:3002` | `/api/auth/health` | `getAuthHealth` |

- 网关与下游使用同一完整路径，**不做 pathRewrite**。以 `/api` 为公共根，服务命名空间分别为 `/chat`、`/admin`、`/auth`，gateway 自身命名空间为空。
- gateway 只转发契约中标记为公开的接口，不能将任意匹配服务前缀的未知路径自动开放；未知路径返回统一 JSON 404。
- 健康响应 `data.service` 分别为 `pr-chat`、`pr-admin`、`pr-auth`、`gateway`；gateway 保留下游响应内容，不把它们改成自己的服务名。
- gateway `/api/health` 表示网关进程可响应，不表示所有下游都健康；单个下游故障不能让其他路由失效。
- 三个前端生产时仍各自构建、各自部署，但 `VITE_API_BASE_URL` 指向同一个网关地址，例如 `https://api.example.com/api`。也可由各前端站点的反向代理将同源 `/api` 交给 gateway。
- 仅 gateway 管理浏览器 CORS。开发允许 localhost 的 5173/5174/5175，生产显式配置三个实际前端 Origin。
- 下游服务默认绑定 `127.0.0.1`，不再配置浏览器 CORS；gateway 默认绑定 `0.0.0.0`。跨容器部署时下游可绑定 `0.0.0.0`，同时通过私网和防火墙限制入口。CORS 不承担阻止直接访问下游的职责。
- 调整下游端口时只同步 gateway 的上游地址配置；三个前端不感知下游端口或域名变化。

### 3.3 本次边界

- 保留 React 19 + Vite、Express 5 + Node 24、TypeScript、Tailwind CSS、ahooks、pnpm 及当前已安装版本。
- `pr-admin` 和 `pr-sso` 使用现有页面结构建立可运行骨架，文案区分用途，展示真实后端健康状态。
- `pr-sso` 明确展示登录系统骨架状态，不添加无法工作的登录表单或模拟登录成功。
- gateway 本次实现 HTTP 转发、公开路由约束、CORS、请求 ID、简洁访问日志、超时和代理错误响应。当前公开接口仅有健康检查，不添加未接入认证的受保护业务接口。
- 不引入数据库、认证协议、共享 UI 库、容器、CI、部署平台或新的测试框架。
- 已有 `console.log` 保留；只对本次实际修改、新增或迁移后修改的手写代码文件执行显式路径 lint。

### 3.4 五项建议及采纳方式

| 建议 | 本次方案 | 后续演进 |
| --- | --- | --- |
| 网关职责保持清晰 | gateway 处理接入和转发；聊天、管理、身份业务仍归对应服务 | 确有页面聚合需求时再考虑 BFF，不提前把业务堆入 gateway |
| 路径由统一契约驱动 | 同一文件声明服务命名空间、操作、公开性和前端消费者；生成网关路由与 SDK | 新增业务接口沿用同一流程 |
| 浏览器只依赖一个 API 地址 | 所有开发代理和生产 API 地址指向 gateway，跨域配置集中 | 生产流量可经负载均衡进入多个 gateway 实例 |
| 认证与业务授权分工 | 当前只提供公共健康接口，不伪造登录或身份信息 | pr-auth 管理身份与凭证，gateway 校验凭证，业务服务判断资源/操作权限 |
| 从骨架阶段保证转发可诊断 | 请求 ID、502/504、超时、取消传递，不自动重试写请求，保留流式传输 | 聊天接入 SSE/WebSocket 时单独定义连接、心跳和超时策略 |

后续登录阶段建议优先采用标准 OIDC/OAuth2 授权码 + PKCE 流程，避免把登录令牌放进跳转 URL。具体身份来源、会话存储和 Cookie/Token 方案需在登录任务中确定，本次不实现。

若后续使用 JWT，建议 pr-auth 签发凭证并提供公钥，gateway 缓存公钥完成签名、有效期和受众校验；需要即时吊销的会话另行设计。业务服务仍需验证可信身份并执行权限判断，不能直接信任浏览器传入的 `X-User-Id` 等自定义头。

## 4. 拟议变更

### 4.1 工作区和根配置

| 文件 | 调整 |
| --- | --- |
| `pnpm-workspace.yaml` | 工作区改为 `frontend/*`、`backend/*`；保留已有安装脚本白名单。 |
| `package.json` | 更新 dev/typecheck/build/start/preview 的工作区选择，覆盖七个应用及契约包依赖顺序。 |
| `pnpm-lock.yaml` | 重新安装后生成新 importer 和 `workspace:*` 依赖关系，移除旧 `frontend`、`backend` importer。 |
| `eslint.config.mjs` | 前端规则改为 `frontend/*/src/**`，Vite 配置改为 `frontend/*/vite.config.ts`，SDK 忽略范围改为 `frontend/*/src/api/generated/**`；保留其他规则。 |
| `scripts/lint-files.mjs` | 仅更新提示中的示例路径；保留拒绝目录、glob、空参数、选项及禁用 fix 的规则。 |
| `tsconfig.scripts.json` | 保持工具脚本严格检查；生成器直接导入共享契约源文件，由 TS 自动纳入检查，不为应用扩大 rootDir。 |
| `.gitignore` | 保留通用递归忽略；增加 `.deploy/` 用于本地部署打包产物。 |
| `README.md` | 重写目录、包名、端口、命令、契约开发、gateway 上游配置、环境文件和多项目独立部署说明。 |

根命令语义：

| 命令 | 行为 |
| --- | --- |
| `pnpm generate:api` | 编译契约包，生成 gateway 公开 OpenAPI、三份下游 OpenAPI、三份前端 SDK，无需运行服务。 |
| `pnpm watch:api` | 初次生成后监听统一契约。 |
| `pnpm dev` | 前置生成成功后，并发启动三个前端、四个后端和一个契约监听进程。 |
| `pnpm dev:frontend` | 前置生成成功后启动三个前端和一个契约监听进程。 |
| `pnpm dev:backend` | 前置生成成功后启动四个后端和一个契约监听进程。 |
| `pnpm typecheck` | 先生成，再检查共享契约、七个应用、生成 SDK 及工具脚本。 |
| `pnpm build` | 先生成和检查类型，再按依赖顺序构建全部包。 |
| `pnpm start:backend` | 并发启动四个已构建后端，不包含契约库；用于本地整体运行。 |
| `pnpm preview:frontend` | 在 4173/4174/4175 并发预览三个已构建前端。 |
| `pnpm lint -- <实际变更文件…>` | 行为保持，只检查显式传入的文件。 |

继续使用 concurrently 管理多进程退出，不引入新的进程管理库。根编排直接选择工作区原子 `dev` 命令，不能递归调用带前置生成的根 `dev:frontend` / `dev:backend`，避免重复生成或启动多个监听器。

单项目操作使用精确包名，例如 `pnpm --filter @my-sp-pr/pr-admin-web dev`。首次需执行 `pnpm generate:api`；编辑契约时另开一个 `pnpm watch:api`。单项目构建先执行生成，再对该包及其依赖进行类型检查和构建。README 给出七个项目的包名与命令示例，并说明单独联调一个前端时仍需启动 gateway 和对应下游。

### 4.2 集中契约共享包

新增：

- `backend/contracts/package.json`：包名 `@my-sp-pr/contracts`，私有 ESM 包，运行依赖 Zod；`exports` 和 `types` 指向 `dist/contract.js`、`dist/contract.d.ts`，`files` 只包括 `dist`。
- `backend/contracts/tsconfig.json`：继承 `../../tsconfig.base.json`，NodeNext、`rootDir: src`、`outDir: dist`，输出声明文件。禁用增量构建状态，支持生成器覆盖临时输出路径。
- `backend/contracts/src/contract.ts`：从原契约迁入所有 Zod Schema、推导类型、API 前缀和接口元数据，按服务分组为 `serviceContracts`。

契约形状：

- 复用公共 `API_PREFIX`、健康数据/成功响应 Schema、统一错误 Schema 与推导类型。
- `serviceContracts` 以 `pr-auth`、`gateway`、`pr-chat`、`pr-admin` 为键；每项包含 `service` 标识、`namespace`、文档标题和 `apiContract` 接口表。
- 每个服务当前只有一个健康操作，相对路径 `/health`、方法 get。`operationId` 分别为 `getAuthHealth`、`getGatewayHealth`、`getChatHealth`、`getAdminHealth`，在整个契约内唯一，以支持合并的网关文档。
- 每个操作包含 `exposure: 'public' | 'internal'` 和 `clients` 消费者列表。当前四个健康操作均公开；gateway 健康操作的消费者为全部三个前端，其余健康操作各归对应前端。消费者列表只控制生成范围，不构成权限校验。
- 从 `API_PREFIX + namespace + operation.path` 得到唯一完整路由；共享包导出路由拼接及 OpenAPI `{id}` 到 Express `:id` 的转换函数，服务路由和 gateway 共同复用。命名空间与路径不在其他文件人工重复声明。
- 增加公共代理错误码 `UPSTREAM_UNAVAILABLE`、`UPSTREAM_TIMEOUT`，以及共用的502/504响应定义。gateway 公开文档和前端 SDK 的所有操作加入 CORS 403，被代理操作再加入502/504；当前下游健康操作只声明自身的200/400/413/500，不声明已移至网关的 CORS 拒绝响应。
- 生成网关公开文档、前端 SDK 和注册网关路由时只选公开操作。内部操作仍可出现在对应服务文档中，不进入公开文档和前端 SDK。
- 服务端健康数据使用所选契约中的 `service` 标识，不在 service 实现中重复维护名称。
- 该文件只依赖 Zod，不导入环境变量、Express、监听程序或其他应用源码。

每个后端的 `src/api/index.ts` 从共享包选取本服务条目并重导出通用类型。gateway 的代理注册模块另外读取所有下游公开操作。服务本地不定义第二份 Schema、接口路径或响应结构；原有路由、控制器、中间件和错误类改为通过这些入口引用。

四个后端声明 `@my-sp-pr/contracts: workspace:*`。生产使用编译后的 JS 与声明文件，应用 tsconfig 的 rootDir 仍限制在自己的 `src`。前端不直接依赖共享契约包，只使用生成的 SDK。

### 4.3 接口生成和监听

新增 `scripts/api-projects.ts`：

- 定义文档输出和三个前端 SDK 的目录映射。
- 只维护文件系统路径；服务命名空间、公开性、消费者、method、path 和 Schema 均读取共享契约。

映射：

| 生成视图 | OpenAPI 输出 | SDK 输出 |
| --- | --- | --- |
| gateway 本身及所有公开下游操作 | `backend/gateway/generated/openapi.json` | 按 clients 分别筛选后生成下列三个 SDK |
| pr-chat 服务自身全部操作 | `backend/pr-chat/generated/openapi.json` | — |
| pr-admin 服务自身全部操作 | `backend/pr-admin/generated/openapi.json` | — |
| pr-auth 服务自身全部操作 | `backend/pr-auth/generated/openapi.json` | — |
| 公开接口的 pr-chat 消费者视图 | 内存中生成，无额外手写文档 | `frontend/pr-chat/src/api/generated/` |
| 公开接口的 pr-admin 消费者视图 | 内存中生成，无额外手写文档 | `frontend/pr-admin/src/api/generated/` |
| 公开接口的 pr-sso 消费者视图 | 内存中生成，无额外手写文档 | `frontend/pr-sso/src/api/generated/` |

修改 `scripts/generate-api.ts`：

1. 所有路径仍根据脚本位置解析。
2. 使用根 TypeScript 编译器，将共享契约包编译到 `.api-codegen-tmp/<本轮目录>/contracts/`；类型错误直接阻止后续发布。
3. 导入集中契约源文件，按上表生成四份 OpenAPI 3.0.3 文档。所有文档的 `servers` 均为 `/api`，paths 使用 `/chat/health`、`/admin/health`、`/auth/health`、`/health`，不含内网主机和端口，也不重复添加 `/api`。
4. 从公开操作中按 clients 筛选，使用现有 Hey API 版本与插件生成三个 SDK，分别读取对应前端 tsconfig；请求函数名称采用全局唯一 operationId。前端 baseUrl 保持 `/api`，完整命名空间已在生成函数内。
5. 全部编译和生成成功后，统一同步共享契约 `dist`、四份 OpenAPI 和三个 SDK。检查全局重复 operationId、method+完整路径冲突、非法/冲突命名空间、无效消费者、内部操作被误选以及输出冲突。
6. 保留未变内容不写入、清理生成目录内过时文件、失败保留上一轮产物的机制。目录清理仅限声明的输出目录，不能删除手写源文件。
7. 发布使用临时文件加 rename 替换变化文件，减少服务监听读取到半写入文件的可能；I/O 失败尝试恢复上一轮内容。
8. 生成结果按服务输出简洁日志，最终报告变化文件数量；保留现有日志能力。

修改 `scripts/watch-api.ts`：

- 只监听 `backend/contracts/src/contract.ts`，保留防抖、串行、变化合并及每次独立生成进程。
- 初次注册监听后生成；根开发命令前置生成后使用 `--skip-initial`。
- 契约类型错误或生成错误时，保留上次成功的运行契约和 SDK，打印失败并继续等待修复。
- 四个后端 `tsx watch` 的 `--include` 明确包含 `../../contracts/dist/contract.js`，确保共享契约成功更新后服务热重启；不依赖默认 node_modules 监听行为。
- Ctrl+C 同时结束文件监听、生成子进程和开发服务。

### 4.4 前端迁移和新增项目

将现有 `frontend` 中的手写应用文件迁至 `frontend/pr-chat`，保留原有能力。参照迁移后的结构建立 `frontend/pr-admin`、`frontend/pr-sso`。

三个项目均具有：

- `package.json`、`index.html`、`vite.config.ts`。
- `tsconfig.json`、`tsconfig.app.json`、`tsconfig.node.json`。
- `.env.example`，以及 `src/vite-env.d.ts`。
- `src/main.tsx`、`src/App.tsx`、`src/components/AppLayout.tsx`。
- `src/pages/HomePage.tsx`、`AboutPage.tsx`、`NotFoundPage.tsx`。
- `src/hooks/useHealth.ts`、`src/api/client.ts`、`src/api/generated/`。
- `src/styles/index.css`。

具体调整：

- 两个继承根配置的 tsconfig 改用 `../../tsconfig.base.json`；本项目内部引用保持相对。
- Vite 按端口表配置 server/preview strictPort，三个项目的 `/api` 代理统一指向 gateway 的3000端口。
- 三个项目分别显示“PR Chat · 客户端”“PR Admin · 管理平台”“PR SSO · 登录系统”，区分页面标题、导航品牌及骨架说明。
- 保留 `/`、`/about`、`*` 路由和真实请求的 loading/error/refresh 交互。
- 关于页更新当前项目路径、统一契约新路径及生成说明。
- ahooks、AbortController、10 秒超时与统一错误转换保持现有实现；三个 `useHealth.ts` 分别调用生成的 `getChatHealth`、`getAdminHealth`、`getAuthHealth`，并显式传入 `apiClient`。502/504统一显示可重试错误，不无限自动重试。
- 不引入图片，不增加业务表单、假数据或跨应用自动登录跳转。
- 原 SDK 由新生成流程重新产出，不手动修改。

### 4.5 后端迁移和公共结构

将现有 `backend` 应用代码迁至 `backend/pr-chat`；集中契约移至共享包，不在 pr-chat 内保留第二份定义。参照其分层结构建立 `pr-auth`、`gateway`、`pr-admin`。

四个服务均包含：

- `package.json`、`tsconfig.json`、`tsconfig.build.json`、`.env.example`。
- `src/app.ts`、`src/server.ts`、`src/config/env.ts`。
- `src/api/index.ts`，仅选取共享契约。
- `src/routes/index.ts`、`health.routes.ts`、`src/controllers/health.controller.ts`、`src/services/health.service.ts`。
- `src/middlewares/not-found.ts`、`error-handler.ts`、`src/utils/app-error.ts`。
- `generated/openapi.json` 和构建后的 `dist/`。

具体调整：

- tsconfig 根继承路径改为 `../../tsconfig.base.json`，保留 NodeNext、相对导入 `.js` 及各自独立 dist。
- 默认 PORT 按端口表设置；gateway 使用 CORS，三个下游移除 cors 依赖、中间件及 CORS_ORIGINS 必填校验。环境文件仍从各服务目录加载，深度不受外层分类目录影响。
- `server.ts` 保留既有日志和信号处理，日志标明服务名以区分并行启动。
- 三个下游分别增加 `src/middlewares/request-context.ts`，复用网关传入的合法 UUID 请求 ID；缺失或格式无效时生成本地 ID。请求完成日志与错误日志带该 ID，身份判断不使用这个追踪字段。
- 路由、响应校验、错误类型均复用集中契约，通过本地 `src/api/index.ts` 访问。
- 下游保持 JSON 100kb 限制、非法 JSON 400、未知接口404、超限413、输出校验失败500等语义；gateway 承担 CORS 拒绝403和生产白名单必填约束。
- 下游服务按自身命名空间注册路由。gateway 注册自身健康操作，以及共享契约内标记为公开的下游操作；代理细节见下一节。
- `package.json` 的 `files` 包含 dist 和生成 OpenAPI，便于打包生产运行内容；后端运行依赖包含共享契约库。

### 4.6 Gateway 实现细节

新增或定制文件：

| 文件 | 职责 |
| --- | --- |
| `backend/gateway/package.json` | 增加并精确固定 `http-proxy-middleware: 4.2.0`；其他服务不安装代理依赖。 |
| `backend/gateway/src/config/env.ts` | 校验三个服务目标地址、代理超时、网关端口与 CORS 白名单。 |
| `backend/gateway/src/config/upstreams.ts` | 将契约中的服务 ID 映射到已校验的上游地址；不接受客户端动态指定目标。 |
| `backend/gateway/src/proxy/register-proxies.ts` | 从契约注册公开 method/path，选择固定上游，保持完整 URL 和原始请求体。 |
| `backend/gateway/src/proxy/proxy-error.ts` | 统一产生502/504并复用共享错误响应 Schema；处理响应已开始或客户端已断开的情况。 |
| `backend/gateway/src/middlewares/request-context.ts` | 生成请求 ID，设置响应头，记录请求完成/中断日志。 |
| `backend/gateway/src/app.ts` | 按下述顺序装配网关中间件与路由。 |

环境变量：

| 变量 | 开发默认值 | 校验/作用 |
| --- | --- | --- |
| `PORT` | `3000` | 网关监听端口 |
| `HOST` | `0.0.0.0` | 网关监听地址 |
| `CHAT_SERVICE_URL` | `http://127.0.0.1:3001` | pr-chat 服务 Origin |
| `AUTH_SERVICE_URL` | `http://127.0.0.1:3002` | pr-auth 服务 Origin |
| `ADMIN_SERVICE_URL` | `http://127.0.0.1:3003` | pr-admin 服务 Origin |
| `UPSTREAM_TIMEOUT_MS` | `8000` | 普通 JSON 请求的总代理期限，小于前端10秒 |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:5174,http://localhost:5175` | 生产必须显式配置 |

目标地址只接受无凭据、无业务路径、无 query/hash 的 HTTP/HTTPS Origin，不能配置为已知的 gateway 自身地址。生产要求显式配置三个上游地址；DNS 别名或负载均衡映射造成的自环由部署配置排除。本地默认使用127.0.0.1避免 localhost 的 IPv4/IPv6 差异。

中间件顺序：

1. 请求 ID 与完成日志。
2. CORS 和 OPTIONS 预检。
3. gateway 自身健康路由（自身 JSON 校验只挂在该路由）。
4. 按契约注册下游公开路由并转发。
5. 统一404和网关内部异常处理。

代理处理规则：

- 代理中间件不使用会截掉前缀的 `app.use('/api/chat', ...)` 挂载方式；按完整方法/路径注册，传递原始 `req.url`，查询参数与路径编码不改写。
- 不在代理之前全局执行 `express.json()`，不把请求体读完再序列化。由下游的 JSON 解析和100kb限制负责当前业务请求校验，避免出现空 body、Content-Length 不匹配或上传数据被修改。
- 仅代理集中契约声明的公开操作；注册路由使用服务端静态配置，不跟随客户端提交的 URL。GET 的标准 HEAD 行为可保留，其他未声明方法走404。
- 保留正常下游状态码、响应头和响应体，包括业务4xx/5xx；不额外包装一层 success/data，不自动跟随重定向，不自动重试请求。
- 连接失败、DNS失败或上游异常断开且尚未开始响应时，返回502 `UPSTREAM_UNAVAILABLE`；达到8秒总期限时返回504 `UPSTREAM_TIMEOUT`并中止上游请求。配置 `proxyTimeout` 同时约束无数据活动，不能把它误当作总期限。
- 所有计时器在完成、错误或取消时清理；客户端取消/断连时终止对应上游请求，不继续写入已经关闭的响应。
- 若下游已经发送响应头/部分响应体后才失败或超时，关闭当前连接并记录原因，不尝试追加 JSON 或再次设置响应头。
- 网关创建自己的 UUID 请求 ID，覆盖外部同名头，写入 `X-Request-Id` 请求/响应头，并通过 CORS exposeHeaders 允许前端读取。下游日志复用该 ID；直接探测下游时可生成本地 ID。
- 清除客户端伪造的 `X-User-Id`、`X-Roles`、`X-Permissions` 等身份头。本次不产生身份信息；后续认证接入时再定义可信身份传递协议。
- 访问日志只记录 requestId、方法、无 query 的路径、目标服务、状态码、耗时和错误类别；不记录 Authorization、Cookie、密码或完整请求体。保留已有 console.log。
- 不使用缓存完整响应的 `responseInterceptor`，维持流式转发能力。本次不启用 WebSocket 升级、不新增 SSE 接口；未来聊天接入长连接时需调整路由级超时、心跳及前端读取方式。

### 4.7 迁移与部署兼容

- 执行前重新检查目录，若出现用户新修改，以实际文件迁移，不覆盖或丢弃。
- 如出现实际 `.env` 或前端本地配置，只随现有应用迁入对应 pr-chat，不复制到其他新项目。
- 不复制旧 node_modules、dist、tsbuildinfo；成功迁移后清理旧应用层的这些可重建产物，再安装和构建新布局。
- 迁移完成后删除旧应用文件入口，避免根目录仍存在第二套可运行前后端。
- 原 pr-chat 前后端开发端口保持；客户端健康路径变为经 gateway 的 `/api/chat/health`，原后端3001端口的 `/api/health` 随路由迁移不再保留别名。当前仅模板调用方，前端 SDK 同步更新；gateway `/api/health` 仅表示网关自身状态。
- 三个前端单独部署各自 `dist`，静态托管继续配置 SPA 路由回退。
- 四个后端可在同一完整 workspace 中分别运行；单独部署时需要打包共享契约和生产依赖，不只复制服务 dist。
- README 提供可执行的单服务打包示例：`pnpm --filter @my-sp-pr/pr-chat-api deploy --prod --legacy .deploy/pr-chat`，随后在目标目录使用 Node 24 运行 `dist/server.js`。构建前需完成根生成及构建。
- 三个前端可统一用 `VITE_API_BASE_URL=https://api.example.com/api pnpm build` 构建；生成的路径区分各业务，不再配置三个下游 API 域名。
- gateway 部署时配置三个内部服务 Origin、三个前端 Origin 和 HTTPS 入口；下游端口不对公网开放。HTTPS 可在部署平台/反向代理终止，gateway 不托管前端静态资源。
- 本地生产联调：三个前端统一构建为 `http://localhost:3000/api`；gateway 的 CORS 允许4173/4174/4175，分别启动四个生产后端和三个前端预览。浏览器网络请求只能出现 gateway 的3000端口，不能直接访问3001/3002/3003。
- 正式运行可在负载均衡后部署多个 gateway 实例；本次仅保留无会话状态的网关结构，不添加负载均衡配置或假定单实例具备高可用性。
- 本次没有数据库迁移、已有业务数据迁移、外部发布或监控平台接入。

## 5. 实施步骤

1. 获批后重读计划并复查现有文件，迁移已有应用到前后端 pr-chat，保留用户代码和 console.log。
2. 建立共享契约包及集中定义，更新后端引用和 workspace 依赖。
3. 新增另外两个前端和三个后端骨架，按统一契约注册各自命名空间；实现 gateway 公开路由转发、CORS、请求 ID、错误及取消处理。
4. 改造多服务生成、统一发布及监听，生成公开网关文档、下游文档、前端消费者 SDK 和共享契约构建。
5. 三个前端统一代理到 gateway，更新生成函数调用、根编排、TS 路径、ESLint 匹配、lint 提示、README 与锁文件。
6. 完成下列验证，修复受影响文件，清理临时测试字段、打包目录和验收进程。本次不实施第3.4节中的后续认证或长连接业务。

## 6. 验证与验收

1. **工作区**：依赖安装成功，列出七个应用及一个内部契约包，包名无冲突；旧根应用包和旧路径不再参与运行。保留已有依赖版本，确认锁文件可冻结安装。
2. **离线生成**：服务未启动时生成四份 OpenAPI、三个消费者 SDK 和契约 dist。校验 gateway 文档包含四个全局唯一 operationId 和正确命名空间；客户端 SDK 指向网关路径，生成内容不包含内网地址，前端不导入后端源码。
3. **同步和恢复**：临时修改集中契约，验证 SDK/文档更新及运行后端重启；重复生成不改内容和 mtime。临时加入无效定义，确认显式生成和构建失败、旧契约 dist/SDK/文档保留；修复后监听恢复，最后移除测试字段。
4. **类型检查与构建**：共享包、七个应用、生成代码及工具脚本通过类型检查；根构建成功，各应用输出位于自己的 dist；后端不扩大 rootDir 包含其他项目源码。
5. **限定 lint**：记录本次实际迁移后修改/新增/修改的手写 JS/MJS/TS/TSX 文件，逐个显式列入 `pnpm lint -- ...`。不检查未修改文件，不使用目录/glob/全项目 lint/format/fix；生成产物用类型和构建验证。
6. **整体开发启动**：根 dev 启动七个应用和一个监听器，无端口冲突；三个 Vite 代理都请求3000，再分别返回 pr-chat、pr-admin、pr-auth 状态。gateway 自身健康独立成功。
7. **单项目与故障隔离**：各包可独立启动；停止 pr-chat 后 `/api/chat/health` 返回502，其他两个下游与 gateway 自身仍正常；恢复服务后不必重启 gateway。
8. **路由与契约一致**：校验完整路径/query/method 保真，无重写、双 `/api` 或双服务前缀；未知服务、相似前缀、未知方法和未知路由返回404。临时标记内部操作，验证其能在下游运行但不经 gateway 暴露，且不进入公开文档/SDK；测试后还原契约。
9. **代理边界**：使用临时上游验证 body 未被提前消耗、业务4xx/5xx原样传回、慢响应产生504、客户端取消释放上游连接、部分响应失败不追加 JSON。验证分块响应不会被整段缓冲；不增加生产业务接口。复查真实下游非法 JSON 400、超限413；如使用 GET 请求体探测，使用 Node HTTP 客户端而非不允许 GET body 的 fetch。
10. **跨域与日志**：gateway 检查允许来源、拒绝来源、预检和无 Origin 请求；502/504同样携带正确 CORS 头。确认 requestId 在网关响应及下游日志中一致，日志没有凭证与完整请求体。
11. **浏览器**：三个前端显示各自品牌和对应下游状态；检查关于页、404、窄屏、刷新与失败恢复。网络面板确认 `/api` 只经 gateway，不直连下游。pr-sso 不出现已实现登录的误导性状态。
12. **生产与打包**：三个前端统一 API 地址构建，在4173/4174/4175跨域请求3000；至少打包并启动 pr-chat 和 gateway，验证它们携带契约库与各自生产依赖且不依赖原工作区路径；其余服务构建后可直接启动。
13. **收尾**：核对 README 示例与最终路径；停止本次启动的所有服务、临时上游与监听器，清理验证文件，保留正式生成产物和锁文件。恢复默认构建配置，不执行外部部署。

## 7. 本轮方案核对

- 已将所有前端直连安排改为 gateway 统一入口，统一开发代理、生产 API 地址和 CORS 配置。
- 已区分 gateway 自身健康、下游健康、统一公开文档与服务文档，避免四个相同 getHealth 合并冲突。
- 已明确认证与业务权限的后续职责，当前骨架仅开放健康接口。
- 已通过 npm 元数据和包文档确认代理依赖版本及关键行为；本轮未安装依赖或运行代码测试。
