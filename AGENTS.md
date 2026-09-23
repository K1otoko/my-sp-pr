# my-sp-pr · AI 编程规则与开发指南

本文件适用于整个项目，供 AI 编程工具和开发者在执行任务前阅读。
支持 AGENTS.md 约定的工具可按其规则加载；其他工具请在会话中明确要求：“先阅读根目录 AGENTS.md，再处理本次任务。”
先读关键规则和项目地图，再按任务查找相关章节，无需每次加载全部源码。

## 1. 关键规则

1. 先检查相关代码与配置，确认目标项目、现有行为和验收标准；保留用户已有修改。
2. 小范围修复可直接完成；新功能、跨服务改动、共享契约修改或新增依赖先给方案，用户确认后实施。
3. 已批准范围内的实现、接口生成和必要验证不重复请求确认。用户明确要求只规划时保持只读。
4. 所有前端业务 API 经 Gateway；不在前端直连内部服务或重复声明服务地址。
5. 接口定义集中在 `backend/contracts/src/` 的对应 `*.contract.ts` 和 `shared.ts`，`contract.ts` 仅聚合；SDK、OpenAPI 和 dist 由工具生成，禁止直接手改。
6. **只对本次实际修改或新增的手写代码文件执行显式路径 lint，禁止全项目 lint、format 或 fix。**
7. **禁止移除已有 console.log。** 不以格式化、重构或清理日志为由删除。
8. 沿用现有技术栈和包边界；不通过跨应用源码导入、扩大 rootDir 或关闭类型检查绕过问题。
9. 当前未实现的登录、权限和业务功能不能用模拟成功状态冒充完成。
10. 只报告实际完成的修改和验证；类型检查、构建、运行时测试分别说明，未验证的项目明确标注。

用户当前要求和已批准决策确定任务目标；源码与配置确认实现事实，[README](README.md) 提供操作说明。
历史计划位于 `.trae/documents/`，仅作背景参考。发现文档、代码或用户要求存在冲突时，指出具体差异再处理。

## 2. 当前项目与请求链路

这是一个 pnpm workspace：三个前端、四个后端、一个内部契约包、一个数据库技术包。
目前提供真实健康与数据库就绪检查、Gateway HTTP 转发、OpenAPI/SDK、PostgreSQL 18 + Drizzle，以及基于 oidc-provider 的 SSO 登录、中央会话和 super/admin/user 角色准入。
Admin 已通过 OIDC BFF 接入登录，admin/super 可进入，只有 super 可访问发布模块；Chat 尚未接入登录。注册、账号管理、设置、聊天业务权限后续单独实现，不能将 SSO 或 Admin 发布权限表述为 Chat 已完成鉴权。

技术栈：Node.js 24、pnpm 10.25.0、TypeScript strict；前端使用 React 19、Vite 8、React Router 7、Ant Design 6、Tailwind CSS 4、ahooks；后端使用 Express 5、Zod 4。
具体依赖版本以各 package.json 和锁文件为准，不在无关任务中升级。

| 项目路径 | 包名 | 职责 | 开发/服务端口 | 预览端口 |
| --- | --- | --- | --- | --- |
| `frontend/pr-chat` | `@my-sp-pr/pr-chat-web` | 客户端 | 5173 | 4173 |
| `frontend/pr-admin` | `@my-sp-pr/pr-admin-web` | 管理平台 | 5174 | 4174 |
| `frontend/pr-sso` | `@my-sp-pr/pr-sso-web` | 登录、状态、退出页面 | 5175 | 4175 |
| `backend/gateway` | `@my-sp-pr/gateway` | 统一 API 入口 | 3000 | — |
| `backend/pr-chat` | `@my-sp-pr/pr-chat-api` | 客户端业务服务 | 3001 | — |
| `backend/pr-auth` | `@my-sp-pr/pr-auth-api` | OIDC 身份服务 | 3002 | — |
| `backend/pr-admin` | `@my-sp-pr/pr-admin-api` | Admin BFF 与发布控制面 | 3003 | — |
| `backend/contracts` | `@my-sp-pr/contracts` | 共享契约库 | 不监听 | — |
| `backend/database` | `@my-sp-pr/database` | PG 配置、Pool、Drizzle、迁移工具 | 不监听 | — |

