import { and, eq, sql } from 'drizzle-orm';
import type { AuthRole } from '../api/index.js';
import { hashPassword } from '../auth/password.js';
import { requireUsername } from '../auth/policy.js';
import { users } from '../db/schema/index.js';
import type { AuthStore } from '../repositories/auth-store.js';
import { AppError } from '../utils/app-error.js';

export function accountService(store: AuthStore) {
  return {
    async bootstrap(username: string, password: string) {
      const usernameNormalized = requireUsername(username);
      const passwordHash = await hashPassword(password);
      return store.write(async (tx) => {
        if ((await tx.select({ id: users.id }).from(users).limit(1)).length) {
          throw new AppError(409, 'FORBIDDEN', '已有账号，不能重复初始化超级管理员');
        }
        const [user] = await tx.insert(users).values({
          usernameNormalized, displayName: usernameNormalized, passwordHash, role: 'super',
        }).returning();
        await store.audit(tx, { event: 'account.bootstrap', userId: user!.id, outcome: 'success', reason: 'created' });
        return user!;
      });
    },
    async resetPassword(username: string, password: string) {
      const usernameNormalized = requireUsername(username);
      const passwordHash = await hashPassword(password);
      return store.write(async (tx) => {
        const [user] = await tx.update(users).set({
          passwordHash, passwordChangedAt: store.now(), updatedAt: store.now(), authVersion: sql`${users.authVersion} + 1`,
        }).where(eq(users.usernameNormalized, usernameNormalized)).returning();
        if (!user) throw new AppError(404, 'NOT_FOUND', '账号不存在');
        await store.revokeUser(tx, user.id);
        await store.audit(tx, { event: 'account.password_reset', userId: user.id, outcome: 'success', reason: 'reset' });
      });
    },
    // 身份域逻辑，暂不暴露管理 HTTP API。未来 Admin 调用前必须先鉴权。
    async changeAccount(userId: string, change: { role?: AuthRole; status?: 'active' | 'disabled' }) {
      return store.write(async (tx) => {
        const [current] = await tx.select().from(users).where(eq(users.id, userId));
        if (!current) throw new AppError(404, 'NOT_FOUND', '账号不存在');
        const nextRole = change.role ?? current.role;
        const nextStatus = change.status ?? current.status;
        if (current.role === 'super' && current.status === 'active' && (nextRole !== 'super' || nextStatus !== 'active')) {
          const superUsers = await tx.select({ id: users.id }).from(users)
            .where(and(eq(users.role, 'super'), eq(users.status, 'active')));
          if (superUsers.length <= 1) throw new AppError(409, 'FORBIDDEN', '必须保留至少一个有效超级管理员');
        }
        await tx.update(users).set({
          role: nextRole, status: nextStatus, authVersion: sql`${users.authVersion} + 1`, updatedAt: store.now(),
        }).where(eq(users.id, userId));
        await store.revokeUser(tx, userId);
        await store.audit(tx, { event: 'account.changed', userId, outcome: 'success', reason: 'role_or_status_changed' });
      });
    },
  };
}
