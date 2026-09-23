import type { AuthDatabase } from '../repositories/auth-store.js';
import { authAuditLogs, authSessions, browserTransactions, loginRateLimits, oidcArtifacts, portalSessions, users } from './schema/index.js';

// SELECT 全部列同时检查表、列和运行账号权限；不授予读取迁移历史的权限。
export async function checkIdentitySchema(db: AuthDatabase) {
  for (const table of [users, authSessions, oidcArtifacts, browserTransactions, portalSessions, loginRateLimits, authAuditLogs]) {
    await db.select().from(table).limit(0);
  }
}
