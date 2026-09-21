# React 19 + Vite / Express + Node.js 24 项目搭建计划

## 一、概要

在当前目录 `/Users/suochaoyang/Desktop/my-sp-pr` 创建可运行的全栈通用应用模板：

- 前端：React 19、Vite 8、TypeScript、Tailwind CSS 4、React Router 7、ahooks。
- 后端：Express 5、Node.js 24、TypeScript，采用 ESM；使用 Zod 定义接口数据结构。
- 工程管理：pnpm workspace，前端位于根目录 `frontend`，后端位于根目录 `backend`。
- 接口统一定义：以 `backend/src/api/contract.ts` 为唯一人工维护的接口定义文件，生成 OpenAPI 文档及前端类型、请求函数。
- 开发：根目录一条命令同时启动前后端，通过 Vite 的 `/api` 代理联调。
- 生产：前端静态文件和后端 API 独立部署，支持前端 API 地址与后端跨域白名单配置。
- 模板功能：首页、关于页、404 页面、ahooks 请求状态管理、自动生成的 API 客户端、后端分层和统一错误处理。

成功标准：依赖安装、接口生成及监听更新、开发启动、ahooks 前后端请求、类型检查、限定文件的 lint、构建和生产模式联调均通过，README 提供可直接执行的使用步骤。

## 二、当前状态分析

- 首次检查当前目录仅有 `.DS_Store`；目前仅额外创建了本计划文档，尚未创建项目代码或安装依赖。
- 当前目录不属于 Git 仓库；本次搭建不执行 Git 初始化或提交。
- 已检查当前目录及祖先目录的 `AGENTS.md`，未发现额外项目说明。
- 本机工具：Node.js `24.20.0`、npm `11.19.0`、pnpm `10.25.0`、Corepack `0.35.0`。
- 已通过 npm 元数据确认：
  - React 19 当前可用版本为 `19.3.0`。
  - Vite `8.3.0` 支持当前 Node.js 24。
  - `@vitejs/plugin-react` `6.1.1` 适配 Vite 8；React Compiler 相关 peer 依赖为可选项。
  - Tailwind Vite 插件 `4.3.3` 支持 Vite 8。
  - Express `5.2.1` 支持当前 Node.js 24。
  - React Router DOM `7.18.4` 支持 React 19 和 Node.js 24。
  - typescript-eslint 8 支持 TypeScript 5.9 与 ESLint 9。
  - ahooks `3.10.0` 明确支持 React 19。
  - Zod `4.6.5` 与 `@asteasolutions/zod-to-openapi` `9.1.0` 的 peer 要求匹配。
  - `@hey-api/openapi-ts` `0.99.0` 要求 Node.js `>=22.18.0`，兼容当前环境。
  - concurrently `10.0.5`、chokidar `5.0.0` 兼容 Node.js 24。
- 已查阅代码生成工具文档，确认其支持从本地 OpenAPI 对象生成 TypeScript、fetch 客户端和独立请求函数。工具自带的 watch 仅支持远程输入，本项目使用本地文件监听脚本。

以下文件路径均为基于已确认空目录规划的新增文件，不代表已有实现。

## 三、假设与已确定决策

