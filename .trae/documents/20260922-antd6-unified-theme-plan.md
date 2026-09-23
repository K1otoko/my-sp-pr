# Ant Design 6 接入、统一主题与设计规范实施计划

状态：实现完成，静态检查与可用浏览器验证完成；受环境限制的验收项见第 7 节。用户已进一步要求安装 Antd 6，并将现有 UI 调整为 Antd 组件，据此执行本计划。

## 1. 目标与已确定决策

以用户最新要求为准：

> 本次确定设计规范，同时更新agents.md文件 约定后续优先使用antd的组件

后续明确指令：

> 顺便帮我安装antd v6 同时将现在的UI 调整为使用antd组件

本次交付覆盖 `frontend/pr-chat`、`frontend/pr-admin`、`frontend/pr-sso` 的组件与主题接入，以及根目录 `AGENTS.md` 的前端设计约定：

- 安装 Ant Design 6，将现有首页、关于页、404 与布局内的基础 UI 迁移到 Antd；后续 UI 优先使用其组件。
- 采用 Antd 简洁蓝灰风格，统一主色与深浅色设计规范。
- 主题目标为“浅色 / 深色 / 跟随系统”，默认跟随系统，各应用分别记忆偏好。
- 聊天、管理、登录等模块的功能、布局和交互在后续任务中分别设计。

保持现有页面内容组织、路由、请求 Hook、Gateway 和服务边界，不新增业务模块或业务演示数据。

## 2. 当前状态

已检查根目录规则、三个前端的 `package.json`、入口、路由、布局、页面和样式：

- 三个前端使用 React 19、Vite 8、Tailwind CSS 4 和 ahooks，尚未安装 Antd。
- 现有页面使用浅色背景与绿色强调色，没有深浅色主题切换。
- `AGENTS.md` 第 5 节已有组件组织、品牌配置、请求流程、可访问性和依赖变更约定，但没有 Antd 优先级或统一配色。
- 三个应用独立，没有共享 UI 包；继续遵守现有包边界。

以上是实施前基线。完成组件和主题接入后，文档按实际交付更新，不提前宣称未验证能力。

## 3. 设计规范

### 组件与布局

- 按钮、表单、输入框、选择器、表格、分页、导航、弹层和反馈等基础 UI，在 Antd 6 能满足需求时优先直接使用其组件。
- 页面结构继续使用语义化 HTML 和 React 组件；业务组件可以组合 Antd，不为每个 Antd 组件增加无实际用途的包装层。
- Tailwind 主要负责布局、间距和响应式；组件外观优先通过 Antd Token 与公开样式接口定制。
- 采用清晰层级、克制阴影和统一间距。各业务模块的具体布局与信息密度后续单独确定。

### 颜色与尺寸

| 语义 | 浅色 | 深色 |
| --- | --- | --- |
| 品牌主色种子 `colorPrimary` | `#1677FF` | 同一主色种子，由暗色算法派生交互色 |
| 页面背景 `colorBgLayout` | `#F5F5F5` | `#141414` |
| 内容区背景 `colorBgContainer` | `#FFFFFF` | `#1F1F1F` |
| 浮层背景 `colorBgElevated` | `#FFFFFF` | `#1F1F1F` |
| 文字、边框、分割线、状态色 | 使用 Antd 默认算法生成的语义 Token | 使用 Antd 暗色算法生成的语义 Token |

默认采用 Antd 系统字体栈、14px 基础字号、6px 基础圆角、8px 大圆角、32px 控件高度和 4px 间距基准。主色用于品牌、主要操作和选中状态，成功、警告和错误保留各自语义色。

### 主题行为目标

- 提供浅色、深色、跟随系统三种偏好；初次访问默认跟随系统。
- 各应用在浏览器中独立保存选择，同一应用的同源标签页同步偏好；不要求跨端口、跨域或账号同步。
- 手动选择不被系统变化覆盖；系统模式实时响应系统主题。
- 页面背景、导航、组件和弹层共同适配主题；处理首次加载闪烁、存储失败回退和减少动画偏好。
- 新增或调整 UI 时同时考虑两种主题的可读性、焦点和状态区分。

