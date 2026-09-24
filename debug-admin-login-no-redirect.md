# Debug Session: admin-login-no-redirect
- **Status**: [OPEN]
- **Issue**: Admin 页面点击“前往统一登录”后没有自动完成 OIDC 跳转并建立 Admin BFF 会话。
- **Debug Server**: http://127.0.0.1:7777/event
- **Log File**: `.dbg/trae-debug-log-admin-login-no-redirect.ndjson`

## Reproduction Steps
1. 使用浏览器打开 `http://localhost:5174/`。
2. 确认页面显示“需要登录”。
3. 点击“前往统一登录”。
4. 观察地址变化、SSO 页面、Admin callback 和最终 Admin session 状态。

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | 前端按钮事件未触发或导航调用失败 | Low | Low | Rejected；pre-fix line 1 shows `/api/admin/auth/login` returned 302 |
| B | 混用 localhost 与 127.0.0.1 导致 Host-only Cookie 不可用 | High | Low | Inconclusive, but not required to explain the observed 504 |
| C | 重复点击或旧标签页复用已消费 interaction | High | Low | Rejected as primary cause；a later fresh flow still timed out in callback |
| D | SSO authorize 未恢复到 Admin callback | Medium | Medium | Confirmed；pre-fix line 2 shows callback returned 504 at 8003ms |
| E | callback 成功但 Admin session Cookie 未保存或未发送 | Low | Medium | Confirmed as consequence；pre-fix line 3 shows token + userinfo exceeded 8s |

## Log Evidence
- Existing service logs show Admin login start returns 302.
- Existing service logs show successful SSO login/session requests.
- `.dbg/trae-debug-log-admin-login-no-redirect.ndjson:1`: login navigation reached Admin and returned 302.
- `.dbg/trae-debug-log-admin-login-no-redirect.ndjson:2`: Gateway terminated Admin callback at 8003ms with `UPSTREAM_TIMEOUT`.
- `.dbg/trae-debug-log-admin-login-no-redirect.ndjson:3`: token and userinfo calls took about 9070ms in total, exceeding the normal 8000ms proxy timeout.

## Instrumentation
1. `frontend/pr-admin/src/auth/AdminSessionProvider.tsx`: capture click origin, return path, and navigation target (A/B).
2. `backend/pr-admin/src/services/admin-auth.service.ts`: capture login start host/origin and flow/binding cookie state (B/C).
3. `backend/pr-admin/src/services/admin-auth.service.ts`: capture callback host/state/flow cookie state and successful session creation (B/D/E).
4. `backend/pr-admin/src/controllers/auth.controller.ts`: capture callback error code without credentials (C/D).
5. `backend/pr-admin/src/controllers/auth.controller.ts`: capture session-cookie presence and authentication result (B/E).

## Verification Conclusion
Root cause confirmed: the route-level timer assigns `AUTH_FLOW_TIMEOUT_MS=20000` to `completeAdminAuthLogin`, but the shared pr-admin proxy still uses `proxyTimeout=UPSTREAM_TIMEOUT_MS=8000`, so the lower transport timeout terminates the callback before it can return the Admin session cookie.

## Fix
- `backend/gateway/src/proxy/register-proxies.ts`: set the transport-level proxy timeout for both `pr-auth` and `pr-admin` to `AUTH_FLOW_TIMEOUT_MS`.
- Normal pr-admin operations remain limited by their per-route `UPSTREAM_TIMEOUT_MS` timer.
- Instrumentation remains active for post-fix comparison.

## Post-Fix Verification
- Log file cleared.
- Expected: Admin callback returns 303 before 20 seconds, then `/api/admin/auth/session` reports both cookies present and `authenticated=true`.
- Auth migration `0003_add_super_role` was applied and account `admin` was promoted to `super`; all previous sessions were revoked by design.
- Waiting for user reproduction at `http://localhost:5174/`.
