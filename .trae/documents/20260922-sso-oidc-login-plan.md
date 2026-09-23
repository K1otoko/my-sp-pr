# SSO 登录服务规划：oidc-provider、Antd 登录页与 PG18

状态：已按确认范围完成代码、迁移和本地集成验证。正式部署配置/迁移未执行；HTTPS 跨站与 320/375px 浏览器验收仍待部署环境补验。Chat/Admin 接入后续单独规划。

## 1. 目标与已确认决策

为小规模自用项目实现真实的统一身份服务，用户在同一浏览器中登录一次，在中央会话有效期间访问已接入应用无需再次输入密码。不同浏览器、无痕窗口和其他设备分别登录；7 天有效期不代表永久登录。

用户已确认：

- 用户名和密码登录；不在 SSO 提供注册、设置、账号管理或权限配置页面。
- 当前只有 `admin`（管理员）和 `user`（普通用户）两种角色，没有组织或租户。
- 管理员负责账号和系统管理，不默认获得其他用户私人业务数据的访问权。
- 只实现 SSO；Chat、Admin 正式接入及管理功能后续单独规划。
- 支持直接打开 SSO 登录，而不强制先从其他应用进入。
- 登录最长 7 天，连续 24 小时无认证活动过期。
- “退出登录”结束当前浏览器的中央会话及关联授权；其他设备保持登录。
- 当前同主域部署，未来可能使用不同主域；架构不依赖共享父域 Cookie。

本轮验收使用 SSO 自身客户端及两个临时 OIDC 客户端。验收证明跨客户端复用登录的能力，不宣称尚未接入的 Chat/Admin 已有登录或单点登出。

## 2. 当前实现与变化边界

已读取 `AGENTS.md`、身份服务入口/配置/数据库、Gateway 转发与 CORS、共享契约、SSO 前端和 API 封装。

| 当前事实 | 本次规划 |
| --- | --- |
| `backend/pr-auth` 仅有 health/ready，`src/db/schema/index.ts` 只有 auth Schema | 增加账号验证、OIDC Provider、交互、会话和持久化 |
| `pr-auth/src/app.ts` 全局使用 `express.json()` | 协议回调先处理，只有项目 JSON API 经过 JSON parser |
| `frontend/pr-sso` 是首页/关于/404 骨架，已有 Antd 6 和三态主题 | 替换为专用登录与最小登录状态界面，保留主题能力 |
| Gateway 只转发集中契约的公开方法和 `/api` 路径 | 增加集中声明的 OIDC 协议精确路由，包括根目录 discovery |
| Gateway 不启用跨域 Cookie，请求来源检查全局生效 | 登录使用 SSO 同源 `/api`；协议按端点区分浏览器导航和跨域脚本请求 |
| 同库 auth/chat/admin Schema，数据库运行与迁移账号分离 | 新表全部属于 auth，沿用现有账号和 Drizzle 迁移流程 |
| 上轮 Antd 变更尚未提交 | 实施时保留这些改动，不回滚、不重做其他前端页面 |

以下为需要批准的明确例外：

1. OIDC 标准路由使用协议规定的 JSON、表单、302/303 和 HTML，不使用 `{ success, data }` 包装。
2. 根目录 `/.well-known/*` 路由不符合现有统一 `/api` 前缀，因此增加独立协议路由清单；仍集中在 contracts，仍由 Gateway 精确转发。
3. SSO 的生产浏览器 API 使用站点同源入口；不把跨域 API Origin + 浏览器凭证作为默认接入方式。

不改变：后端端口、服务归属、Gateway 无数据库依赖、独立 Pool、内部 ready 不公开、生成 SDK 边界。

## 3. 推荐架构

### 3.1 职责

| 部分 | 职责 |
| --- | --- |
| SSO React 前端 | 用户名密码表单、交互错误/过期提示、已登录状态、退出确认、主题切换 |
| `pr-auth` 中的 oidc-provider | 授权码、PKCE、中央 SSO Cookie、ID Token、UserInfo、刷新和撤销协议 |
| `pr-auth` 自有业务代码 | 密码校验、账号状态、两角色策略、会话期限、登录限制、审计、PG adapter |
| `pr-auth` 的 portal 模块 | SSO 自身的机密 OIDC 客户端，支持直接登录和查询登录状态 |
| Gateway | 固定上游路由、可信转发头、CORS 与协议响应透传，不保存用户会话或自行签发身份 |
| auth Schema | 用户、中央会话策略、OIDC 状态、登录事务、自身客户端会话、限流和审计 |
| 未来 Chat/Admin 后端 | 各自充当 OIDC 客户端/BFF，保存本应用会话，执行业务授权和数据归属检查 |

采用 **Authorization Code + PKCE S256**。浏览器只持有 HttpOnly 会话 Cookie；OIDC client secret、授权码兑换、ID/Access/Refresh Token 的处理放在后端。SSO 登录页不是需要暴露 client secret 的 SPA OAuth 客户端。

### 3.2 域名与 issuer

- 开发 SSO Origin：`http://localhost:5175`；生产推荐 `https://sso.<主域>`。示例域名用于说明，真实域名由部署配置提供，不写死。
- **issuer 为 SSO 的稳定 Origin，不含路径**。例：`https://sso.example.com`。
- discovery 位于 issuer 根目录；其他 OIDC 端点位于 `/api/auth/oidc/`。
- SSO 站点将 `/api` 和两个精确 discovery 路径原样代理至 Gateway，Gateway 再转发至 pr-auth。
- pr-auth 不负责生产托管 React；继续分别构建部署。Vite 开发代理补齐 discovery。
- 未来 Chat/Admin 即使使用其他主域，仍通过浏览器顶层导航到这个固定 issuer。SSO Cookie 只发往 SSO 域，应用 Cookie 只发往应用域。
- 后续仅迁移应用域名时，更新静态客户端回调白名单。迁移 issuer 域名属于认证迁移，需要重新配置客户端并重新登录，不能承诺旧 Cookie 跨域延续。

