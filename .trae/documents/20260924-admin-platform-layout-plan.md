# Admin 平台级布局调整计划

## Summary

将 `frontend/pr-admin` 调整为桌面端平台级后台布局：

- 顶部固定为 Header，左侧放品牌与平台横向标签，右侧保留主题和账号操作。
- 平台标签首期包含 `Dashboard` 和 `部署平台`，并可在后续继续扩展。
- `Dashboard` 作为整个 Admin 的总览入口，当前只展示空状态，不请求或展示现有健康、账号卡片。
- `部署平台` 继续承载现有发布项目、发布记录及其详情流程，左侧显示对应菜单。
- Dashboard 下隐藏左侧菜单区域；部署平台下显示左侧 Menu 和右侧业务展示区。

本次只调整 Admin 前端的信息架构和桌面布局，不修改接口、鉴权、数据库或部署逻辑。

## Current State Analysis

- `frontend/pr-admin/src/components/AppLayout.tsx`
  - 当前已经使用 Ant Design `Layout` 形成 Header、Sider、Content。
  - Header 只有品牌、主题和用户菜单，没有平台级导航。
  - Sider 将“概览”“发布项目”“发布记录”“关于”平铺在同一级。
  - 普通 `admin` 已隐藏发布菜单，`super` 才能看到发布入口。
  - 窄屏通过 Drawer 展示同一组菜单。
- `frontend/pr-admin/src/App.tsx`
  - `/` 对应当前概览页面。
  - `/deploy/*` 对应部署平台，已有 `SuperGate` 保护。
  - `/about` 是独立页面；本次只移除可见入口，保留该路由兼容旧地址。
- `frontend/pr-admin/src/pages/HomePage.tsx`
  - 当前展示账号身份、发布权限和 Admin API 健康状态。
  - 用户已确认改为带标题的 Dashboard 空状态。
- `frontend/pr-admin/src/styles/index.css`
  - 已有 Header、Sider、内容面板和主题变量样式，可在现有 Ant Design 6 蓝灰主题上增补平台导航样式。
- 当前没有共享 UI 包，也不需要新增依赖。

## Proposed Changes

### 1. 重组平台级 Header 与条件侧栏

文件：`frontend/pr-admin/src/components/AppLayout.tsx`

- 根据当前路径推导平台：
  - `/deploy` 及其子路由属于 `deployment`。
  - `/`、保留的 `/about` 和未知路由按 `dashboard` 处理。
- 将 Header 拆成三个清晰区域：
  - 品牌区：保留 `PR Admin` 标识并返回 Dashboard。
  - 平台导航区：使用 Ant Design 横向 `Menu` 展示 `Dashboard`、`部署平台`。
  - 操作区：保留主题切换、当前用户和退出登录。
- 平台标签行为：
  - `Dashboard` 跳转 `/`。
  - `部署平台` 跳转 `/deploy/projects`。
  - 访问任意 `/deploy/*` 子路由时，`部署平台` 保持选中。
  - 仅 `super` 显示 `部署平台`；普通 `admin` 只显示 `Dashboard`。
- 将左侧菜单改为部署平台的局部导航，只保留：
  - `发布项目`：`/deploy/projects`
  - `发布记录`：`/deploy/deployments`
- 只有当前路径属于部署平台时才渲染桌面 Sider；Dashboard、About 和 404 页面不占用侧栏宽度。
- 从可见导航中移除“关于”，但不删除页面和 `/about` 路由。
- 保留 skip link、语义化 `nav`、选中态、键盘导航及现有用户退出行为。
- 保留现有部署菜单 Drawer 作为已有窄屏行为，但只在部署平台路由显示菜单按钮和 Drawer；本次不新增手机端平台切换方案，也不以手机布局作为验收范围。

### 2. 将首页改为 Dashboard 空状态

文件：`frontend/pr-admin/src/pages/HomePage.tsx`

