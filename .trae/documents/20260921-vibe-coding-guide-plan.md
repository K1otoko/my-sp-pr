# 项目 Vibe Coding 规则与指南编写计划

## 1. 概要

根据当前项目的真实代码与命令，新增根目录 `AGENTS.md`，作为 AI 编程规则与开发指南的唯一主文档。

用户已确认：

- **规则与指南合一**：包含项目约束、常见任务流程与需求提示词模板。
- **按变更大小区分协作节奏**：局部修复直接实施；新功能、跨服务改动或新增依赖先提供方案，确认后实施。

正文使用中文，代码标识和命令保留原文；目标约 220–320 行，最多 350 行。关键规则前置，流程与模板随后，通过相对链接引用现有文件，避免复制完整 README。

成功标准：新会话中的 AI 读完后，能够判断任务属于哪个项目、是否需要先确认方案、应修改哪些源文件、如何生成接口及验证结果，同时遵守用户的 lint 范围和 console.log 规则。

本次计划获批后的实施仅新增 `AGENTS.md`；不改业务代码、配置、依赖、README 或已有计划文档，不安装工具、不启动服务。

## 2. 当前状态分析

### 2.1 已确认的事实

- 根目录与已检查的祖先目录没有 `AGENTS.md`；项目文件清单中未发现其他 AI 开发规则文件。
- `README.md` 已覆盖启动、目录、接口生成、Gateway 行为、环境变量和独立部署，适合引用为操作参考。
- `.trae/documents/` 保存历史计划和验收记录；它们不是当前代码状态的唯一依据。
- 项目包含三个 React 前端、四个 Express 后端，以及一个不运行服务的内部契约包。
- 已实现真实健康检查、Gateway 转发和接口生成；账号、登录、会话、权限、聊天与管理业务未实现。
- 当前没有测试脚本或已配置的测试框架。可用验证手段包括限定文件 lint、类型检查、构建、HTTP 验证和浏览器验证。

### 2.2 技术与结构依据

| 依据文件 | 本次用于确认的内容 |
| --- | --- |
| `package.json`、`pnpm-workspace.yaml`、`.npmrc` | pnpm workspace、Node 24、pnpm 10.25.0、根编排及检查命令 |
| `tsconfig.base.json` | TypeScript strict、类型导入及未使用声明检查等约束 |
| `frontend/pr-chat/package.json`、其他前端 package.json | React 19、Vite 8、React Router 7、Tailwind CSS 4、ahooks |
| `frontend/pr-chat/src/App.tsx` | 页面、布局及 Router 注册方式 |
| `frontend/pr-chat/src/hooks/useHealth.ts` | ahooks 请求、取消、刷新和卸载清理模式 |
| `frontend/pr-chat/src/api/client.ts` | 统一客户端、10 秒超时、JSON 检查及错误转换 |
| `frontend/pr-chat/src/styles/index.css`、`vite.config.ts` | 现有样式约定、端口和 Gateway 开发代理 |
| `backend/contracts/src/contract.ts` | 唯一手写接口契约、公共 Schema、命名空间、公开性及消费者 |
| `backend/contracts/package.json` | 契约包通过编译产物导出、workspace 依赖边界 |
| `backend/pr-chat/src/api/index.ts` | 服务对共享契约的本地入口 |
| `backend/pr-chat/src/routes/health.routes.ts` | 从契约派生路由方法和完整路径 |
| `backend/pr-chat/src/controllers/health.controller.ts`、`services/health.service.ts` | Controller/Service 分工和输出校验 |
| `backend/pr-chat/src/middlewares/error-handler.ts`、`utils/app-error.ts` | 统一错误类型、错误响应和日志 |
| `backend/pr-chat/tsconfig.json`、`tsconfig.build.json` | NodeNext、后端 `.js` 相对导入、各包 rootDir 边界 |
| `backend/gateway/src/app.ts`、`config/env.ts` | 中间件顺序、CORS、超时与生产配置校验 |
| `scripts/api-projects.ts`、`watch-api.ts` | 多项目生成路径和契约监听 |
| `scripts/lint-files.mjs`、`eslint.config.mjs` | lint 只接受具体代码文件；拒绝目录、glob、空参数及选项 |
| `.gitignore` | `.env`、node_modules、dist 和临时输出不纳入源文件维护 |