- 用户已选择 TypeScript、pnpm、通用应用模板、Tailwind CSS、前后端独立部署。
- 用户要求目录使用 `frontend` / `backend`，前端通过 ahooks 请求，接口从后端统一定义文件自动生成。
- 用户将接口定义形式交由我建议；本计划采用 TypeScript + Zod，在同一语言中复用类型、校验规则和接口元数据，再导出标准 OpenAPI。OpenAPI 是自动生成的中间产物，不手工维护第二份定义。
- 受众为后续在本目录开发业务功能的开发者；示例界面与 README 使用中文。
- 本次不接入数据库、登录鉴权、业务 CRUD、状态管理库、组件库、Docker、CI 或实际部署平台。
- 不创建共享包；后端类型从 Zod 推导，前端类型从接口定义生成，不手工重复声明 DTO。
- ahooks 的 `useRequest` 管理请求状态、刷新和重试；底层 HTTP 由生成的 fetch 客户端执行，不增加 Axios 或其他请求状态库。
- 使用 React Router 的声明式路由，不引入 SSR。
- Tailwind 通过 `@tailwindcss/vite` 接入，不使用 Tailwind 3 的配置生成流程。
- 根目录固定 `packageManager: pnpm@10.25.0`，`engines.node: >=24 <25`，`.nvmrc` 写入 `24`。
- 主要依赖使用上述已确认版本；TypeScript 使用 5.9 系列、ESLint 使用 9 系列，其余辅助包选择兼容版本，所有实际解析结果记录在 `pnpm-lock.yaml`。代码生成器使用精确版本 `0.99.0`，避免生成格式随浮动版本变化。
- 保留现有文件及已有 `console.log`。不运行全项目 lint、format 或自动 fix。
- 计划阶段仅写入本文件；收到计划批准后再创建项目文件、安装依赖和启动服务。

## 四、拟议变更

### 1. 根目录工程配置

| 新增文件 | 内容与用途 |
| --- | --- |
| `package.json` | 私有 workspace 根包；提供接口生成、监听、开发、类型检查、构建和按文件 lint 的命令。 |
| `pnpm-workspace.yaml` | 明确声明 `frontend`、`backend` 两个工作区。 |
| `pnpm-lock.yaml` | 安装时生成，固定完整依赖树。 |
| `.nvmrc`、`.npmrc` | 声明 Node 24，开启 `engine-strict`，提前发现运行时不匹配。 |
| `.gitignore` | 忽略依赖、构建产物、代码生成临时目录、缓存、实际 `.env`、日志和 `.DS_Store`；保留 `.env.example` 和最终生成的接口代码。 |
| `tsconfig.base.json` | 共享严格类型检查、ES2022 目标等基础选项；模块解析由各应用配置。 |
| `tsconfig.scripts.json` | 对根目录 TypeScript 工具脚本执行无输出的类型检查。 |
| `eslint.config.mjs` | ESLint flat config，覆盖 TS、React Hooks 和 React Refresh；按文件匹配浏览器与 Node 环境。 |
| `scripts/lint-files.mjs` | 要求显式文件参数，通过 ESLint Node API 只检查传入文件；拒绝无参数、目录和 glob，不启用 fix。 |
| `scripts/generate-api.ts` | 导入后端接口定义，导出 OpenAPI，再生成前端类型、请求函数及 fetch 客户端。 |
| `scripts/watch-api.ts` | 监听统一接口定义文件，防抖并串行调用生成脚本，避免并发覆盖。 |
| `README.md` | 项目结构、安装、启动、环境变量、接口约定、构建、独立部署及验证方式。 |

根包不安装业务运行依赖；React、ahooks 与 Express、Zod 分别归属各自应用。根包统一放置 TypeScript、ESLint、tsx、代码生成器、Zod 到 OpenAPI 转换工具、chokidar 与 concurrently。

根目录命令约定：

| 命令 | 行为 |
| --- | --- |
| `pnpm generate:api` | 不启动后端，直接从统一定义生成 OpenAPI 和前端接口代码。 |
| `pnpm watch:api` | 初次生成后监听接口定义变化，持续更新生成结果。 |
| `pnpm dev` | 先成功生成接口，再通过 concurrently 启动前端、后端及接口监听；统一管理进程退出。 |
| `pnpm dev:frontend` | 先生成接口，再启动前端和接口监听。 |
| `pnpm dev:backend` | 仅启动后端，后端直接使用源定义，不依赖生成结果。 |
| `pnpm typecheck` | 先生成接口，再检查前后端及工具脚本类型，不生成编译产物。 |
| `pnpm build` | 先成功生成接口，完成类型检查并构建前端静态文件、后端 JavaScript。 |
| `pnpm start:backend` | 运行已构建的后端；生产环境由调用方设置 `NODE_ENV=production`。 |
| `pnpm preview:frontend` | 本地预览前端构建结果，不将其作为生产静态服务器。 |
| `pnpm lint -- <文件路径…>` | 只检查显式传入的本次新增或修改文件。 |

