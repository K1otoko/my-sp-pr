# PG18 + Drizzle 实施验收记录

日期：2026-09-22  
结果：实施完成，下述检查通过。

## 交付范围

- 新增 `@my-sp-pr/database`，提供配置、连接池、Drizzle、真实就绪探测和带 advisory lock 的显式迁移。
- Neon PostgreSQL **18.6 (6569466)** 已建立六个专用登录角色；三个服务分别使用 auth/chat/admin Schema、运行账号、迁移账号和迁移记录。
- 三个服务首次数据库检查通过才监听 HTTP；运行中通过内部 ready 检查数据库；退出先关闭 HTTP，再关闭 Pool。
- 共享契约、生成产物、开发监听、构建及部署命令、PM2 退出期限、README 和 AGENTS 已同步。
- 本次不包含业务表、登录、账号、会话或聊天功能。

## 静态检查与构建

| 检查 | 实际结果 |
| --- | --- |
| 显式路径 lint | 47 个本次新增或修改的手写代码文件通过；后续验证脚本修正与临时监听改动恢复后，仅复查对应文件 |
| 类型检查 | `pnpm build` 中的 `typecheck:code` 检查九个 workspace 包及工具脚本，通过 |
| 完整构建 | `pnpm build` 通过，含接口生成、类型检查、前端 Vite 及后端 TypeScript 构建 |
| 无旧产物构建 | 暂存移走 contracts/database 的 dist 后执行完整构建，通过；产物已重新生成，备份已清理 |
| 迁移元数据 | 三个服务 `db:check` 均通过 |
| 重复生成 | 三个服务 `db:generate` 均报告无 Schema 变化、0 张业务表 |
| 公开接口边界 | ready 只出现在对应下游 OpenAPI；Gateway 与三个前端 SDK 无 readiness 操作 |
| 差异检查 | `git diff --check` 通过；原有启动、关闭及监听日志保留 |

没有执行全项目 lint、format 或 fix；没有对生成文件执行 lint。

## 真实云端集成验证

通过 `backend/database/scripts/verify.ts` 执行，管理员凭据仅由本地环境映射传入。每轮新建唯一 `my_sp_pr_verify_*` 数据库，故障注入和验证数据均位于本轮临时库。

| 场景 | 实际结果 |
| --- | --- |
| 初始化及迁移重跑 | 三个服务独立完成迁移；重复执行后各保留 2 条记录 |
| 并发迁移 | 持有 auth 锁时 auth 第二执行者失败；chat 仍可独立迁移 |
| 迁移失败回滚 | 故意失败的测试迁移未留下业务表或成功记录 |
| ORM | 三个运行账号通过 Drizzle 完成参数化增查改删、事务回滚；含 SQL 特殊字符的值按数据处理 |
| 权限 | 运行账号不能建表、建 Schema、建临时表、TRUNCATE、跨域读写或读取/修改迁移历史 |
| 默认授权 | 迁移账号新建验证表和 serial 序列后，运行账号立即获得预期 DML/序列权限 |
| 连接身份 | 错误角色、目标库名和 Schema 未就绪会被拒绝 |
| 超时 | 连接池获取、服务端 statement timeout、驱动 query timeout 均有界失败 |
| 连接恢复 | readiness 失败会销毁连接；恢复 Schema 授权后可重新连接并通过检查 |
| HTTP | 三个 ready 返回符合契约的 200/no-store；经 Gateway 的四条 health 正常，ready 均为 404 |
| 断连与恢复 | 分别撤销临时库三个 app 账号的 CONNECT 并终止其本轮连接：ready 返回 503，health 仍为 200；恢复授权后 ready 回到 200 |
| 启动失败 | 缺少 URL、错误密码、错误角色、不可达端口、未迁移 Schema 均非零退出且未开始 HTTP 监听 |
| 退出 | 三个服务正常信号退出；另覆盖重复信号、启动握手期间信号、端口冲突以及持有 Pool 连接导致的 10 秒强制退出 |

验证期间修正了测试夹具：撤销 Schema USAGE 必须使用原授权的迁移账号，管理员直接 REVOKE 不会撤掉其他 grantor 的授权。修正后全部集成断言通过。

## 部署与开发链路

- 使用 `pnpm deploy --prod --legacy` 生成 auth 和 Gateway 独立部署包，确认含所需 dist、SQL/meta、workspace 依赖，且未打入 `.env`。依赖真实路径均在部署包内部。
- 在源码目录之外作为工作目录，以独立产物和 production 环境完成 auth 迁移、ready 检查、Gateway 健康转发及内部接口 404 检查。两个临时部署包已删除。
- 启动实际契约 watcher、database TypeScript watcher 和 auth dev 进程；拆分契约变更触发生成及服务重启，database 源码变更触发编译及服务重启，重启后 ready 为 200。
- 开发监听前后迁移记录一致，没有自动迁移。临时标记、生成标记和自己启动的监听进程均已清理。

## 最终状态与范围说明

- 最终只读复查：项目库三个运行账号均真实就绪；本轮连接及查询合计耗时约 auth 688ms、chat 1120ms、admin 805ms。这是数据库已唤醒状态的单次测量，不是冷启动或性能基准。
- 项目 auth/chat/admin Schema 中没有业务表或测试表；云端没有遗留 `my_sp_pr_verify_*` 数据库。
- 根管理员环境文件及三个服务环境文件均为 0600 权限、被 Git 忽略；扫描交付文件未发现实际密码。
- PG17 版本拒绝分支使用模拟身份查询结果验证；没有连接真实 PG17 实例。
- 独立打包及开发监听的运行验证使用 auth 作为业务服务代表；三个服务的真实数据库、权限、HTTP 与故障恢复已分别验证。
- 未进行远程生产部署、Neon 休眠唤醒测试、压测或浏览器界面测试。
- TLS 保持证书和主机校验；pg 8 的 channel binding 仅支持协商，不能把 URL 的 require 解释为强制协商成功，详见 README。

当前本地凭据与项目库迁移已配置完成，可直接运行 `pnpm dev`。