## 3. 假设与已定决策

1. 最终文档路径固定为 `/AGENTS.md`，作用范围为整个项目；本轮不拆分多个子目录规则文件。
2. 面向参与项目开发的 AI 与用户本人，不针对特定模型或 IDE。仅说明支持该约定的工具可以读取；其他工具需在任务中明确引用，不承诺所有工具都会自动加载。
3. 文档记录当前有效架构；用户后续批准的架构调整应同步更新文档，不能把现状写成永远不可更改的限制。
4. 本次明确提出的局部文档编写任务，以本计划的批准为实施授权；不因文档中未来的协作规则再次要求确认。
5. 新功能、跨服务改动、共享契约修改、新增依赖先给出方案；已批准范围内的必要代码生成和验证不重复请求批准。
6. 小范围修复指单个前端或后端内、需求和验收明确、不新增依赖、不改变共享契约与服务边界的修复。发现范围扩大时先说明原因再确认。
7. 探索能回答的问题先查代码；只对业务歧义、不可推断的偏好和关键取舍提问。用户明确要求只规划时保持只读。
8. 仅对本次实际修改或新增的手写 JS/MJS/TS/TSX 文件运行显式路径 lint。禁止全项目 lint/format/fix，禁止移除已有 console.log。
9. 当前骨架未包含认证、数据库和持久化。文档不得擅自选定数据库、认证协议或将未来功能写成已实现。
10. 本次是纯 Markdown 交付，使用只读检查验收，不运行代码生成、lint、类型检查、构建或浏览器。

## 4. 拟新增的 AGENTS.md 内容

### 4.1 用途、阅读顺序与关键规则

开篇说明适用范围与使用方式，随后提供简短规则清单：

- 按用户当前任务确定范围，先读相关源码，保留已有修改。
- 沿用现有技术栈、目录边界与统一 Gateway 入口。
- 所有接口从共享契约生成，不能直接手改 SDK、OpenAPI 和 dist。
- 执行限定文件 lint，保留已有 console.log。
- 不用未实现的登录、权限或伪造的业务成功状态充当功能完成。
- 需求明确的小修复直接完成；大变更按已确认的协作节奏推进。
- 报告真实执行的检查，标明未验证项和遗留问题。

指出事实来源：有效用户要求和已批准决策确定目标；当前代码与配置确认实现事实；README 提供使用说明；历史计划仅供背景参考。发现冲突应指出，不默默覆盖用户改动。

### 4.2 项目地图与请求链路

用一张表记录八个包的路径、包名、职责和端口：

| 路径 | 包名 | 职责 / 端口 |
| --- | --- | --- |
| `frontend/pr-chat` | `@my-sp-pr/pr-chat-web` | 客户端；5173 / 4173 |
| `frontend/pr-admin` | `@my-sp-pr/pr-admin-web` | 管理平台；5174 / 4174 |
| `frontend/pr-sso` | `@my-sp-pr/pr-sso-web` | 登录系统骨架；5175 / 4175 |
| `backend/gateway` | `@my-sp-pr/gateway` | API 入口；3000 |
| `backend/pr-chat` | `@my-sp-pr/pr-chat-api` | 客户端业务服务；3001 |
| `backend/pr-auth` | `@my-sp-pr/pr-auth-api` | 身份服务骨架；3002 |
| `backend/pr-admin` | `@my-sp-pr/pr-admin-api` | 管理服务骨架；3003 |
| `backend/contracts` | `@my-sp-pr/contracts` | 共享契约；不监听端口 |

用一行文字表达数据流：前端页面 → Hook → 生成 SDK / apiClient → Gateway → 对应服务。

说明 `/api/health` 是网关自身健康；`/api/chat/health`、`/api/admin/health`、`/api/auth/health` 分别代表下游，不能混用。生产 API 地址统一配置，前端不直接感知内部服务地址。

### 4.3 按任务定位代码