请求链路：页面 → Hook → 生成 SDK / apiClient → Gateway → 对应后端服务。
开发时 Vite 将同源 `/api` 原样代理到 `http://127.0.0.1:3000`；SSO 还代理两个精确 discovery 路径。Chat 可配置生产网关 API 地址；Admin/SSO Cookie API 始终同源，由各自站点反代 Gateway。

| 完整健康路径 | 响应服务 | 对应生成函数 |
| --- | --- | --- |
| `/api/health` | gateway 自身 | `getGatewayHealth` |
| `/api/chat/health` | pr-chat | `getChatHealth` |
| `/api/admin/health` | pr-admin | `getAdminHealth` |
| `/api/auth/health` | pr-auth | `getAuthHealth` |

Gateway 自身健康不代表所有下游健康。排查某个前端时检查它对应的下游路径。
原 health 只表示存活；内部 `/api/auth/ready`、`/api/chat/ready`、`/api/admin/ready` 真实检查数据库，失败返回 503，恢复后可重新就绪。Gateway 对 ready 返回 404，不生成前端 SDK。

## 3. 协作节奏

按变更大小决定是否先确认方案：

| 情况 | 执行方式 |
| --- | --- |
| 单个前端或后端内的局部修复，需求和验收明确，不新增依赖、不改变共享契约和服务边界 | 简述处理方向，直接实现并验证 |
| 新功能、跨服务改动、共享契约修改、新增依赖或基础设施 | 先探索，提交方案，确认后实现 |
| 业务规则不清、存在多种互斥行为或关键架构取舍 | 先调查能从项目确定的事实，再提出具体问题 |
| 用户明确指定计划模式 | 只做只读调查和允许的计划文档编写，确认后再实施 |

方案应写清目标、涉及项目、接口或数据变化、实现步骤、兼容影响和验收方法。
用户已授权的工作继续完成；生成器因此更新多个 SDK 或文档，不需要逐个文件再次确认。
发现实际范围超出已批准方案时，说明新增影响，先确认扩大部分。

任务开始时定位相关文件和现有改动；不要顺带重构无关模块或改写用户代码。
能从代码回答的问题先查代码，搜索优先使用 `rg` / `rg --files`。
执行中说明关键发现与阻塞，结束时给出完成内容、关键文件、实际验证结果和未完成项。
如创建了临时服务、监听器或验证文件，完成后清理自己创建的资源，不停止用户已有进程。

## 4. 按任务查找代码

下表以前后端 pr-chat 为参考；处理 pr-admin / pr-sso / pr-auth 时，读取对应应用的同层文件。