### 3.3 两条登录路径

**直接打开 SSO**

1. `/` 查询同源 `GET /api/auth/session`。
2. 已有有效 portal 会话：显示用户名、角色、“已登录”和退出入口。
3. 未登录：通过 `GET /api/auth/portal/start` 启动内置客户端 `pr-sso-portal` 的标准 OIDC 流程。
4. 后端生成 state、nonce、PKCE verifier，并创建有浏览器绑定的 10 分钟登录事务；302 跳到本 issuer 授权端点。
5. 没有中央会话时，Provider 发起登录交互，浏览器进入 SSO 登录页。
6. 登录完成后，Provider 产生授权码，回调 `/api/auth/portal/callback`；后端使用 openid-client 验证 state、nonce、issuer、ID Token、PKCE 和 UserInfo subject。
7. 建立随机不透明的 portal Cookie，303 返回 `/`。portal 会话必须关联中央会话；不从未验证的前端字段建立身份。

内置 portal 只请求 `openid profile roles`，仅使用 authorization_code，不需要长期保存 Access/Refresh Token。回调从已验证的 Provider AccessToken 模型取得 `sessionUid`，关联中央会话策略记录；使用完短期 token 后不暴露给浏览器。此步骤限于同一 pr-auth 进程的内置客户端，未来应用走标准协议。

**从已注册客户端进入**

1. 客户端后端构造 OIDC 授权请求；浏览器顶层跳到 SSO。
2. 中央会话有效且符合该客户端角色准入要求时，直接返回授权码；无需再次输入密码。
3. 无有效会话时展示同一登录表单；登录后返回原客户端的精确回调地址。
4. 自有且明确注册的客户端自动完成已批准 scope 的授权；不向任意第三方客户端静默授权。
5. 未登记的客户端、回调 URI、scope、resource 请求直接拒绝；错误不重定向到未经验证的地址。

## 4. 前端页面与交互

仅修改 `frontend/pr-sso` 的业务页面；不扩展 Chat/Admin 页面。

| 页面/状态 | 行为 |
| --- | --- |
| `/` | 加载真实会话；未登录启动 portal 流程，已登录显示简洁状态 |
| `/login/:uid` | Antd 登录卡片：项目名、可信的目标应用名、用户名、密码、登录按钮 |
| `/logout` | 当前浏览器统一退出确认；属于登录会话流程，不是设置页面 |
| `/auth/error` | 展示固定错误代码对应的中文说明，提供安全重试入口 |
| 未知路由 | Antd Result 404 |

表单使用 Form、Input、Input.Password、Button、Alert、Typography；沿用主色 `#1677FF`、深浅主题和 ThemeSwitcher。去掉登录页上的技术栈、健康卡片与工作台导航；接口 health/ready 继续保留。`AboutPage.tsx` 和旧首页退出 SSO 路由，按实际实现移除无用文件，已有 console.log 不删除。

具体交互：

- 用户名支持 `autocomplete="username"`，密码使用 `current-password`，允许密码管理器、粘贴、显示/隐藏密码。
- 不提供注册、忘记密码、账号设置、角色切换或 Admin 管理页面入口；密码找回暂通过管理员维护命令处理。
- 初始校验 interaction，加载完成后才开放提交；校验失败或过期不显示可用登录表单。
- 密码错误/禁用/账号不存在使用统一失败文案；网络错误保留用户名、清空密码，可重试。
- 提交期间禁止重复提交；这与健康刷新按钮的取消替换语义不同。避免在已发送密码后盲目自动重试。
- 登录成功必须收到后端成功结果后使用浏览器顶层导航到 Provider 返回的 resume 地址；不使用模拟成功状态。
- 不从 query 中接收任意 `returnUrl` 跳转；只允许后端存储的已验证回调与有限站内返回路径。
- 错误、空、加载、失效、限制频率和已登录状态均有真实分支；焦点、回车提交、320/375px 和减少动画纳入验收。
- `api/client.ts` 保持项目 JSON API 专用；OIDC 授权、回调、登出表单和重定向不经过其 JSON response interceptor。

### 4.1 交互 Cookie 与 CSRF

Provider 交互 Cookie 的 Path 必须覆盖用于读取/提交交互的后端路径，不能只覆盖 React `/login/:uid`。

- `interactions.url` 返回 `/api/auth/interactions/<uid>`。
- 该 GET 路由按请求类型区分：顶层导航返回 303 `/login/<uid>`；SDK 的 `Accept: application/json` 返回交互描述；响应带 `Vary: Accept`、`Cache-Control: no-store`。
- `/login/:uid` 用生成 SDK 读取同一后端路径；`POST /api/auth/interactions/:uid/login` 位于同一 Cookie 路径下。
- 服务端 `interactionDetails()` 同时验证 uid 与签名 Cookie。仅知道 uid 无法提交另一浏览器的交互。
- 读取交互时签发绑定 interaction uid、浏览器绑定标识和过期时间的 CSRF token；POST 必须校验它、Origin 精确等于 SSO Origin、JSON Content-Type。
- 登录完成使用公开 `interactionResult()` 返回 `{ resumeUrl }`，前端顶层导航。不修改 oidc-provider 内部源码。
- 本轮不用单个 Cookie 保存唯一 state，避免多个标签页登录互相覆盖：每笔 OAuth 事务独立存储 state/nonce/PKCE，以稳定的随机浏览器绑定 Cookie 校验归属。
- 防重复提交和完成操作在数据库执行条件更新/事务；已完成交互不可被并发请求重新写成其他身份。

## 5. OIDC 协议配置

2026-09-22 已从 npm 和官方文档核实候选版本：