提供“任务 → 优先读取的现有文件”索引：

- 页面与导航：对应前端的 `src/pages/`、`src/App.tsx`、`src/components/AppLayout.tsx`。
- 品牌文案与样式：对应前端的 `src/project.ts`、`src/styles/index.css`。
- 请求状态和错误：对应前端的 `src/hooks/useHealth.ts`、`src/api/client.ts`。
- API 变更：共享契约、对应后端 `src/api/index.ts` 与 routes/controllers/services。
- 网关问题：`backend/gateway/src/app.ts`、`src/proxy/register-proxies.ts`、`src/config/env.ts`。
- 生成问题：`scripts/api-projects.ts`、`scripts/generate-api.ts`、`scripts/watch-api.ts`。

鼓励只加载任务相关上下文；不要求每次通读所有应用和生成文件。

### 4.4 协作流程与交付格式

明确任务分类、何时提问、何时先提交方案，以及确认后直接完成实现和验证。

大变更方案应包含：目标、涉及项目、接口/数据变化、实现步骤、兼容影响和验收方法。实现时只扩大到已经授权且必要的范围。

最终交付格式保持简洁：完成内容、关键文件、实际验证结果、未完成项；如启动临时服务，说明并清理本次创建的进程，不停止用户已有服务。

### 4.5 前端开发约定

- 使用现有 React 函数组件、TypeScript、React Router、Tailwind CSS 和 ahooks。
- 页面放在 pages，复用组件放在 components，业务请求状态放在 hooks；沿用现有命名方式。
- 已声明的业务 API 使用生成 SDK，显式传入 apiClient，通过 requestApi、unwrapResponse 处理响应；不在页面重复拼装服务地址。
- 按任务需要处理 loading、错误、空数据、成功、刷新和取消；沿用卸载时取消请求的模式。
- 沿用样式、语义元素、键盘焦点和窄屏适配；未经方案确认不引入新的 UI、状态或请求库。
- 各前端独立；当前没有共享 UI 包，不通过跨应用源码导入制造隐式依赖。

### 4.6 后端、契约与生成流程

采用可执行的顺序描述新增 API：

1. 确认所属服务、消费者、公开性、输入输出与验收。
2. 修改 `backend/contracts/src/contract.ts` 中的 Schema 和操作定义。
3. 对应服务实现路由、Controller 和 Service；方法及路径由契约派生。
4. 执行 `pnpm generate:api`，检查文档和 SDK 的实际变化。
5. 前端使用生成函数，补齐页面状态和必要验证。

强调：

- operationId 全局唯一；完整路径为 `/api + namespace + operation.path`，不重复拼接前缀。
- internal 操作的 clients 为空；public 表示允许经 Gateway 暴露，clients 仅选择 SDK 消费者，二者都不提供身份授权。
- 生成器只生成类型、文档及客户端，不生成业务逻辑，也不替代运行时输入校验。
- 当前响应输出用 Schema 校验；新增输入校验应按已批准设计映射业务错误和状态码，不能默认将所有 Zod 错误都变为 400。
- 复用 AppError 和统一错误 Schema；新增错误码应同步契约。
- 后端经 `@my-sp-pr/contracts` 使用编译后的契约，前端只使用生成 SDK；不跨包导入服务源码，不扩大 rootDir。
- 后端相对模块引用使用与 NodeNext 相符的 `.js` 后缀，类型使用 `import type`。
- 生成失败先修源契约或生成器，保留上次产物，不手改生成结果来绕过错误。

### 4.7 Gateway 与环境边界

简述需要保持的实现约束，并链接 README 的完整说明：

- Gateway 按公开契约选择固定上游，保留完整路径、query 和请求体。
- 代理前不能全局预读 JSON，不缓冲整段响应，不擅自添加重试。
- 保持正常上游响应、502/504、请求 ID、取消及部分响应失败处理。
- 当前默认 Gateway 8 秒总期限、前端 10 秒；SSE/WebSocket 属于另行设计事项。
- 仅 Gateway 管理浏览器 CORS；生产显式提供前端 Origin 和内部服务 Origin。
- `.env` 不作为示例内容提交；新增配置维护 `.env.example`，不把凭证放入 `VITE_*`。
- 服务不承担其他业务服务的持久化和业务逻辑；以后新增基础设施先按用户选定的流程确认方案。