| 任务 | 优先读取 |
| --- | --- |
| 页面与路由 | [App.tsx](frontend/pr-chat/src/App.tsx)、[pages](frontend/pr-chat/src/pages/)、[AppLayout.tsx](frontend/pr-chat/src/components/AppLayout.tsx) |
| 品牌与样式 | [project.ts](frontend/pr-chat/src/project.ts)、[index.css](frontend/pr-chat/src/styles/index.css) |
| 组件主题与偏好 | [theme/config.ts](frontend/pr-chat/src/theme/config.ts)、[ThemeProvider.tsx](frontend/pr-chat/src/theme/ThemeProvider.tsx)、[theme-store.ts](frontend/pr-chat/src/theme/theme-store.ts)、[ThemeSwitcher.tsx](frontend/pr-chat/src/components/ThemeSwitcher.tsx)、对应 `index.html` 首屏脚本 |
| 请求状态、取消与错误 | [useHealth.ts](frontend/pr-chat/src/hooks/useHealth.ts)、[api/client.ts](frontend/pr-chat/src/api/client.ts) |
| 新增或调整 API | [共享契约](backend/contracts/src/contract.ts)、[服务契约入口](backend/pr-chat/src/api/index.ts)、对应 routes/controllers/services |
| 后端响应与错误 | [health.controller.ts](backend/pr-chat/src/controllers/health.controller.ts)、[error-handler.ts](backend/pr-chat/src/middlewares/error-handler.ts)、[AppError](backend/pr-chat/src/utils/app-error.ts) |
| Gateway 转发 | [app.ts](backend/gateway/src/app.ts)、[register-proxies.ts](backend/gateway/src/proxy/register-proxies.ts)、[proxy-error.ts](backend/gateway/src/proxy/proxy-error.ts) |
| 环境与开发代理 | 对应应用 `.env.example`、[Gateway 配置](backend/gateway/src/config/env.ts)、对应前端 `vite.config.ts` |
| 接口生成与监听 | [api-projects.ts](scripts/api-projects.ts)、[generate-api.ts](scripts/generate-api.ts)、[watch-api.ts](scripts/watch-api.ts) |
| lint 与编译边界 | [lint-files.mjs](scripts/lint-files.mjs)、[eslint.config.mjs](eslint.config.mjs)、[tsconfig.base.json](tsconfig.base.json)、目标包 tsconfig |
| 数据库配置与连接 | [database/config.ts](backend/database/src/config.ts)、[client.ts](backend/database/src/client.ts)、目标服务 `src/db/index.ts` |
| 表结构与迁移 | 目标服务 `src/db/schema/`、`drizzle.config.ts`、`drizzle/`、[迁移执行器](backend/database/src/migrate.ts) |
| SSO 登录与协议 | `backend/pr-auth/src/oidc/provider.ts`、`oidc/adapter.ts`、`controllers/auth.controller.ts`、`portal/client.ts` |
| SSO 配置、账号和期限 | `backend/pr-auth/src/config/auth.ts`、`repositories/auth-store.ts`、`services/account.service.ts`、`auth/policy.ts` |
| Admin 登录与发布 | `backend/pr-admin/src/auth/`、`repositories/`、`services/deployment.service.ts`、`frontend/pr-admin/src/pages/` |
| 发布清单与 runner | `deploy.manifest.json`、`.github/workflows/deploy.yml`、`scripts/deploy/`、`deploy/pm2/` |

先读取最相关的入口及其直接依赖；不要为了局部修改通读所有应用或生成文件。

## 5. 前端开发约定

- 使用 TypeScript 函数组件；页面放 `src/pages/`，复用组件放 `src/components/`，请求状态逻辑放 `src/hooks/`。
- 沿用 PascalCase 组件文件、`useXxx` Hook 和当前路由组织方式；新增页面同时检查 App.tsx 与需要的导航。
- 品牌配置集中在各自 `src/project.ts`；后续 UI 按本节的 Ant Design 6 与主题设计规范开发，Tailwind CSS 主要用于布局、间距与响应式。
- 已声明的业务接口使用生成 SDK，显式传入 `apiClient`；通过 `requestApi` 处理超时和错误，通过 `unwrapResponse` 取业务数据。
- 不在页面中重复实现通用 fetch 包装、拼接服务命名空间或硬编码下游端口。
- 使用 ahooks 管理异步请求；按实际交互覆盖加载、错误、空数据、成功与刷新状态。
- 请求替换、手动刷新和组件卸载时，沿用现有 AbortController 取消模式，避免旧响应覆盖新状态。
- 保留语义元素、键盘焦点、必要的 aria 提示、窄屏布局与减少动画偏好。
- 三个前端独立运行；当前没有共享 UI 包，不直接导入另一前端的源码。
- 新增 UI、状态管理或请求库属于依赖变更，先说明现有能力为何不足并纳入方案。

### UI 组件与主题设计规范

