import { eq } from 'drizzle-orm';
import { authRoleSchema } from '../api/index.js';
import { requireUsername } from '../auth/policy.js';
import { loadAuthConfig } from '../config/auth.js';
import { database, db } from '../db/index.js';
import { users } from '../db/schema/index.js';
import { createAuthStore } from '../repositories/auth-store.js';
import { accountService } from '../services/account.service.js';
import { AppError } from '../utils/app-error.js';

try {
  const username = process.argv[2];
  const parsedRole = authRoleSchema.safeParse(process.argv[3]);
  if (!username || !parsedRole.success || process.argv.length !== 4) {
    throw new AppError(400, 'INVALID_INPUT', '用法：auth:set-role <username> <super|admin|user>');
  }
  await database.checkReady();
  const [user] = await db.select({ id: users.id }).from(users)
    .where(eq(users.usernameNormalized, requireUsername(username)));
  if (!user) throw new AppError(404, 'NOT_FOUND', '账号不存在');
  const config = loadAuthConfig(process.env);
  await accountService(createAuthStore(db, config.crypto)).changeAccount(user.id, { role: parsedRole.data });
  console.log(`[pr-auth] ${requireUsername(username)} 的角色已更新为 ${parsedRole.data}，该账号的所有设备会话已撤销。`);
} catch (error) {
  console.error('[pr-auth] 角色更新失败：', error instanceof AppError ? error.message : '请检查身份配置、数据库和迁移状态');
  process.exitCode = 1;
} finally {
  await database.close();
}