### 4.8 命令与验证选择

只列现有且已从 package.json 核实的命令：

- `pnpm dev`、按包启动及联调需要的 Gateway/下游。
- `pnpm generate:api`、`pnpm watch:api`。
- `pnpm --filter @my-sp-pr/pr-chat-web typecheck` 等按包类型检查示例。
- `pnpm typecheck`、`pnpm build` 用于需要跨包验证的变更。
- `pnpm lint -- frontend/pr-chat/src/hooks/useHealth.ts` 等具体路径示例，注明仅当这些文件确实属于本次变更才可执行。

验证矩阵：

| 变更类型 | 应选择的验证 |
| --- | --- |
| 纯文档 | 路径、链接、命令与事实核对，无需代码 lint/构建 |
| 单前端局部改动 | 变更代码文件 lint、对应包类型检查；交互变化进行浏览器验证 |
| 单后端局部改动 | 变更代码文件 lint、对应包类型检查及受影响 HTTP 行为 |
| 契约或跨服务变更 | 生成、受影响手写文件 lint、跨包类型检查/构建、经 Gateway 的相关请求 |
| Gateway 代理改动 | 除正常路径外，按受影响范围验证失败、超时、流式与取消 |

不要求每个小改动都执行全部验收；检查通过后不无理由重复。区分类型检查、构建和运行时测试，不编造 `pnpm test`。需要新增测试工具时纳入方案确认。

### 4.9 任务模板与维护

在同一文件末尾提供三个简短可复制模板：

1. 局部修复：目标项目、现象/复现、期望行为、已知约束、验收。
2. 新功能：目标用户、所属前后端、业务规则、接口/数据、范围外内容；要求先出方案。
3. 跨服务/API 调整：受影响项目、旧/新行为、契约兼容、公开性与消费者、失败场景；要求先确认方案。

模板不把尚未存在的接口或文件描述成现有实现。

末尾链接 README 和共享契约。说明包名、端口、公共契约流程或架构边界发生已批准变化时，应同步维护本文件；不把临时调试记录和逐次任务日志追加进长期规则。

## 5. 文件变更与实施步骤

| 文件 | 操作 | 内容 |
| --- | --- | --- |
| `AGENTS.md` | 新增 | 按第 4 节组织完整规则、流程、命令及模板 |
| 本计划文件 | 规划产物 | 用于批准与执行，不作为最终长期规则入口 |

执行顺序：

1. 获批后重读本计划，确认根目录是否出现用户新建的 AGENTS.md；如有则先阅读，保留已有有效约定。
2. 新增 AGENTS.md，使用已确认内容和相对链接；不额外拆分文档或同步其他工具专用文件。
3. 只读核对引用路径、包名、端口、命令、能力边界和全部用户规则。
4. 检查协作规则内部一致：大变更先确认、小修复可直接执行、已授权工作不重复确认。
5. 检查篇幅与可读性，交付文件链接及明确的使用方式。

## 6. 验收标准

- 唯一正式新增文件是根目录 AGENTS.md，除计划文档外不改其他文件。
- 覆盖三前端、四后端、一个契约包，路径、包名和端口正确。
- 明确未实现登录等业务，未擅自引入数据库、认证方案或新的库。
- 契约、生成、路由、客户端和 Gateway 的职责与实际代码一致。
- 只有当前配置中存在的命令；所有 lint 示例均为具体变更文件，未建议全项目 lint/format/fix。
- 明确禁止移除已有 console.log，生成文件不直接编辑。
- 清楚体现用户选择的“按变更大小区分”协作节奏，避免重复确认。
- 包含可直接套用的任务模板和按变更类型选择的验证方法。
- 不声称所有 AI 工具自动读取 AGENTS.md；提供主动引用方式。
- 文档使用只读检查验证；不为了新增 Markdown 启动应用、安装依赖或运行构建。