| 依赖 | 用途 |
| --- | --- |
| `oidc-provider@9.12.2` | Provider，ESM，支持现有 Express 5 挂载 |
| `@types/oidc-provider@9.12.1` | TypeScript 类型，声明支持 TS 5.6+ |
| `openid-client@6.8.8` | portal 与临时验证客户端的标准客户端实现 |
| `jose@6.2.12` | JWK 生成与标准 JWT 校验的直接依赖，仅在手写代码直接使用时声明 |

安装时锁定精确版本，校验 Node24/当前 TS5.9 编译；不顺带升级框架。密码 KDF、随机数、散列和存储加密使用 Node crypto。无 Redis、新共享 UI 包或认证平台依赖。

### 5.1 开关、token 和客户端

- `devInteractions.enabled=false`，包括开发环境。官方开发交互接受任意凭证，不能用于本项目真实登录。
- response_types 仅 `code`；所有客户端强制 PKCE S256；不开放 implicit、password grant、动态客户端注册、设备流、client credentials 或实验特性。
- 关闭本轮不使用的 PAR、DPoP、request objects、resourceIndicators 等默认可启用扩展，避免暴露未登记路由。
- 启用 UserInfo、introspection、revocation、RP-Initiated Logout。
- 静态客户端文件配置 client_id、名称、完整 redirect_uris、post_logout_redirect_uris、allowedRoles、精确 scope；机密客户端使用 `client_secret_basic`。Secret 仅在后端受保护配置中。
- 当前生产只需要 `pr-sso-portal`。两个验证客户端只在测试配置启用。未来 `pr-chat`、`pr-admin` 注册信息待正式接入时增加，不开放空回调、通配符或客户端自行注册。
- ID Token：RS256 签名、5 分钟，用于客户端登录验证，不能当作业务 API access token。
- Access Token：不透明随机 token、5 分钟；适合当前小规模、需要在线撤销的系统。本轮仅用于 UserInfo，不签发尚未定义的业务资源权限。
- 验证客户端可启用 refresh_token；每次使用强制轮换，生命周期受中央会话剩余绝对期限限制。显式覆盖 `issueRefreshToken`，仅允许登记的机密客户端，不开放 `offline_access`。
- `expiresWithSession=true`；刷新 token 不得绕过中央会话空闲/绝对期限或重置后的账号凭证版本。
- `sub` 使用稳定用户 UUID，不使用可修改的用户名。`profile` 返回 `preferred_username`、`name`；`roles` 返回单元素 `roles: ["admin"]` 或 `["user"]`。
- `openid/profile/roles` 表示客户端可获得哪些身份信息，**不等同于管理员业务权限**。
- `findAccount` 必须加载真实用户、状态和当前角色；账号不存在、被禁用或客户端角色要求不满足时拒绝授权/兑换/刷新。
- introspection 额外检查中央会话和账号状态。默认只允许机密客户端查询自己的 token，不沿用“所有机密客户端可以查询所有 token”的宽松默认策略。

### 5.2 精确公开端点

新建 `backend/contracts/src/auth-oidc.ts`，集中声明协议路由的 method、绝对外部 path、名称、auth 上游和浏览器访问性质；不生成页面 JSON SDK。导出给 pr-auth 和 Gateway 复用。

| 方法 | 外部路径 | 用途 |
| --- | --- | --- |
| GET | `/.well-known/openid-configuration` | OIDC discovery |
| GET | `/.well-known/oauth-authorization-server` | OAuth metadata |
| GET | `/api/auth/oidc/jwks` | 公钥 |
| GET | `/api/auth/oidc/authorize` | 授权请求 |
| GET | `/api/auth/oidc/authorize/{uid}` | Provider resume，不能遗漏 |
| POST | `/api/auth/oidc/token` | 授权码兑换、刷新 |
| GET、POST | `/api/auth/oidc/userinfo` | 身份声明 |
| POST | `/api/auth/oidc/introspect` | 在线 token 检查，机密客户端认证 |
| POST | `/api/auth/oidc/revoke` | token 撤销，机密客户端认证 |
| GET | `/api/auth/oidc/logout` | 发起协议登出 |
| POST | `/api/auth/oidc/logout/confirm` | Provider 防 CSRF 登出确认 |
| GET | `/api/auth/oidc/logout/success` | 无客户端回跳时的结果处理 |

标准 discovery 的精确路径之所以无需重写，是因为 issuer 采用 Origin，Provider callback 挂在 pr-auth 根层，`routes` 配置使用上表完整路径。根层挂载只在命中的协议清单中调用 callback，其余路径继续进入项目 Router；不使用 `/api/auth/*` 任意通配转发。

OPTIONS 由 Gateway 按端点策略处理；保留允许 GET 的 HEAD 语义。协议成功及协议错误保持原始规范格式；Gateway 自身的 502/504 仍为基础设施错误，客户端不能把这类响应视为 OIDC 成功。

### 5.3 Gateway 和部署调整

- 复用现有代理传输与取消/超时逻辑，增加协议路由注册入口，不复制另一套代理实现。
- 透传所有 Set-Cookie 值、Location、WWW-Authenticate、缓存头、表单原始字节与状态码；不修改 Cookie Domain、路径或重定向目标。
- 清除外部伪造身份头，同时清除未经信任的 Forwarded、X-Forwarded-* 等代理元数据。从经过配置的可信入口重建 proto/host/ip，供 Provider 使用 `proxy=true`。
- 配置可信反代 IP/网段；直连 Gateway 时不信任客户端自带 X-Forwarded-For。登录限流不能根据可伪造头取 IP。
- pr-auth 保持内网监听，生产入口拒绝错误 Host；不能根据任意请求 Host 推导 issuer。
- discovery/JWKS 可公开 GET，允许无凭证读取；authorization/logout 是顶层导航，不用全局 CORS Origin 白名单阻止合法跨主域跳转。
- token/introspection/revocation 只给后端使用，不向任意浏览器 Origin 开放 CORS；UserInfo 本轮同样只由后端消费。
- interaction/session/logout JSON API 使用 SSO 同源请求、CSRF 校验，`credentials` 使用同源默认行为。Gateway 仍统一管理浏览器 CORS，不全局启用 `credentials:true`。
- 保留其他业务路由当前行为，禁止未知协议路径；ready 仍不暴露。
- Vite 5175 同源代理、生产 Nginx 示例、SPA 回退和可信代理配置同步写入 README/.env.example。