以上是本次主题实现的验收方向；具体模块的功能与布局仍在后续单独设计。

### 接入方式与文件职责

- 三个前端分别安装精确版本 `antd@6.6.5`、`@ant-design/icons@6.3.4`、`@ant-design/cssinjs@2.1.2`，由包管理器更新根锁文件。这些版本和兼容范围已于 2026-09-22 从 npm 核实。
- Antd 6 原生支持 React 19，不添加 v5 兼容补丁；保留现有框架和依赖版本。
- 各应用独立维护主题文件，不创建共享 UI 包，不跨应用导入源码。
- 在 `src/theme/config.ts` 集中类型、颜色与 ThemeConfig；`src/theme/theme-store.ts` 管理三态偏好、系统颜色、减少动画与持久化；`src/hooks/useTheme.ts` 使用 `useSyncExternalStore` 订阅稳定快照。
- 在 `src/theme/ThemeProvider.tsx` 组织 StyleProvider（layer）→ ConfigProvider（中文语言与主题）→ Antd App（保留 DOM 根节点）。从 ConfigProvider 内通过 `theme.useToken()` 将主题语义值暴露给页面 CSS。
- 在 `src/components/ThemeSwitcher.tsx` 使用 Dropdown + Button，顶栏统一提供三态选项与当前状态，支持键盘操作。
- `src/project.ts` 增加稳定应用标识，分别使用存储键 `my-sp-pr:pr-chat:theme`、`my-sp-pr:pr-admin:theme`、`my-sp-pr:pr-sso:theme`；非法值、删除键或读取失败回到系统偏好，媒体查询不可用则回退浅色。保存失败不阻断本次切换。
- 同步同应用的 storage 事件，正确清理订阅；主题更新不更换路由或页面的 key，不重置健康请求。
- `index.html` head 的短小同步脚本先读取偏好，设置 html 主题属性、color-scheme 与 theme-color；初始背景 CSS 与主题配置一致，避免硬刷新时浅色闪烁。
- `src/styles/index.css` 使用 `@layer theme, base, antd, components, utilities;` 后导入 Tailwind；不额外导入未分层的 reset.css。固定的页面颜色改为主题语义变量。
- 保留减少动画 CSS，并通过主题 `token.motion` 反映系统减少动画偏好。
- 现有首页使用 Typography、Card、Badge、Button、Descriptions、Alert 等；保留加载、错误、成功、空状态。刷新仍可替换正在进行的请求，避免 Button loading 意外禁用现有刷新能力。
- 布局导航使用 Menu 与 Router Link；关于页使用对应排版/分割/信息组件；404 使用 Result。保留语义元素和跳转到主内容链接，不嵌套可交互元素。
- 使用 Antd 6 新 API，如 Alert.title、Card.variant、Descriptions.items，避免弃用属性。

## 4. AGENTS.md 的具体修改

### 4.1 调整第 5 节现有样式约定

将：

> 品牌配置集中在各自 `src/project.ts`；沿用现有布局、Tailwind CSS 和样式类。

替换为：

> 品牌配置集中在各自 `src/project.ts`；后续 UI 按本节的 Ant Design 6 与主题设计规范开发，Tailwind CSS 主要用于布局、间距与响应式。现有页面在相关开发任务中按范围逐步适配。

### 4.2 在第 5 节追加以下长期规范

插入位置：现有前端规则列表之后、客户端调用示例之前。

拟写入的正文：