- 后续新增或调整 UI 时，优先使用 **Ant Design 6（Antd 6）**。按钮、表单、输入、选择、表格、分页、导航、弹层和反馈等基础能力，Antd 已满足需求时不重复实现。确有不足时说明原因，优先组合或适度扩展现有组件。
- 三个前端通过各自的 `src/theme/ThemeProvider.tsx` 统一接入 Antd，配置集中在 `src/theme/config.ts`。页面优先使用主题 Token，实际依赖版本以 package.json 和锁文件为准；Antd 6 原生支持 React 19，不添加 v5 兼容补丁。
- 三端统一采用 Antd 简洁蓝灰风格。品牌主色种子为 `#1677FF`；浅色页面背景 `#F5F5F5`、内容区与浮层背景 `#FFFFFF`；深色页面背景 `#141414`、内容区与浮层背景 `#1F1F1F`。
- 主题通过 `ConfigProvider` 集中配置，浅色采用 `theme.defaultAlgorithm`，深色采用 `theme.darkAlgorithm`。文字、边框、分割线、交互色和成功/警告/错误状态使用对应语义 Token，避免在页面中散落固定颜色。普通文字对比度至少 4.5:1；辅助文字映射到 `colorTextSecondary`，链接、选中态及主按钮使用同一算法色板中满足对比度的色阶，集中在主题配置调整。
- 默认使用 Antd 系统字体栈，基础字号 14px、基础圆角 6px、大圆角 8px、控件高度 32px，以 4px 为间距基准；具体业务布局和信息密度在对应模块设计中确定。
- 主题支持“浅色 / 深色 / 跟随系统”，默认跟随系统；各应用独立记忆偏好，同一应用的同源标签页同步。存储键为 `my-sp-pr:<project.id>:theme`；手动选择不被系统主题变化覆盖，系统模式实时响应变化。
- 页面背景、导航、内容区和弹层必须共同适配主题；处理首次加载闪烁、存储不可用回退，并保留键盘焦点、窄屏布局和减少动画偏好。主题切换不得重置业务状态或触发无关请求。调整主题背景或应用标识时，同步对应 `index.html` 的首屏脚本与背景样式。
- Tailwind CSS 负责布局、间距与响应式；Antd 外观优先通过 Token 及公开的 `styles` / `classNames` 调整。保持 `theme, base, antd, components, utilities` 样式层级与 `StyleProvider layer`，不依赖组件内部 DOM 或大范围覆盖样式。
- 消息、通知和确认框通过 Antd `App.useApp()` 获取实例，保证继承当前主题；保留 Provider 内的 Antd App DOM 根节点。使用 Antd 6 支持的 API，不沿用已废弃写法。
- 保持三个前端的包边界，不直接跨应用导入 UI 源码。聊天、管理、登录等模块的功能与页面单独设计，不使用演示业务或模拟成功状态冒充完成。

现有客户端调用形式如下；在对应 Hook 的取消与异常处理流程中使用：

```ts
const payload = await requestApi(
  (signal) => getChatHealth({ client: apiClient, throwOnError: true, signal }),
  active.signal,
);
return unwrapResponse(payload);
```

`active` 来自当前请求的 AbortController，完整生命周期参考 useHealth.ts。

## 6. 后端、接口契约与生成

### 新增或调整接口的顺序

1. 先确定所属服务、输入输出、业务规则、消费者、公开性与验收；按第 3 节确认方案。
2. 在 `backend/contracts/src/` 对应服务的 `*.contract.ts` 和共享 `shared.ts` 定义或修改 Schema 和操作；`contract.ts` 仅聚合。
3. 在目标后端实现 routes、controllers、services，复用本地 `src/api/index.ts` 导出的契约。
4. 执行 `pnpm generate:api`，检查 OpenAPI 与各消费者 SDK 是否按预期更新。
5. 前端调用生成函数，补齐状态处理；完成受影响文件检查和实际请求验证。

### 契约规则

- 操作声明全局唯一 operationId、method、相对 path、exposure、clients、请求及响应定义。
- 完整路径为 `/api + namespace + operation.path`；使用 `fullPath` / `expressPath` 派生路由，不重复拼接 `/api` 或服务前缀。
- 路径参数采用 `/items/{id}` 形式，由 `expressPath` 转成 Express 路径；这是格式示例，不表示已有 items 接口。
- `exposure: 'public'` 允许接口经 Gateway 暴露；`internal` 接口的 clients 必须为空。
- **exposure 和 clients 不提供身份授权。** clients 只筛选 SDK 消费者；需要登录或权限的接口必须先确定并实现认证授权方案。
- 下游 OpenAPI 包含自身操作；Gateway OpenAPI 汇总公开操作；每个前端 SDK 仅包含分配给它的公开操作。
- 生成器不实现业务逻辑，不注册新的下游控制器，也不替代运行时输入校验。
- OIDC 协议例外：路由集中于 `auth-oidc.ts`，由 pr-auth/Gateway 精确复用；两个根 discovery 及标准协议响应不使用 JSON 业务包装，不生成普通 SDK。JSON 交互/会话操作仍遵循服务契约。