### 2. 接口统一定义与自动生成

数据流：

```text
backend/src/api/contract.ts
  ├─ Express 路由复用 method、path 和 API_PREFIX
  ├─ 后端控制器复用 Zod Schema 与推导类型
  └─ scripts/generate-api.ts
       ├─ backend/generated/openapi.json
       └─ frontend/src/api/generated/
            ├─ 请求参数、成功响应、错误响应类型
            ├─ getHealth 等请求函数
            └─ fetch 客户端
                 └─ ahooks useRequest
                      └─ 页面
```

统一定义文件 `backend/src/api/contract.ts`：

- 导出 `API_PREFIX = '/api'`、命名 Zod Schema、推导出的后端类型与 `apiContract` 接口表。
- 每个接口包含唯一 `operationId`、HTTP method、相对路径、说明、请求 Schema（如有）及按状态码声明的响应 Schema。
- 当前定义 `getHealth`，相对路径 `/health`、方法 `get`，无请求参数；声明 200 成功响应及统一错误响应。
- 使用 Zod 4 的 `.meta()` 提供 Schema 名称与描述。契约模块仅依赖 Zod，不加载 `.env`、Express 应用、数据库或监听端口。
- 后端路由从接口表取 method/path，挂载到同文件导出的 `API_PREFIX`；控制器使用同一成功响应 Schema 校验输出。
- 有参数的后续接口在这个文件内定义请求 Schema，并由相应后端路由复用校验；不在本次额外增加演示业务接口。
- 业务逻辑仍写在 controller/service 中；自动生成范围为 OpenAPI 与前端接口代码，不生成后端业务实现。

生成流程：

1. 生成脚本使用 `@asteasolutions/zod-to-openapi` 的 registry 与 `OpenApiGeneratorV3` 导出 OpenAPI `3.0.3`。`servers` 使用 `API_PREFIX`，`paths` 保持相对接口路径，防止重复拼接 `/api`。
2. 使用 `@hey-api/openapi-ts` 的 TypeScript、fetch 客户端、SDK 插件；SDK 采用扁平函数，保留 `operationId` 命名，例如 `getHealth`。
3. 产物写入 `backend/generated/openapi.json` 与 `frontend/src/api/generated/`，包括 `types.gen.ts`、`sdk.gen.ts`、`client.gen.ts` 和工具生成的 HTTP 支持文件。
4. 产物明确标注自动生成，保留在交付目录中以便直接查看；业务代码不手改产物，不另外维护接口 URL、参数和响应类型。
5. 所有路径根据脚本位置解析，避免依赖启动命令时的工作目录；输入是本地定义，不依赖后端在线或外部托管服务。
6. 先写入 `.api-codegen-tmp/` 下的临时产物，生成成功后仅替换指定生成目录；生成失败时保留上一次成功结果，报告错误并返回非零状态。没有成功生成时，开发初始化和构建不得继续。
7. 相同输入生成相同内容，不注入时间戳；内容未变的文件不重复写入，减少无意义的 HMR 和 diff。

监听约定：

- 仅监听 `backend/src/api/contract.ts`，不监听生成目录；本阶段全部人工维护的接口定义集中在该文件。
- 使用 chokidar 防抖；每次在新的子进程执行生成脚本，避免读取缓存模块；生成任务串行，期间有变化则追加一次最新生成。
- 启动时先安装监听再执行初次生成；根目录开发命令完成前置生成后，监听进程可跳过重复初次生成。
- 修改出错时明确打印生成失败，保留旧产物并继续监听；修复定义后自动恢复。构建和显式生成命令仍必须失败退出。
- 退出开发命令时同时关闭文件监听、生成子进程和开发服务。

### 3. 前端 `frontend`