> ### UI 组件与主题设计规范
>
> - 后续新增或调整 UI 时，优先使用 **Ant Design 6（Antd 6）**。按钮、表单、输入、选择、表格、分页、导航、弹层和反馈等基础能力，Antd 已满足需求时不重复实现。确有不足时说明原因，优先组合或适度扩展现有组件。
> - 三个前端通过各自的主题 Provider 统一接入 Antd。主题配置集中在各自 `src/theme/`，页面优先使用主题 Token，实际依赖版本以 package.json 和锁文件为准。
> - 三端统一采用 Antd 简洁蓝灰风格。品牌主色种子为 `#1677FF`；浅色页面背景 `#F5F5F5`、内容区与浮层背景 `#FFFFFF`；深色页面背景 `#141414`、内容区与浮层背景 `#1F1F1F`。
> - 主题通过 `ConfigProvider` 集中配置，浅色采用 `theme.defaultAlgorithm`，深色采用 `theme.darkAlgorithm`。文字、边框、分割线、交互色和成功/警告/错误状态使用对应语义 Token，避免在页面中散落固定颜色。
> - 默认使用 Antd 系统字体栈，基础字号 14px、基础圆角 6px、大圆角 8px、控件高度 32px，以 4px 为间距基准；具体业务布局和信息密度在对应模块设计中确定。
> - 主题支持“浅色 / 深色 / 跟随系统”，默认跟随系统；各应用独立记忆偏好，同一应用的同源标签页同步。手动选择不被系统主题变化覆盖，系统模式实时响应变化。
> - 页面背景、导航、内容区和弹层必须共同适配主题；处理首次加载闪烁、存储不可用回退，并保留键盘焦点、窄屏布局和减少动画偏好。主题切换不得重置业务状态或触发无关请求。
> - Tailwind CSS 负责布局、间距与响应式；Antd 外观优先通过 Token 及公开的 `styles` / `classNames` 调整。接入时显式处理 Tailwind 与 Antd 的样式层级，不依赖组件内部 DOM 或大范围覆盖样式。
> - 消息、通知和确认框通过 Antd `App` 上下文获取实例，保证继承当前主题；使用 Antd 6 支持的 API，不沿用已废弃写法。
> - 保持三个前端的包边界，不直接跨应用导入 UI 源码。聊天、管理、登录等模块的功能与页面单独设计；规范更新本身不要求批量重写现有页面。

### 4.3 保留的规则与事实

- 安装完成后在第 2 节实际技术栈补充 Antd 6，核对新增主题路径。
- 保留 API 经 Gateway、组件目录、请求取消、可访问性、lint 范围、已有 `console.log` 等规则。
- 保留第 3 节的协作流程和新增依赖规则，本轮已获授权的依赖接入不重复确认。
- README 同步组件、主题行为及配置位置，运行命令与后端说明保持一致。

## 5. 文件与实施步骤

| 文件 | 本次操作 |
| --- | --- |
| `AGENTS.md` | 按第 4 节调整一条样式规则，加入组件与主题规范 |
| `README.md` | 同步实际接入后的组件和主题说明 |
| 三个前端 `package.json`、根 `pnpm-lock.yaml` | 安装并锁定 Antd 及配套依赖 |
| 各应用 `src/theme/config.ts`、`src/theme/theme-store.ts`、`src/theme/ThemeProvider.tsx`、`src/hooks/useTheme.ts`、`src/components/ThemeSwitcher.tsx` | 新增主题实现 |
| 各应用 `src/main.tsx`、`src/project.ts`、`index.html`、`src/styles/index.css` | 接入 Provider、标识与首屏样式 |
| 各应用 `src/components/AppLayout.tsx`、三个 `src/pages/` 文件 | 现有 UI 迁移与主题适配 |
| 本计划文件 | 记录本次已确定的范围、配色和拟写入条款 |

实施步骤：

1. 重新读取 `AGENTS.md` 和 Git 状态，保留当时已有改动。
2. 安装三个前端的依赖，先完成 pr-chat 的主题与现有 UI 迁移。
3. 将同一规范落到 pr-admin、pr-sso，保留各自品牌信息与健康 Hook。
4. 更新 AGENTS.md 和 README 的直接相关约定。
5. 完成静态检查、构建和浏览器验证，清理本轮临时资源并报告实际结果。

## 6. 验收