### 后端实现规则

- routes 负责方法、路径与处理器挂载；controllers 处理 HTTP 输入输出；services 承载业务逻辑。
- 输入校验和响应输出校验使用契约 Schema，避免再维护一份不一致的类型或接口定义。
- 新增输入校验时明确失败状态和错误码；不要把输出校验失败或所有 Zod 错误一律映射为客户端 400。
- 沿用成功响应 `{ success: true, data }` 和错误响应 `{ success: false, error: { code, message } }`。
- 复用 `AppError`、公共错误 Schema 和统一 errorHandler；新增错误码同步修改集中契约。
- 保留现有 JSON 100kb 限制、非法 JSON 400、超限 413 和未知路由 404，除非方案明确调整。
- 后端通过 `@my-sp-pr/contracts` 使用编译产物；共享契约仅依赖基础 Schema 能力，不导入应用业务。
- 不跨服务导入源码，也不扩大某个后端 rootDir 来容纳其他包；各服务输出保留在自己的 dist。
- 使用 NodeNext 兼容的 `.js` 相对模块引用；类型用 `import type`，遵守现有严格编译选项。

### 生成文件边界

以下均由工具维护：`backend/contracts/dist/`、各后端 `generated/openapi.json`、各前端 `src/api/generated/`。
API 变化修改源契约；输出映射变化修改 `scripts/api-projects.ts`；生成逻辑变化修改 `scripts/generate-api.ts`。
前端只使用生成 SDK，不直接导入后端源码。
生成失败先修复源契约或生成器，保留上次成功产物，不手改生成文件来绕过报错。
源码契约、OpenAPI 和 SDK 的变化应一起交付；dist 是可重建产物。
监听器监控 `contracts/src/` 下全部 TS 新增、修改和删除；四个后端监听 `contracts/dist/**/*.js`，三个业务后端另监听 `database/dist/**/*.js`。不要依赖旧产物判断修改已生效。

### 数据库边界

- 使用 PG18 + Drizzle/node-postgres，三个服务分别持有独立 Pool；Gateway、前端和契约包不依赖 database 包。
- 同库 auth/chat/admin Schema，运行角色固定为 `my_sp_pr_<域>_app`，迁移角色为 `my_sp_pr_<域>_migrator`；迁移记录在 `<域>_migrations.__drizzle_migrations`。
- 业务表归服务自身 `src/db/schema/`，显式使用 pgSchema。不跨服务导入表、跨 Schema 联表或加外键，不把 ORM 类型导入 HTTP 契约。
- app 仅有自身业务 DML，无 DDL/迁移历史权限；迁移角色拥有自身 Schema 和数据库 CREATE，凭据仅用于部署命令。HTTP 服务不得使用管理员或迁移账号。
- 数据库包不默认读取 .env、不注册信号、不自动连接/迁移；服务加载配置并创建实例。数据库包也必须通过编译产物导入。
- 新增表或数据库依赖先按协作规则确认。使用 Kit 生成 SQL/journal/snapshot；自定义授权 SQL 先用 `--custom` 生成容器。已执行迁移不可修改，追加修复迁移；不用 push/reset。
- 迁移显式执行，独占 Client 持有服务 advisory lock；不在 dev/watch/build/启动/健康检查中迁移。根串行迁移不是跨服务总事务。
- 首次数据库检查失败不监听 HTTP；运行中故障只使 ready 返回 503；退出先 HTTP 后 Pool，共用 10 秒期限，PM2 kill_timeout 12 秒。
- Neon 事务池地址转换为同端点直连，运行由应用 Pool 管理；TLS 校验证书与主机。URL 参数及 channel binding 支持范围以 README 为准。
- 配置报错和运行日志不得输出连接串、密码、完整 SQL 参数或驱动嵌套错误。环境文件和验证凭据不提交 Git。