## 6. 会话、退出与失效

### 6.1 三类状态

1. **中央 SSO 会话**：Provider Cookie 标识 + Provider Session 持久化 + 自有期限记录，是跨客户端免输密码的依据。
2. **portal 会话**：SSO 自身“已登录”页面的随机 Cookie，关联中央会话，不独立延长中央登录。
3. **未来应用会话**：由 Chat/Admin 后端各自维护，后续接入时实现；不能仅凭前端缓存的用户对象判定登录。

生产 Cookie 均 Secure、HttpOnly、SameSite=Lax、无 Domain。中央长会话和 portal/browser-binding Cookie 在 Path=/ 时使用 `__Host-` 名称；交互 Cookie 有窄 Path，使用 `__Secure-` 前缀。HTTP localhost 使用独立开发名称，不错误套用要求 Secure 的前缀。

中央期限：`absolute_expires_at = authenticated_at + 7 天`，`idle_expires_at = last_activity_at + 24 小时`；任一超过均失效。Cookie 或 token 的续期不得突破绝对期限。

“活动”定义为成功的、由真实使用触发的授权/portal 会话访问/UserInfo/刷新；单纯 introspection、健康检查、无效登录和后台保活轮询不续期。未来应用避免用定时刷新永久维持空闲状态。最后活动写入可合并至每 5 分钟一次，失效校验仍每次执行；该合并可能让空闲期限最多提前 5 分钟，不晚于期限。

授权码 60 秒、登录交互和 portal 登录事务 10 分钟、ID/Access Token 5 分钟。Grant 和 RefreshToken 最大期限都受所在中央会话约束。超过期限必须明确拒绝，不能把 0/负 TTL 传给 Provider，也不能用 `Math.max(1, ...)` 复活已过期会话。

### 6.2 登出

- portal 的“退出登录”启动标准 RP-Initiated Logout，之后在 Antd `/logout` 页面给出一次明确确认，含义是当前浏览器关联的全部应用。
- 公开 `logoutSource` 将已生成的 Provider xsrf、固定 confirm action、中央 uid 和 10 分钟期限保存为 `browser_transactions` 的 logout 记录，绑定当前浏览器随机 Cookie，再 303 到 `/logout?flow=<随机ID>`。ID 不包含 xsrf 或用户信息。
- React 使用生成 SDK 读取 `GET /api/auth/logout/context/{id}`，后端验证 flow 类型/期限/浏览器绑定/关联中央会话；返回受控 client 展示名、xsrf 和固定本站 confirm action。缺少或错误绑定不能读取。Provider 的 xsrf 从受控 `ctx.oidc.session.state` 读取，按已锁定版本写集成测试；不把整个 HTML form 注入 React。
- 点击确认时用原生同源 POST form 提交 xsrf 和 `logout=yes` 到协议 confirm 路由，让 Provider 执行会话 Cookie 与 xsrf 校验。Antd Button 使用 `htmlType="submit"`；取消只返回固定站内页面，不提交退出操作。对应短期 flow 在完成/过期后清理。
- Provider 退出完成后标记中央会话已撤销、撤销该会话全部 Grants/Access/Refresh Token，清理关联 portal 会话和 Cookie，回到固定登录页。
- 本轮不启用 back-channel HTTP 通知，避免引入暂未接入的应用端点和投递系统；以在线会话检查/introspection 得到撤销状态。临时客户端验收“下一次认证/受保护请求被拒绝”。
- 后续 Chat/Admin 必须实现本地会话与中央撤销联动；如需多个应用的已打开页面立即变为退出状态，再单独增加 back-channel logout。SSO 不能直接删除其他域的应用 Cookie。
- 不把本地删除 Cookie 当作全局登出成功。中央服务或数据库故障时显示失败、允许重试。

### 6.3 账号变更

- users 维护 `auth_version`。重置密码、禁用账号、角色改变时递增版本，并撤销该用户全部中央会话及授权。
- 每次有效性校验检查用户状态和版本；这样被禁用或降权后不能靠旧 ID Token 快照继续通过在线检查。
- 普通用户绝不能在登录 body、URL、Cookie 或 localStorage 自选角色。
- 账号管理 HTTP API 本轮不实现；上述操作封装为身份域服务供初始化/维护命令与未来 Admin 复用。

## 7. 权限模型

### 7.1 当前采用固定两角色

`auth.users.role` 是受约束的 `admin | user`，默认 user。不创建 tenants、organizations、roles、permissions、user_roles、role_permissions 等配置表。

| 能力 | 普通用户 | 管理员 | 实施阶段 |
| --- | --- | --- | --- |
| 登录、查看本人登录状态、退出当前浏览器 | 允许 | 允许 | 本轮 |
| 使用已接入的普通应用 | 允许 | 允许 | SSO 准入可验证，真实应用后续接入 |
| 进入仅管理员可用的客户端 | 拒绝 | 允许 | 本轮用临时客户端验证 |
| 创建/禁用账号、重置密码、切换两种角色 | 拒绝 | 允许 | Admin HTTP/API/UI 后续 |
| 撤销用户全部设备会话、查看安全审计 | 拒绝 | 允许 | Admin 后续；本轮提供存储及域逻辑基础 |
| 修改系统设置 | 拒绝 | 允许 | Admin 后续 |
| 查看其他用户私人聊天内容 | 默认拒绝 | 默认拒绝 | 对应业务服务按数据所属用户检查 |