| 新增文件 | 内容与用途 |
| --- | --- |
| `package.json` | 包名 `@my-sp-pr/frontend`；React、ahooks、路由与前端构建依赖及命令。 |
| `index.html` | 中文页面语言、标题和 React 挂载节点。 |
| `vite.config.ts` | React 与 Tailwind 插件；开发端口 `5173`、预览端口 `4173`；启用 `strictPort`。 |
| `tsconfig.json`、`tsconfig.app.json`、`tsconfig.node.json` | 分别组织应用与 Vite 配置的类型环境；使用 Bundler 模块解析。 |
| `.env.example` | 说明 `VITE_API_BASE_URL=/api`，并示例独立 API 域名的填写方式。 |
| `src/vite-env.d.ts` | 声明 Vite 环境变量类型。 |
| `src/main.tsx` | 使用 `createRoot`、StrictMode、BrowserRouter 挂载应用。 |
| `src/App.tsx`、`src/components/AppLayout.tsx` | 定义路由、公共导航和内容区域。 |
| `src/pages/HomePage.tsx` | 项目介绍与真实后端健康状态展示，提供手动刷新。 |
| `src/pages/AboutPage.tsx`、`src/pages/NotFoundPage.tsx` | 模板说明页和含返回首页入口的 404 页面。 |
| `src/api/generated/` | 自动生成的请求函数、类型及 fetch 客户端，不手写业务代码。 |
| `src/api/client.ts` | 创建使用环境变量配置的客户端实例，统一超时与错误转换。 |
| `src/hooks/useHealth.ts` | 用 ahooks `useRequest` 调用生成的 `getHealth`，处理响应解包、请求取消与刷新。 |
| `src/styles/index.css` | 引入 Tailwind 4，配置简洁的响应式页面基础样式。 |

路由为 `/`、`/about`、`*`。示例界面使用文字、布局和 CSS，不引入图片资源。

请求规则：

- `VITE_API_BASE_URL` 默认 `/api`；统一处理末尾斜杠，生成的 `getHealth` 负责 `/health` 路径和请求方法。
- 开发时 Vite 将 `/api` 原样代理到 `http://127.0.0.1:3001`，不重写路径。
- `src/api/client.ts` 从生成代码导入 `createClient`，创建配置好的实例；调用 SDK 时显式传入该实例，避免使用未配置的默认客户端。
- SDK 调用开启 `throwOnError`；手写薄封装只解包统一响应及转换错误，不重复定义接口结构和 URL。
- 统一处理非 2xx、业务错误响应、网络失败、非 JSON 响应和 10 秒超时，转换为页面可展示的 `Error`。
- 首页的 `loading`、`data`、`error`、刷新与重试来自 ahooks `useRequest`；失败后由用户重试，不启用无限自动重试。
- ahooks 的取消不等同于中止网络请求；同时通过 `AbortController` 中止旧请求，并在卸载、刷新时清理，避免 StrictMode 或响应乱序造成错误状态覆盖。
- 独立域名部署时，在前端构建前设置完整的 `VITE_API_BASE_URL`，例如 `https://api.example.com/api`；变量会被编译进静态资源，不能通过后端运行时变量修改。

### 4. 后端 `backend`

| 新增文件 | 内容与用途 |
| --- | --- |
| `package.json` | 包名 `@my-sp-pr/backend`；运行依赖 Express 5、cors、Zod，开发依赖 tsx 及对应类型包。 |
| `tsconfig.json`、`tsconfig.build.json` | NodeNext 模块及解析设置，输出到 `dist`，相对导入使用 `.js` 后缀。 |
| `.env.example` | 提供 `NODE_ENV`、`HOST`、`PORT`、`CORS_ORIGINS` 的说明与开发默认值。 |
| `src/config/env.ts` | 使用 Node 24 原生环境文件加载能力读取可选 `.env`；校验并导出配置。 |
| `src/app.ts` | 装配 CORS、JSON 解析、路由、404 和错误处理，不在此文件监听端口。 |
| `src/server.ts` | 启动 HTTP 服务，输出访问地址，处理启动失败和进程退出信号。 |
| `src/api/contract.ts` | 统一定义 API 前缀、接口元数据、参数及响应 Schema、后端推导类型。 |
| `generated/openapi.json` | 根据统一定义自动生成的标准接口文档。 |
| `src/routes/index.ts`、`src/routes/health.routes.ts` | 从统一定义读取前缀、HTTP 方法及路径，注册对应控制器。 |
| `src/controllers/health.controller.ts` | 使用契约中定义的类型及响应 Schema 校验服务结果，返回统一成功响应。 |
| `src/services/health.service.ts` | 生成服务状态、时间和运行时长。 |
| `src/middlewares/not-found.ts`、`src/middlewares/error-handler.ts` | 未匹配接口和统一异常响应。 |
| `src/utils/app-error.ts` | 可识别的 HTTP 错误；响应结构及错误码类型从统一接口定义复用。 |