### SSO 身份边界

- issuer 为稳定 SSO Origin，Gateway/pr-auth 配置必须一致；开发为 `http://localhost:5175`，生产必须 HTTPS。同源 Cookie 无 Domain，不共享父域 Cookie。
- 仅 Authorization Code + PKCE S256，机密客户端；私钥、client secret 和 token 均留在后端。静态注册客户端，精确回调/退出地址与 scopes/allowedRoles。
- auth 七表归身份服务；角色固定 super/admin/user，默认 user。空库 bootstrap 创建 super，已有 admin 不自动提升，最后一个有效 super 不能降级/禁用。角色 scope 是身份声明，不代替未来业务权限或数据归属检查；管理员不默认可读其他用户私人数据。
- 中央登录最长 7 天、空闲 24 小时；退出当前浏览器撤销关联授权，其他设备保留。密码重置/禁用/角色变化递增 auth_version 并撤销该用户全部会话。
- `auth:keys` 显式生成独立密钥配置，不在启动时生成。bootstrap/reset 使用隐藏输入及 app DML 凭据，不能固定默认密码；最后一个有效 super 不能被禁用/降权。
- Adapter 的消费/撤销/期限语义必须保留；数据库失败不回退内存。维护命令显式运行，保留 tombstone 和审计期限；不在健康检查中清理。
- SSO 前端仅登录/状态/退出/错误页面。Admin 使用独立 HttpOnly BFF 会话并在线校验 UserInfo，不读写 auth Schema；Chat 接入和跨域应用会话撤销另行设计。

### 发布平台边界

- `deploy.manifest.json` 是项目/preset/变量白名单事实源；Admin 首版只同步当前仓库，不接受任意构建命令。
- Admin 只创建 GitHub Deployment、保存审计与状态；不 clone/构建仓库、不保存 GitHub token 或 secret value、不直接 SSH。
- branch/tag/SHA 在提交时解析为不可变 commit SHA。production 只允许环境配置的主分支/版本标签；不推荐每项目永久分支。
- 每项目/环境使用独立 GitHub Environment。非敏感变量可读取，secret 只检查名称；migration secret 不进入长期 runtime.env。
- GitHub-hosted runner 执行 install/build；目标 self-hosted runner 只下载制品、校验、迁移、切换、reload 和健康检查，不执行源码依赖安装。
- 目标目录为 `/srv/my-sp-pr/<unit>/<environment>`，配置为 `/etc/my-sp-pr/<unit>/<environment>`；保留最近 5 个成功版本。代码可回滚，数据库迁移不自动回滚。
- runner target 首版仅支持 `staging`、`production` 固定 label。目标 runner 只能绑定受控仓库，不运行 PR/fork workflow。

## 7. Gateway 与环境约定

- Gateway 只转发契约和集中 OIDC 清单声明的公开 method/完整路径，使用已配置的固定上游，不接受客户端指定转发目标。
- 保持完整路径、query、编码和原始请求体；不要添加路径重写或任意服务前缀通配代理。
- 代理前不全局执行 JSON 解析，不缓存完整响应，不擅自添加重试或自动跟随重定向。
- 保留正常上游状态、响应头与响应体；连接失败返回 502，超时返回 504。
- 保持客户端取消时终止上游、部分响应失败时关闭连接的行为，不在已开始的响应后追加错误 JSON。
- 当前普通请求的默认总代理期限为 8 秒，SSO portal/Admin OIDC 回调为 20 秒，前端超时为 10 秒；SSE/WebSocket 需要另行设计。
- Gateway 生成并覆盖 X-Request-Id，下游复用；保留外部身份头清理，不把请求追踪字段当作身份。
- 访问日志不包含凭证、完整请求体或 query；修改日志内容时仍须保留已有 console.log。
- 仅 Gateway 管理浏览器 CORS；下游默认绑定 127.0.0.1。CORS 不替代身份鉴权或网络隔离。
- Gateway 生产环境显式配置三个上游 Origin、CORS_ORIGINS 和 SSO_PUBLIC_ORIGIN；不全局启用 Cookie 跨域凭据。协议端点区分公开元数据、顶层导航、仅后端调用；SSO JSON 写操作校验同源和 CSRF。
- 外部 Forwarded/X-Forwarded-* 清除后重建；TRUSTED_PROXY_CIDRS 只列实际入口，AUTH_TRUSTED_GATEWAY_CIDRS 只列 Gateway，入口必须覆盖外来 IP 头，不能信任任意来源。
- 后端读取各自应用目录的 `.env`，进程环境变量优先；新增配置同步维护 `.env.example`。
- 不提交实际 `.env` 或凭证；`VITE_*` 会进入浏览器构建产物，不能包含密钥。
- 调整内部服务端口时同步 Gateway 对应上游配置，前端继续使用统一入口。
- 业务逻辑归属对应服务；Gateway 不承载聊天、管理或身份服务的持久化和业务实现。