后端集中定义角色策略，不在组件中散落 `username === "admin"` 之类判断。用户名可以是任何符合规范的值，只有数据库 role 决定角色。

### 7.2 后续权限代码建议

后续 Admin 接口实现时使用细分权限名称，例如：

- `admin:access`
- `identity:users:read`、`identity:users:create`、`identity:users:update`、`identity:users:disable`
- `identity:passwords:reset`、`identity:roles:assign`、`identity:sessions:revoke`
- `system:settings:read`、`system:settings:update`、`audit:read`

届时固定映射 admin → 已实现的管理权限；user → 普通应用权限。当前不签发这些尚未实现的管理权限，也不搭建可编辑的权限管理系统。

判断次序为：身份有效 → 客户端/资源符合 → 角色或权限允许 → 数据归属符合。Gateway 的路由公开性、SDK clients、CORS 都不能代替这些检查。角色声明是身份快照；服务端在线检查及数据库状态决定当前有效权限。

未来 Admin 页面虽负责“管理账号”，账号和凭证仍归 pr-auth 的 auth Schema。Admin 经受保护内部 API 调身份服务，不写 auth 表、不重复维护密码、也不跨 Schema 联表。具体内部鉴权与 Admin 接入在后续方案中完成。

最后一个有效管理员不能被禁用、删除或降为 user；将来批量变更也必须在事务中检查该约束。本轮维护服务与测试先覆盖。

## 8. 数据库规划：全部位于 auth Schema

只有用户少，不代表协议状态可以放进进程内存。以下 7 张表各司其职；不按每种 OIDC token 拆表，不增加 Redis。

| 表 | 主要字段/约束 | 用途 |
| --- | --- | --- |
| `users` | UUID PK；username_normalized 唯一；display_name；password_hash；role CHECK；status CHECK active/disabled；auth_version；password_changed_at；last_login_at；created_at/updated_at | 账号、密码摘要、固定角色和禁用状态 |
| `auth_sessions` | UUID PK；provider_uid_hash 唯一；user_id FK；auth_version；authenticated_at、last_activity_at、idle_expires_at、absolute_expires_at；revoked_at | 中央会话期限、账号版本和撤销依据 |
| `oidc_artifacts` | PK(model,id_hash)；加密 payload；uid_hash、grant_id_hash、session_uid_hash、user_id、client_id 索引；expires_at、consumed_at、revoked_at | Provider Session/Interaction/Grant/Code/AT/RT 等统一 adapter 存储 |
| `browser_transactions` | 随机 ID hash PK；kind CHECK login/logout；登录 state_hash 唯一；browser_binding_hash；加密 nonce/verifier 或 logout xsrf；固定 redirect_uri/action；expires_at；consumed_at | portal OIDC 请求/回调和退出确认交接，防重放/多标签串号 |
| `portal_sessions` | 随机会话 token 的 hash PK；user_id FK；auth_session_id FK；csrf_secret；created_at、expires_at | 内置客户端的已登录状态；不暴露 OIDC token |
| `login_rate_limits` | PK(bucket_type,bucket_hash)；window_start、count、blocked_until、expires_at | 跨进程持久化用户名/IP 限流，账号不存在也限流 |
| `auth_audit_logs` | UUID PK；event、user_id 可空、client_id、request_id、结果/受控原因码、IP 摘要、受限 UA、created_at | 登录成功/失败、限制、退出、密码重置、禁用、角色变更 |

所有时间使用 timestamptz/UTC；索引覆盖用户会话、uid、grant、过期清理和审计时间查询。FK 只在 auth 内部，不连接 chat/admin Schema。

用户名建议 3–32 位 ASCII，首位字母，其余字母/数字/点/下划线/连字符；trim 后转小写并唯一，展示名独立。密码 15–128 个字符，不 trim、不偷偷规范化、不强制周期修改或复杂字符组合。

密码使用异步 `crypto.scrypt`，初始参数 N=131072/r=8/p=1、至少 16 字节随机 salt、64 字节输出，格式中保留版本与参数；恒定时间比较。设置有上限的 KDF 并发（初始 2）与内存限制，部署验证耗时/内存，不能让大量请求无限创建 KDF 任务。

### 8.1 Adapter 的关键语义

- 实现官方接口 `upsert/find/findByUid/findByUserCode/consume/destroy/revokeByGrantId`；当前关闭的模型也有明确拒绝/空结果行为。Client 仅从静态配置加载，adapter 不动态创建 Client。
- 所有查找验证 TTL、撤销状态、关联用户/会话版本；不能只等待定时任务删行才失效。
- 将完整敏感 payload 用 AES-256-GCM 加密保存，记录 key id/nonce/tag；独立配置加密 key ring，AAD 绑定 model/id_hash。token/cookie 原值不作为明文索引。
- Session 有无账号的阶段分开：未完成身份验证的临时 Session 不创建已认证 auth_sessions。首次真实认证后按稳定 provider uid 建立会话策略；更新时保留绝对期限。新一次真实密码认证才可开启新的期限，同时撤销旧认证轮次的关联授权。
- Grant 对当前会话的关联来自服务端 Provider 上下文；各 token 使用 Provider `sessionUid`，不接受客户端传入的用户/会话归属。
- `consume` 使用条件 UPDATE/RETURNING，只有未消费且未过期记录可成功。并发失败要显式抛 Provider 的标准 InvalidGrant；不把返回 false 当作 Provider 自动拒绝，Provider 不检查这种返回值。
- 授权码或刷新 token 重放触发相关 Grant 撤销。保留 consumed/revoked 标记至安全清理期限，不能用无条件 upsert 清掉 consumed。
- revokeByGrantId 在事务中标记 Grant 及关联 artifacts 撤销；后续同 Grant 的写入要检查撤销标记，防止在途兑换在撤销之后重新插入有效 token。
- 会话撤销、账号 auth_version 改变与 token/session 写入使用一致事务锁顺序，避免在途操作复活旧会话。多实例不依赖内存锁保证一次性语义。
- 事务中不包含外部 HTTP 调用；数据库失败拒绝登录/兑换，不回退到内存成功。
- 新增可显式执行的维护命令：分批清理过期 artifacts/transactions/sessions/rate buckets，审计默认保留 90 天。清理不在启动、health 或 ready 中运行；多实例用服务 advisory lock 防重复并发清理。