- 页面标题改为 `Dashboard`，作为整个平台总览入口。
- 移除当前账号、发布权限、Admin API 健康状态和“进入发布模块”卡片。
- 移除该页面对 `useAdminSession`、`useHealth` 和发布入口路由的调用，确保空 Dashboard 不触发健康检查请求。
- 使用 Ant Design `Empty` 展示“暂无总览数据”，保留后续添加总览模块的内容区域。
- 不删除 `useHealth.ts` 或后端健康接口，避免把布局需求扩大为功能清理。

### 3. 补充桌面布局样式

文件：`frontend/pr-admin/src/styles/index.css`

- 为 Header 品牌区、横向平台菜单和操作区补充稳定尺寸与边界样式。
- Header 横跨整个页面宽度，不按 Sider 宽度切分品牌区；部署 Sider 仅从 Header 下方开始。
- 横向平台菜单使用现有 Ant Design Token 和主题变量，保持浅色、深色主题一致，不引入新的固定色板。
- 去除横向 Menu 不需要的默认背景或多余边框，保留明确的选中态和焦点态。
- Content 在有无 Sider 时都保持现有最大宽度、间距和滚动行为。
- 不增加独立手机断点设计；仅避免本次桌面样式影响现有最小宽度规则。

### 4. 路由和业务保持兼容

文件核对：`frontend/pr-admin/src/App.tsx`

- 预计无需修改路由定义。
- 保持 `/`、全部 `/deploy/*`、`/about` 和错误页地址不变。
- 保持 `SessionGate` 和 `SuperGate` 权限边界不变，不能只依赖导航隐藏实现授权。
- 不修改发布页面、生成 SDK、后端契约或 Gateway。

## Assumptions & Decisions

- 平台名称固定显示为 `Dashboard` 和 `部署平台`。
- 桌面端使用 Header 横向标签，不使用下拉、九宫格或平台首页卡片。
- Dashboard 下隐藏 Sider；部署平台下显示 Sider。
- Dashboard 当前显示标题和空状态，不显示账号、健康或模拟统计数据。
- 普通 `admin` 不显示部署平台标签；直接访问 `/deploy/*` 仍由现有 `SuperGate` 返回 403。
- 点击“部署平台”默认进入 `/deploy/projects`。
- “关于”仅移除导航入口，保留路由兼容。
- 手机端需要单独设计，本次不做适配或专项验收。
- 不新增依赖，不修改共享契约，不改变现有发布业务。

## Verification

### 静态检查

仅对本次实际修改的手写代码运行 lint：

```sh
pnpm lint -- frontend/pr-admin/src/components/AppLayout.tsx frontend/pr-admin/src/pages/HomePage.tsx
```

CSS 不传给代码 lint；其有效性和视觉结果通过构建及浏览器验收检查。

执行 Admin 前端类型检查和构建：

```sh
pnpm --filter @my-sp-pr/pr-admin-web typecheck
pnpm --filter @my-sp-pr/pr-admin-web build
```

### 桌面交互验收

在桌面视口验证：

1. `super` 登录后，Header 显示 `Dashboard`、`部署平台` 两个横向标签。
2. 打开 `/` 时 `Dashboard` 选中，不显示左侧 Sider，右侧显示 Dashboard 标题和“暂无总览数据”。
3. 点击 `部署平台` 后进入 `/deploy/projects`，显示左侧“发布项目”“发布记录”菜单。
4. 在项目、环境、发布详情等嵌套路由中，Header 的 `部署平台` 和对应侧栏项保持正确选中。
5. 主题切换、用户菜单、退出登录和部署业务交互保持可用。
6. 普通 `admin` 只看到 `Dashboard`；直接访问 `/deploy/*` 仍显示现有无权限页面。
7. `/about` 仍可直接打开，但 Header 或 Sider 不再显示“关于”入口。
8. 检查浅色和深色主题下 Header、Sider、分隔线、选中态和正文背景。

本次不执行手机端布局验收；若本地身份服务或数据库配置不足以完成真实登录浏览器验证，需要在结果中明确说明，并至少完成 lint、类型检查和构建。
