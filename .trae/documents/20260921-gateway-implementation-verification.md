# Gateway 统一入口实施与验收记录

日期：2026-09-21。环境：macOS、Node.js 24.20.0、pnpm 10.25.0。

## 交付

- 三个前端：`frontend/pr-chat`、`frontend/pr-admin`、`frontend/pr-sso`。
- 四个后端：`backend/gateway`、`backend/pr-chat`、`backend/pr-auth`、`backend/pr-admin`。
- 内部契约包：`backend/contracts`，唯一手写入口为 `src/contract.ts`。
- 契约生成四份 OpenAPI、三个前端 SDK；Gateway 按公开契约转发。
- 已更新根启动命令、构建、监听、环境变量示例及 README。
- 本次交付健康检查与项目骨架；账号、登录、权限、聊天及管理业务未实现。

## 验证结果

| 检查 | 结果与证据 |
| --- | --- |
| 工作区与安装 | 七个应用及一个契约包；冻结锁文件安装成功。旧 frontend/backend 根应用入口已迁移。 |
| 构建 | 默认 `pnpm build` 与指定统一生产 API 地址的构建均成功；八个工作区包及工具脚本类型检查通过。 |
| 限定 lint | 仅检查下列 84 个本次修改或新增的手写文件。生成器一处未使用变量已修复，单文件复检通过；临时契约修改与恢复也均执行单文件 lint。 |
| 根开发启动 | `pnpm dev` 启动七个应用及一个契约监听器。三个 Vite 代理均通过 3000 返回对应下游服务名。 |
| 路由 | 四个健康路径正常；未知路由、相似服务前缀、重复 `/api` 与未声明方法返回 404；GET 的 HEAD 请求正常。 |
| 请求解析 | 使用 Node HTTP 的 GET body 验证 Gateway 自身与下游的非法 JSON 400、100kb 超限 413。 |
| CORS | 三个开发 Origin、预检、无 Origin 请求通过；非法 Origin 返回 403；代理 502/504 保留正确 CORS 头。生产配置缺失及非法 Origin、上游自环、非法超时均阻止启动。 |
| 代理保真 | 临时上游确认 query 编码、原始请求体、方法、状态码、响应头和内容不被改写；418、503、307 原样返回，不跟随重定向。 |
| 流式与故障 | 首块内容在结束前到达；上游重置返回 502；无响应返回 504；持续发送内容仍受总代理期限约束；部分响应失败关闭连接且不追加 JSON；客户端取消会释放上游连接。边界测试将期限缩短为 450ms。 |
| 请求追踪 | Gateway 覆盖外部请求 ID、剥离三个身份头；响应与下游日志复用 UUID。日志不包含 query、Authorization 和请求体。 |
| 故障隔离 | 停止 pr-chat 后，仅 chat 路由返回 502；其他下游及 Gateway 自身保持正常。恢复 pr-chat 后无需重启 Gateway，页面重试成功。 |
| 契约热更新 | 临时新增 Schema 字段后，四份文档、三份 SDK 和契约 JS 更新；四个后端 PID 均变化，证明实际重启。 |
| 内部接口 | 临时将 chat 健康接口设为 internal、清空 clients，下游仍返回 200，Gateway 返回 404，公开文档和所有 SDK 均不包含此操作。 |
| 失败恢复 | 临时注入类型错误、重复 operationId，显式生成与根构建均失败。上次成功产物的内容和 mtime 均未改变；恢复后监听器自动生成并重启服务。 |
| 生成稳定性 | 契约恢复后，54 个生成文件内容与原始快照一致；重复生成更新 0 个文件，mtime 保持不变。 |
| 开发浏览器 | 三个品牌与对应服务名正确；首页刷新、关于页、404 正常；585px 窄屏无横向溢出；SSO 明确提示未接入登录且无登录表单。 |
| 生产浏览器 | 4173/4174/4175 分别展示 pr-chat/pr-admin/pr-auth；实际 fetch URL 均为 `http://localhost:3000/api/...`，未直连下游端口。 |
| 独立部署 | `pnpm deploy --prod --legacy` 分别打包 gateway 与 pr-chat。使用 Node 模块加载钩子禁止加载各打包目录之外的文件后，两者仍可启动并转发健康请求。 |

legacy deploy 额外生成的包自身索引符号链接指向原工作区；当前生产入口未使用该索引。上述独立运行验证检查的是实际加载的全部运行依赖，契约包和 Express 等依赖均来自各自打包目录。