后端约定：

- 使用 `tsx watch` 开发热重启，`tsc` 编译，生产直接运行 `node dist/server.js`。
- 配置读取在启动监听前完成；默认监听 `0.0.0.0:3001`，`PORT` 必须是有效端口。
- `.env` 缺失时使用环境变量及开发默认值；仅忽略文件不存在，其他加载或校验错误明确终止启动。
- `CORS_ORIGINS` 为逗号分隔的 HTTP/HTTPS Origin 列表；开发默认 `http://localhost:5173`，生产必须显式提供。
- 允许未携带 Origin 的服务端请求；带 Origin 的请求只允许白名单地址，拒绝时返回 JSON 403；支持预检，不启用 cookie 凭据。
- `express.json` 限制请求体大小为 `100kb`。
- 未知 API 返回 JSON 404，JSON 格式错误返回 400，请求体超限返回 413；未预期异常返回 500，响应不含堆栈，服务端保留错误日志。
- Express 5 的异步错误进入统一错误处理中间件，不额外引入异步包装库。
- 后端输出不符合 Zod 响应 Schema 属于服务端错误，返回 500；不将响应校验失败误报成客户端参数错误。
- 处理 `SIGINT`、`SIGTERM` 关闭 HTTP 服务；端口占用时提供清晰错误并非零退出。
- Express 仅提供 API，不托管前端静态文件或 SPA 路由。

接口定义：

`GET /api/health` → HTTP 200：

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "service": "my-sp-pr-api",
    "timestamp": "ISO 8601 UTC 时间",
    "uptime": 123
  }
}
```

`uptime` 为进程运行秒数，取非负整数。统一失败响应：

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "接口不存在"
  }
}
```

其余错误码包括 `CORS_FORBIDDEN`、`INVALID_JSON`、`PAYLOAD_TOO_LARGE`、`INTERNAL_ERROR`；HTTP 状态码与错误含义保持一致。

### 5. README 与独立部署说明

- 给出 Node 24、pnpm 安装前提，以及 `pnpm install`、环境文件复制、`pnpm dev` 和构建命令。
- 说明两个工作区的命令工作目录及默认端口；自定义后端开发端口时同步更新 Vite 代理。
- 说明接口开发顺序：修改 `backend/src/api/contract.ts` → 编写对应后端逻辑 → 自动生成或运行 `pnpm generate:api` → ahooks 调用生成函数。
- 说明生成目录不可手动维护、生成过程无需后端在线、产物变化应与源定义一起纳入版本管理。
- 前端产物为 `frontend/dist`；静态托管服务需将 `/about` 等前端路由回退到 `index.html`。
- 后端产物为 `backend/dist`；运行环境需 Node 24 和后端生产依赖，配置 `NODE_ENV=production`、`PORT`、`CORS_ORIGINS`。
- 提供本地生产联调示例：构建时将 API 地址设为 `http://localhost:3001/api`，后端允许 `http://localhost:4173`，使用 `pnpm preview:frontend` 预览。
- 说明 `/api/health` 可供部署平台配置健康检查；本次不配置监控平台或进行外部部署。
- 无数据库、数据迁移或旧版本兼容需求。

