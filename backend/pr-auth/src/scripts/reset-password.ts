import { database, db } from '../db/index.js';
import { loadAuthConfig } from '../config/auth.js';
import { createAuthStore } from '../repositories/auth-store.js';
import { accountService } from '../services/account.service.js';
import { AppError } from '../utils/app-error.js';
import { readPassword } from './password-input.js';

try {
  const username = process.argv[2];
  if (!username || process.argv.length !== 3) throw new AppError(400, 'INVALID_INPUT', '只传入用户名，密码使用隐藏输入或标准输入');
  await database.checkReady();
  const config = loadAuthConfig(process.env);
  await accountService(createAuthStore(db, config.crypto)).resetPassword(username, await readPassword());
  console.log('[pr-auth] 密码已重置，该账号的所有设备会话已撤销。');
} catch (error) {
  console.error('[pr-auth] 重置失败：', error instanceof AppError ? error.message : '请检查身份配置、数据库和迁移状态');
  process.exitCode = 1;
} finally {
  await database.close();
}