### 8.2 初始化与迁移

- Drizzle Kit 生成增量 SQL/journal/snapshot；追加迁移，不改已执行的 `0000/0001`，不用 push/reset。
- 使用现有 auth migrator 迁移，HTTP 与初始化业务命令使用 auth app 的 DML 权限；不改变其他五个数据库角色。
- 增加 `auth:bootstrap`：在已迁移的空账号库内事务创建首个 admin；遇到已有用户则拒绝。用户名显式传入，密码用隐藏终端输入或受保护输入流，不能出现在命令参数、日志或 Git。
- 增加 `auth:reset-password` 维护命令，使用同一密码和撤销服务，解决本轮无 Admin UI 时的密码恢复。
- 不安装固定 admin/admin 密码，不在迁移中插入明文密码，不把测试用户带入正式库。普通用户、禁用用户和验证客户端由临时库测试 fixture 创建。
- `db:bootstrap` 与本次 `auth:bootstrap` 区分：前者初始化数据库账号，后者创建产品登录用户。现有数据库不重复执行首次建库流程。

## 9. 登录保护、密钥和运维

- 账号不存在仍执行 dummy hash 校验；账号不存在、密码错、禁用账号外部均返回统一 401 文案，具体原因只记录在受控审计。
- 初始登录限制：同用户名每 15 分钟失败 5 次后冷却 15 分钟；同可信 IP 每 15 分钟最多 30 次尝试。采用原子预留尝试计数后执行 KDF，避免并发请求全部绕过阈值。返回 429 与 Retry-After。
- 有界 KDF 并发忙时返回 429/受控繁忙错误，不无限排队；错误日志不记录密码、Cookie、授权码、token、完整 URL query 或原始 OIDC 错误对象。
- 成功登录写审计和 last_login_at；关键状态变化与审计尽量同事务，禁止先回复成功再悄悄丢失状态。
- 所有 JSON 登录/会话响应 `no-store`；登录页面和交互使用 Referrer-Policy: no-referrer，禁止第三方分析脚本，防 iframe 嵌入；HTTPS 由生产入口保证。
- 签名 JWK、Cookie 签名 key ring、payload 加密 key ring、CSRF/审计 HMAC key 分别配置，不能共用。没有生产密钥时启动失败，不能临时生成后仍宣称生产可用。
- JWK 轮换：先发布新公钥、再切换签名、最后在验证缓存与最长相关存活期结束后移除旧 key；Cookie/加密旧 key 保留到最长 7 天状态过期及清理完成。多实例使用同一套有效配置。
- 长期不持有数据库管理员/迁移凭据；不记录或复用历史会话中用户提供的数据库连接串。
- 每个请求仍沿用 8 秒 Gateway 期限；portal token 兑换/UserInfo 请求设置子请求超时和客户端取消，不在请求期间无限重试或从外部 issuer 自动发现。
- portal 使用固定本机 Provider 的标准 metadata 配置构造 openid-client，不在 pr-auth 启动前向尚未启动的自身 discovery 发 HTTP 导致死循环；临时/未来外部客户端从固定 issuer discovery。
- readyness 增加身份表/迁移版本与必要配置检查；保留“首次数据库不就绪不监听、运行中 ready=503、health 仅存活”的约定。
- MVP 不包含 MFA/Passkey、验证码或邮件服务；后续可为管理员加入二次验证，而不改变 OIDC 客户端协议。

## 10. 文件与实施步骤

以下新路径基于现有目录分层设计；实施前再次核对实际工作区。

### 10.1 身份服务

| 文件/目录 | 改动 |
| --- | --- |
| `backend/pr-auth/package.json` | 精确依赖；auth bootstrap/reset/cleanup/verify 命令 |
| `src/app.ts`、`src/server.ts` | 创建 Provider、协议/JSON 分流、初始化检查和退出清理 |
| `src/config/env.ts`、`.env.example` | SSO_PUBLIC_ORIGIN、可信代理、客户端文件、密钥文件和期限/限制配置 |
| 新 `src/oidc/provider.ts`、`config.ts` | 单例 Provider 构建、协议选项、claims/Grant/账户钩子 |
| 新 `src/oidc/adapter.ts`、`client-registry.ts` | PG adapter 与静态客户端策略 |
| 新 `src/oidc/interaction.ts`、`logout.ts` | interactionDetails/Result、自动批准自有 scope、标准退出确认衔接 |
| 新 `src/auth/password.ts`、`policy.ts`、`csrf.ts`、`storage-crypto.ts` | KDF、固定角色策略、CSRF、持久化加密 |
| 新 `src/services/account.service.ts`、`session.service.ts`、`login.service.ts`、`audit.service.ts` | 身份业务与失效规则 |
| 新 `src/repositories/` | 用户、会话、artifact、flow、限制、审计的数据库访问 |
| 新 `src/portal/client.ts`、`session.ts` | 内置 OIDC 客户端、事务与 portal Cookie |
| 新 `src/routes/interaction.routes.ts`、`session.routes.ts`、`portal.routes.ts`、`logout.routes.ts` 与对应 controllers | 薄 HTTP 路由与契约校验 |
| `src/db/schema/index.ts`、新各表定义文件、`drizzle/` | 7 表与索引，导出进入现有 Drizzle 配置 |
| 新 `src/scripts/bootstrap-auth.ts`、`reset-password.ts`、`cleanup-auth.ts` | 部署维护命令，不增加管理 UI |
| 新 `scripts/verify-auth.ts`、`tests/` | 临时库/临时客户端/关键域逻辑验证 |