详细配置和生产部署步骤见 [README](README.md)。

## 8. 常用命令

以下命令均从项目根目录执行。根据任务选择，不需要每次全部运行。
首次准备环境按 README 安装依赖；不要为无依赖变化的任务反复安装。

| 目的 | 命令 |
| --- | --- |
| 启动七个应用、契约监听及数据库编译监听 | `pnpm dev` |
| 只启动前端组 / 后端组及监听 | `pnpm dev:frontend` / `pnpm dev:backend` |
| 编译契约并生成文档、SDK | `pnpm generate:api` |
| 监听契约并生成 | `pnpm watch:api` |
| 客户端类型检查 | `pnpm --filter @my-sp-pr/pr-chat-web typecheck` |
| 客户端服务类型检查 | `pnpm --filter @my-sp-pr/pr-chat-api typecheck` |
| 编译数据库包 | `pnpm build:database` |
| 首次空库初始化 / 显式串行迁移 | `pnpm db:bootstrap` / `pnpm db:migrate` |
| 单服务离线生成 / 元数据检查 | `pnpm --filter @my-sp-pr/pr-chat-api db:generate` / `db:check` |
| 真实 PG18 临时库验证 | `pnpm verify:database` |
| SSO 协议/并发临时库验证 | `pnpm verify:auth` |
| Admin 会话/发布临时库验证 | `pnpm verify:admin` |
| 发布 manifest 校验 | `pnpm deploy:validate` |
| SSO 密钥/首次管理员 | `pnpm --filter @my-sp-pr/pr-auth-api auth:keys` / `auth:bootstrap <username>` |
| 密码恢复/显式清理 | `pnpm --filter @my-sp-pr/pr-auth-api auth:reset-password <username>` / `auth:cleanup` |
| 生成并检查九个包和工具脚本 | `pnpm typecheck` |
| 生成、类型检查及完整构建 | `pnpm build` |
| 运行已构建后端 / 预览前端 | `pnpm start:backend` / `pnpm preview:frontend` |

独立开发某个前端仍需 Gateway 和对应后端；以下为 pr-chat 示例，各 dev 命令在单独终端运行：

```sh
pnpm generate:api
pnpm build:database
pnpm --filter @my-sp-pr/gateway dev
pnpm --filter @my-sp-pr/pr-chat-api dev
pnpm --filter @my-sp-pr/pr-chat-web dev
```

编辑契约时另开终端运行 `pnpm watch:api`；根 `pnpm dev` 已包含监听，不要重复启动。
单包检查或构建前确认契约及数据库产物存在且最新；业务后端运行前必须配置 DATABASE_URL 并显式迁移。单个前端的 build 只运行 Vite，不能代替 typecheck。

### Lint 范围

执行前列出本次实际修改或新增的手写 JS/MJS/TS/TSX 文件，每个路径作为独立参数。
以下命令仅在列出的两个文件都属于本次变更时使用；实际任务应替换为真实变更路径：

```sh
pnpm lint -- backend/contracts/src/contract.ts frontend/pr-chat/src/hooks/useHealth.ts
```