- `AGENTS.md` 明确后续优先使用 Antd 6，现有 Tailwind 约定与之不冲突。
- 主色、深浅背景、字体尺寸、三态主题和独立记忆规则完整、清晰。
- 文档区分已接入的 UI/主题与尚未实现的业务功能。
- 只对本轮实际修改或新增的手写 JS/MJS/TS/TSX 文件运行显式路径 `pnpm lint -- ...`；禁止目录/glob/未修改文件/生成文件、全项目 lint、format 或 fix。保留已有 console.log。
- 分别执行三个前端包的 `typecheck` 与 `build`，不将构建等同运行时验证；无需对无关后端运行测试或数据库验证。
- 浏览器覆盖三端首页、关于、404 的深浅色与 320/375px 窄屏；验证三态切换、刷新记忆、系统变化、非法/禁用存储、同应用标签同步、三端独立偏好和首屏背景。
- 验证导航、菜单、焦点、减少动画、弹层上下文；控制台没有新增错误和弃用警告。普通文字对比度目标至少 4.5:1。
- 真实健康请求仍经过 Gateway 到各自服务；覆盖加载、错误、恢复与刷新替换，主题切换不得额外请求。网络拦截可验证失败/空状态，但必须与真实成功请求分开报告。
- 优先复用现有服务，需要时只启动自己的验证进程；不修改数据库或运行迁移。完成后清理自己的临时组件与进程，不停止用户已有服务。
- 不自动提交或部署；报告所有实际检查及未验证范围。

参考依据：[主题定制](https://ant.design/docs/react/customize-theme-cn)、[Antd 6 与 React 19 兼容说明](https://ant.design/docs/react/migration-v6-cn)、[Tailwind 样式兼容](https://ant.design/docs/react/compatible-style-cn)、[App 上下文](https://ant.design/components/app-cn)。

## 7. 实际交付与验证记录

- 三端安装 `antd@6.6.5`、`@ant-design/icons@6.3.4`、`@ant-design/cssinjs@2.1.2`，锁文件已更新。
- 三端现有布局、首页、关于页、404 已迁移；主题 Provider、偏好存储、首屏脚本和三态菜单已接入，AGENTS.md 与 README 已同步。
- 对比度检查后，在集中配置中将辅助文字映射至 `colorTextSecondary`；文字链接、菜单选中态及主按钮选用同一算法色板的更清晰色阶。保留主色种子。修正菜单选择与 Escape 后的焦点返回，404 使用公开样式接口减少窄屏内边距。
- 初次 33 个变更手写文件 lint 通过；后续修改的 9 个文件定向复检通过。三前端最终 typecheck 与 build 均通过，`git diff --check` 通过。
- 构建仍有单包大小提示：各应用主 JS 约 833.5 KB，gzip 约 268.2 KB；未通过提高警告阈值隐藏提示。
- 内置浏览器确认三端首页真实请求分别经 `/api/chat/health`、`/api/admin/health`、`/api/auth/health` 返回 200；主题切换不增加健康请求。验证首页、关于与 404 路由、深浅切换、刷新记忆、同应用实际标签页同步、三端偏好独立、键盘选择和 Escape 返回焦点。
- 663px 浏览器视口下检查到的页面没有水平溢出；暗色 404 页面抽查普通文字与按钮对比度均超过 4.5:1。加载状态在真实导航中可见。
- 临时隔离脚本对三端真实主题源代码与首屏脚本进行验证：默认系统、手动优先、系统变化、减少动画、非法/删除/不可用存储、存储事件隔离与清理、稳定快照均通过。真实 HomePage 在隔离 Hook 输入下的加载、错误、空结果和成功渲染通过，加载中刷新保持可用；这些属于隔离验证，未当作真实 API 故障恢复验证。
- 尚未完成浏览器实测：320/375px、系统媒体仿真、禁用存储首屏、实际请求取消及故障恢复、独立消息/通知/Modal 弹层。内置浏览器没有这些仿真接口，独立 Chrome 启动被沙箱限制。未修改数据库、未停止已有服务。
- 浏览器日志未观察到 Antd 弃用或 React 组件错误；快速导航产生过资源 `net::ERR_ABORTED`，因此不宣称所有控制台日志为空。