### 10.2 契约与 Gateway

| 文件 | 改动 |
| --- | --- |
| `backend/contracts/src/auth.contract.ts` | 项目 JSON API 与 portal redirect 操作定义 |
| 新 `backend/contracts/src/auth-oidc.ts` | 协议精确路径与路由性质清单；无假 JSON 包装或普通 SDK |
| `backend/contracts/src/shared.ts` | AuthUser/role/会话/交互 Schema；必要错误码与协议路由类型 |
| `backend/contracts/src/contract.ts` | 仅导出/聚合新定义 |
| `backend/gateway/src/app.ts` | 按协议端点区分 CORS/导航行为 |
| `backend/gateway/src/proxy/register-proxies.ts` | 复用代理注册逻辑消费协议清单，保持原始数据和多 Set-Cookie |
| `backend/gateway/src/middlewares/request-context.ts` | 可信代理元数据处理，保留已有日志 |
| `backend/gateway/src/config/env.ts`、`.env.example` | 可信入口与 SSO Origin 配置 |
| `scripts/generate-api.ts` | 仅在现有生成器无法描述新增协议参考时调整；协议由 discovery 描述，不伪造 REST SDK |

项目 JSON API 初稿：

| 操作 | 输入与结果 |
| --- | --- |
| `GET /api/auth/interactions/{uid}` | JSON 模式：client 展示名、prompt、expiresAt、csrfToken；导航模式 303 |
| `POST /api/auth/interactions/{uid}/login` | username/password + CSRF；成功 `{ resumeUrl }` |
| `GET /api/auth/session` | `authenticated:false` 或真实用户/单一角色/会话期限/CSRF；不返回 token |
| `POST /api/auth/logout` | 校验 portal Cookie/CSRF，返回固定 issuer 的标准登出启动地址；完成退出由 Provider confirm |
| `GET /api/auth/logout/context/{id}` | 校验退出 flow 与浏览器绑定，返回 Provider xsrf、固定 form action 和展示信息 |
| `GET /api/auth/portal/start` | 创建登录事务后 302，不是 JSON SDK |
| `GET /api/auth/portal/callback` | 校验标准 OIDC 回调，成功 303；无前端直接调用 SDK |

必要业务错误：INVALID_CREDENTIALS、INTERACTION_EXPIRED、INVALID_INTERACTION、INVALID_INPUT、CSRF_INVALID、UNAUTHENTICATED、FORBIDDEN、RATE_LIMITED、AUTH_FLOW_INVALID、AUTH_UNAVAILABLE。协议错误保持标准 OAuth/OIDC error。不得将全部 Zod/输出错误映射为 400。

SSO JSON 消费者仅 `pr-sso`。重新生成后其他 SDK 若因共享错误类型更新而变化，一并检查，不手改生成文件。协议根路径不混入现有 `/api` fullPath 算法。

### 10.3 SSO 前端与文档

- `frontend/pr-sso/src/App.tsx`：替换专用登录路由。
- `src/components/AppLayout.tsx`：改为简洁认证布局；保留 ThemeSwitcher、语义与焦点。
- 新 `src/pages/LoginPage.tsx`、`SessionPage.tsx`、`LogoutPage.tsx`、`AuthErrorPage.tsx`；调整 404。
- 新 `src/hooks/useInteraction.ts`、`useLogin.ts`、`useSession.ts`；沿用 ahooks、超时/取消与真实状态。
- `src/api/client.ts`：同源登录 API、保留可区分的业务错误码与 HTTP 状态；不处理协议表单/回调。
- `src/project.ts`、`index.html`、必要局部样式：更新产品文案、登录主题布局，不改统一主题架构。
- `vite.config.ts`、`.env.example`：同源 API 与两个 discovery 路径代理。
- `AGENTS.md`、`README.md`：同步已实现身份能力、路由例外、Cookie/issuer、迁移及维护命令；移除对应“登录尚未实现”的旧描述，继续标明 Admin/Chat 未接入。
- 根 `pnpm-lock.yaml` 由 pnpm 更新；不手工修改 SDK/OpenAPI/dist。

### 10.4 实施顺序

1. 保护已有 Antd 改动；建立依赖和协议配置的编译最小切片，验证根 issuer、挂载和路由清单一致。
2. 建立 Schema、增量迁移、密码/账号/会话策略、adapter，先验证一次性消费与期限。
3. 接入 Provider、固定客户端、交互、portal OIDC 客户端和会话 JSON API。
4. 调整 Gateway 精确协议路由与可信代理，生成项目 JSON 契约 SDK。
5. 开发 SSO 登录/状态/退出页面和失败分支。
6. 完成初始化/重置/清理命令、实际协议集成验收和文档。

## 11. 验证与验收

### 静态与构建

- 只 lint 本轮实际修改或新增的手写 JS/MJS/TS/TSX，显式逐文件列出；不对目录/glob/未修改文件或生成代码 lint。
- `pnpm generate:api`；受影响 contracts、pr-auth、Gateway、pr-sso 类型检查和构建，生成内容影响其他前端时补对应类型检查。
- Drizzle 元数据检查；测试全新库和已有命名空间库的增量迁移。不把构建通过称为登录验证通过。

### 真实 PostgreSQL 与并发

- 仅在本轮新建 `my_sp_pr_verify_*` 数据库验证。创建并最终清理连接、客户端进程、验证 Cookie/密钥文件和库；不对现有业务库运行破坏性故障测试。
- 验证密码摘要与统一失败响应、角色默认 user、唯一用户名、账号禁用、最后一个管理员约束。
- Provider 状态跨进程重启保留；两实例同授权码/刷新 token 并发兑换至多一个成功。
- 验证消费标记不能被 upsert 覆盖、Grant 撤销与在途签发竞争、过期记录不可复活、数据库故障拒绝成功。
- 密码重置、角色变化和禁用后的旧会话/旧 token 立即在在线检查中失效。
- 时间边界使用受控时钟/临时短 TTL 验证，不靠真实等待 7 天。