禁止把目录、glob、未修改文件或整个项目传给 lint；禁止全项目 format/fix，不传 `--fix`。
不对自动生成文件或纯 Markdown 执行代码 lint；生成代码通过类型检查和构建验证。
lint 入口拒绝空参数及选项，具体规则见 `scripts/lint-files.mjs`。

## 9. 按变更选择验证

| 变更类型 | 验证范围 |
| --- | --- |
| 纯文档 | 核对路径、链接、命令与事实，无需代码 lint、类型检查或构建 |
| 单前端局部改动 | 变更文件 lint、对应包类型检查；交互变化验证相关页面、状态和窄屏 |
| 单后端局部改动 | 变更文件 lint、对应包类型检查、受影响 HTTP 请求和错误分支 |
| 契约或跨服务改动 | 生成产物、受影响手写文件 lint、跨包类型检查/构建、经 Gateway 的端到端请求 |
| Gateway 代理改动 | 上述相关检查，加上受影响的未知路由、上游故障、超时、流式和取消场景 |

- 当前没有通用测试框架或 `pnpm test`；数据库集成验证使用 `pnpm verify:database`，SSO 验证使用 `pnpm verify:auth`，Admin 会话/发布验证使用 `pnpm verify:admin`。不把构建通过表述为测试全部通过。
- 为复杂行为选择有实际价值的验证；不要为低影响文案修改新增测试框架。
- 依赖新增先纳入方案；已有手段可验证时优先复用。
- 检查成功后，只有出现新修改、失败或未解决风险才扩大或重复验证。
- 浏览器 API 请求应经 Gateway；健康状态显示实际服务，不使用固定成功文案替代请求结果。
- 测试新增接口时覆盖其批准的成功与失败标准；临时验证数据不混入正式业务接口。
- 数据库故障/权限/回滚验证仅在本轮新建的 `my_sp_pr_verify_*` 库执行，最终清理自己的连接、进程和临时库；不停止用户数据库或终止其他业务连接。

## 10. 可复制的任务模板

尖括号内容由使用者填写，不代表当前已存在的功能或文件。

### 局部修复

```text
先阅读根目录 AGENTS.md。
目标项目：<例如 frontend/pr-chat>
现象与复现：<步骤、错误信息、截图或相关日志>
期望行为：<修复后可观察到的结果>
已知约束：<需要保留的行为；没有则写“沿用项目规则”>
验收：<如何确认问题已经解决>
若属于明确的局部修复，请直接实现并验证；若需扩大到契约、
跨服务或依赖调整，请先说明影响并给出方案。
```

### 新功能

```text
先阅读根目录 AGENTS.md，先规划，确认后实施。
目标用户与场景：<谁在什么情况下使用>
功能目标：<用户可以完成什么>
涉及项目：<前端与后端；不确定时请根据代码提出建议>
业务规则：<权限、输入、状态变化、边界条件>
接口与数据：<已有接口、所需数据、是否需要持久化>
本次范围外：<明确暂不实现的部分>
验收：<成功、失败、加载及空状态的期望>
请先核对现有实现，列出待决策项、变更文件和验证方案。
```

### 跨服务或 API 调整

```text
先阅读根目录 AGENTS.md，先规划，确认后实施。
涉及服务与前端：<项目列表>
现有行为：<调用链、接口和响应>
目标行为：<具体变化>
兼容要求：<是否保留旧行为、已有调用方如何迁移>
公开性与消费者：<哪些接口经网关暴露、哪些前端需要 SDK>
身份与权限要求：<现有能力或需要另行确定的方案>
失败场景：<超时、不可用、非法输入等>
验收：<可执行的检查方法>
请说明契约、各服务、Gateway 和 SDK 的影响，避免遗漏调用方。
```

## 11. 文档维护

本文件记录当前有效约定，不替代用户后续批准的架构决策。
包名、端口、服务边界、契约流程或开发命令发生已批准变化时，同步更新本文件和对应 README 内容。
临时调试记录、一次性计划和逐次任务日志不要追加进长期规则。
参考入口：[README](README.md)、[共享契约](backend/contracts/src/contract.ts)、[根命令](package.json)。