所有临时契约字段已还原；恢复默认 `/api` 构建。测试进程、临时上游、浏览器测试页和临时打包、验证目录在收尾时清理。

## Lint 文件范围

以下路径在执行时作为独立参数传给 `pnpm lint --`；未使用目录、glob 或全项目 lint，也未移除原有 console.log。

```text
backend/contracts/src/contract.ts
backend/gateway/src/api/index.ts
backend/gateway/src/app.ts
backend/gateway/src/config/env.ts
backend/gateway/src/config/upstreams.ts
backend/gateway/src/controllers/health.controller.ts
backend/gateway/src/middlewares/error-handler.ts
backend/gateway/src/middlewares/not-found.ts
backend/gateway/src/middlewares/request-context.ts
backend/gateway/src/proxy/proxy-error.ts
backend/gateway/src/proxy/register-proxies.ts
backend/gateway/src/routes/health.routes.ts
backend/gateway/src/routes/index.ts
backend/gateway/src/server.ts
backend/gateway/src/services/health.service.ts
backend/gateway/src/utils/app-error.ts
backend/pr-admin/src/api/index.ts
backend/pr-admin/src/app.ts
backend/pr-admin/src/config/env.ts
backend/pr-admin/src/controllers/health.controller.ts
backend/pr-admin/src/middlewares/error-handler.ts
backend/pr-admin/src/middlewares/not-found.ts
backend/pr-admin/src/middlewares/request-context.ts
backend/pr-admin/src/routes/health.routes.ts
backend/pr-admin/src/routes/index.ts
backend/pr-admin/src/server.ts
backend/pr-admin/src/services/health.service.ts
backend/pr-admin/src/utils/app-error.ts
backend/pr-auth/src/api/index.ts
backend/pr-auth/src/app.ts
backend/pr-auth/src/config/env.ts
backend/pr-auth/src/controllers/health.controller.ts
backend/pr-auth/src/middlewares/error-handler.ts
backend/pr-auth/src/middlewares/not-found.ts
backend/pr-auth/src/middlewares/request-context.ts
backend/pr-auth/src/routes/health.routes.ts
backend/pr-auth/src/routes/index.ts
backend/pr-auth/src/server.ts
backend/pr-auth/src/services/health.service.ts
backend/pr-auth/src/utils/app-error.ts
backend/pr-chat/src/api/index.ts
backend/pr-chat/src/app.ts
backend/pr-chat/src/config/env.ts
backend/pr-chat/src/controllers/health.controller.ts
backend/pr-chat/src/middlewares/error-handler.ts
backend/pr-chat/src/middlewares/request-context.ts
backend/pr-chat/src/routes/health.routes.ts
backend/pr-chat/src/routes/index.ts
backend/pr-chat/src/server.ts
backend/pr-chat/src/services/health.service.ts
backend/pr-chat/src/utils/app-error.ts
eslint.config.mjs
frontend/pr-admin/src/App.tsx
frontend/pr-admin/src/api/client.ts
frontend/pr-admin/src/components/AppLayout.tsx
frontend/pr-admin/src/hooks/useHealth.ts
frontend/pr-admin/src/main.tsx
frontend/pr-admin/src/pages/AboutPage.tsx
frontend/pr-admin/src/pages/HomePage.tsx
frontend/pr-admin/src/pages/NotFoundPage.tsx
frontend/pr-admin/src/project.ts
frontend/pr-admin/src/vite-env.d.ts
frontend/pr-admin/vite.config.ts
frontend/pr-chat/src/components/AppLayout.tsx
frontend/pr-chat/src/hooks/useHealth.ts
frontend/pr-chat/src/pages/AboutPage.tsx
frontend/pr-chat/src/pages/HomePage.tsx
frontend/pr-chat/src/project.ts
frontend/pr-chat/vite.config.ts
frontend/pr-sso/src/App.tsx
frontend/pr-sso/src/api/client.ts
frontend/pr-sso/src/components/AppLayout.tsx
frontend/pr-sso/src/hooks/useHealth.ts
frontend/pr-sso/src/main.tsx
frontend/pr-sso/src/pages/AboutPage.tsx
frontend/pr-sso/src/pages/HomePage.tsx
frontend/pr-sso/src/pages/NotFoundPage.tsx
frontend/pr-sso/src/project.ts
frontend/pr-sso/src/vite-env.d.ts
frontend/pr-sso/vite.config.ts
scripts/api-projects.ts
scripts/generate-api.ts
scripts/lint-files.mjs
scripts/watch-api.ts
```