## 五、执行顺序

1. 批准后先重读本计划，确认目录在等待期间是否出现新文件，避免覆盖。
2. 创建根目录、`frontend` / `backend` workspace、版本约束、TypeScript 和限定文件 lint 配置。
3. 安装兼容依赖并生成锁文件，实现统一接口定义、生成及监听脚本，完成首次生成。
4. 实现复用接口定义的后端配置、分层路由、控制器及错误处理。
5. 实现前端路由、Tailwind 页面、生成客户端的配置与 ahooks 健康检查调用。
6. 补齐开发及构建编排，完成 README。
7. 执行以下验收；发现问题仅修改相关文件并复查受影响项。
8. 给出启动命令、接口生成入口、验证结果及必要的未完成说明。

## 六、验证与验收

1. **依赖与版本**：`pnpm install` 成功，确认 React 保持 19 系列、Node 运行于 24 系列，无未解决的必需 peer 依赖。
2. **离线接口生成**：后端未启动时 `pnpm generate:api` 成功；OpenAPI 包含 `getHealth` 和命名 Schema，生成的 SDK 与参数、响应类型可被前端导入。
3. **生成同步与失败恢复**：临时给契约添加可选响应字段，确认监听后前端生成类型自动出现该字段；还原契约并重新生成，不保留测试字段。验证重复生成内容不变，临时无效定义不会覆盖上次产物，修复后监听恢复，构建遇到无效定义必须失败。
4. **类型检查**：`pnpm typecheck` 通过，覆盖前端、自动生成客户端、后端和工具脚本。
5. **限定范围 lint**：显式列出此次实际新增或修改的手写 TS、TSX、JS、MJS 文件运行 `pnpm lint -- ...`；不得使用目录、glob、全项目扫描或 `--fix`。生成客户端作为机器产物由类型检查和构建验证，ESLint 忽略该专用生成目录；锁文件、Markdown、JSON 不作为 ESLint 输入。
6. **开发联调**：`pnpm dev` 启动前后端与接口监听；直接访问 `/api/health` 成功；前端通过 ahooks、生成 SDK、Vite 代理显示真实健康状态。
7. **页面行为**：浏览器检查首页、关于页和 404；检查窄屏布局、导航及 ahooks 加载状态与刷新；后端不可用时展示错误并能重试恢复，快速重复刷新和离开页面不产生旧结果覆盖。使用浏览器工具前加载相应浏览器技能。
8. **HTTP 边界**：验证未知 API 的 404、非法 JSON 的 400、超大请求体的 413，以及 CORS 允许来源、拒绝来源、预检与无 Origin 请求；健康检查响应通过同一契约的 Zod Schema。
9. **构建**：`pnpm build` 先生成接口，再成功生成两端产物；后端编译结果可以由 Node 24 直接运行，前端产物不包含后端源码。
10. **独立部署联调**：以前端构建变量指定本地 API 地址，使用 `pnpm preview:frontend` 与生产模式后端，在 `4173` 到 `3001` 的跨域场景验证首页健康状态。
11. **文档和收尾**：核对 README 命令与环境变量；结束仅由本次验证启动的临时服务及文件监听，保留完整项目、生成结果与锁文件。

这是工程初始化任务，本次使用生成流程验证、类型检查、限定范围 lint、HTTP 冒烟检查及浏览器验收，不新增测试框架或仅重复模板实现的测试文件。

## 七、关键工具参考

- [Zod 到 OpenAPI：复用 Schema 与接口定义](https://github.com/asteasolutions/zod-to-openapi)
- [Hey API：代码生成与 Node.js API](https://heyapi.dev/openapi-ts/get-started)
- [Hey API：fetch 客户端配置](https://heyapi.dev/openapi-ts/clients/fetch)
- [Hey API：SDK 独立函数生成](https://heyapi.dev/openapi-ts/plugins/sdk)
- [Hey API：本地输入与 watch 限制](https://heyapi.dev/openapi-ts/configuration/input)