### 协议与浏览器

- 通过 Gateway 验证 discovery/JWKS 的 issuer/端点一致，Set-Cookie/Location/表单/错误响应透传。
- 直接打开 SSO，真实用户名密码登录，回调校验后才显示已登录；刷新和重启后保持有效会话。
- 临时客户端 A 输入密码登录；同浏览器访问 B 不再要求密码；新浏览器仍要求登录。
- 临时 admin-only 客户端：user 被拒绝，admin 允许；伪造角色、错误 audience/issuer、未登记 scope 或回调不能提权。
- 错误密码、不存在/禁用账号、限流、CSRF、过期 interaction、丢失 Cookie、错误 state/nonce/verifier、授权码重放、多标签不同 state、任意 return URL 全部覆盖。
- 退出当前浏览器后其关联授权和 portal 失效；另一设备保持登录。中央退出失败不能显示全部退出成功。
- 深浅/系统主题、键盘和焦点、320/375px、表单自动填充、失败与恢复；控制台无新增弃用/组件错误。
- 客户端取消、上游故障和超时仍正确；多 Set-Cookie 不丢失；原 health/ready/未知路由等行为不回归。
- 未来跨主域能力通过两个不同站点测试域和 HTTPS 验证顶层 OIDC 导航，不只用 localhost 的不同端口代替跨站验证。
- 如浏览器沙箱或部署域名阻止某项验证，明确记录实际覆盖与未完成项，不冒充已验证。

## 12. 本轮完成后与后续边界

本轮完成：可直接登录的 SSO 前端、oidc-provider 服务、持久化、两角色基础、中央会话/退出、部署维护命令及两个临时客户端的真实协议验收。

后续 Chat：后端机密客户端/BFF、浏览器本地会话、真实业务 API 鉴权和数据归属。

后续 Admin：管理平台登录接入、创建/禁用/重置用户、角色切换、全设备下线、审计和系统设置；通过身份服务 API 操作账号，不直接连接 auth Schema。

参考： [oidc-provider 官方文档](https://github.com/panva/node-oidc-provider/blob/main/docs/README.md)、[官方仓库](https://github.com/panva/node-oidc-provider)、[openid-client](https://github.com/panva/openid-client)、[OIDC Core](https://openid.net/specs/openid-connect-core-1_0.html)、[RP-Initiated Logout](https://openid.net/specs/openid-connect-rpinitiated-1_0.html)。

## 13. 实施与验证记录

- 实现入口：`oidc/provider.ts`、`oidc/adapter.ts`、`repositories/auth-store.ts`、`portal/client.ts`、`controllers/auth.controller.ts`；前端为 Login/Session/Logout/AuthError，Hook 合并在 `useAuth.ts`。旧首页/关于页退出路由，保留此前未提交的文件修改。
- `0002_sso_identity` 创建七表；保留已有 0000/0001。bootstrap、reset-password、generate-keys、cleanup 已提供；当前不创建真实业务用户，也不注册 Chat/Admin 客户端。
- 48 个本轮手写变更文件显式路径 lint 通过；最后修正的三个文件另行 lint 通过。九包及脚本类型检查完成，其中新增验证代码的 JWKS 类型修正后单独复查 pr-auth 通过。
- 契约生成成功且重跑无差异；pr-auth/Gateway 构建通过，SSO Vite 构建通过（主 JS 约 870 kB，gzip 281 kB，有体积告警）；Drizzle 元数据检查通过。
- 在本轮独立 PG18.4 临时集群运行 `pnpm verify:auth`：真实授权码/PKCE/JWT/UserInfo、A/B 免输密码、设备隔离、admin 准入、portal、多标签 state、重启保留、当前浏览器退出、CSRF/统一密码错误/限流、错误 scope/redirect/nonce/verifier/issuer/audience、双实例 code/refresh 竞争、Grant 撤销竞争、角色/禁用/密码重置、绝对/空闲/存储 TTL、强制重新认证均通过。
- 网关回归验证多 Set-Cookie、Location、WWW-Authenticate、编码 query、伪造代理/角色头清理、流式、取消、502/504、生产错误 Host 拒绝及健康/ready 边界。
- 原 `verify:database` 已适配动态迁移数量和临时身份密钥，在三服务真实临时库通过迁移回滚、DML/DDL 权限、连接/查询超时、数据库故障/恢复、故障时登录不能成功、启动失败、信号及退出期限验证。
- 真实浏览器经独立同源入口验证错误密码清空、成功登录、刷新保持、深色主题和键盘主题菜单、退出确认/完成、失效请求无可提交表单。有效流程无组件弃用错误；主动触发的过期请求有预期 ApiError 日志。
- 浏览器发现原生退出 form 在 no-referrer 下发送 Origin:null。退出确认页现改为 same-origin referrer policy，离开即恢复；保留严格 Origin 和 Provider xsrf 校验，跨站不发送引用信息。这是实现阶段的明确兼容调整。
- 浏览器工具本轮可用视口约 663px，未提供视口调整能力；未完成 320/375px、系统主题动态变化及减少动画的本轮专项重验。未提供真实不同站点 HTTPS 域名，跨站 Cookie/生产 TLS 尚未验收；不能把 localhost 多客户端测试表述为跨站验收。
- 所有验证账户/密钥均仅存在临时库与忽略目录；正式库迁移、生产密钥生成和初始化管理员由部署步骤显式完成。启用步骤见 README 的 SSO 章节。
- 收尾已确认临时库清空，停止并删除本轮临时 PG18 集群/二进制、浏览器入口及测试文件；5189/3209/3109/55432 临时端口均已关闭。用户既有进程未停止。
