import { and, eq } from 'drizzle-orm';
import { verifyPassword } from '../auth/password.js';
import { normalizeUsername } from '../auth/policy.js';
import { loginRateLimits, users } from '../db/schema/index.js';
import type { AuditInput, AuthStore } from '../repositories/auth-store.js';
import { AppError } from '../utils/app-error.js';

const WINDOW_MS = 15 * 60 * 1000;
export class LoginRateError extends AppError {
  constructor(public readonly retryAfter: number) { super(429, 'RATE_LIMITED', '尝试次数过多，请稍后再试'); }
}
export function loginService(store: AuthStore) {
  return async (input: {
    username: string; password: string; ip: string; clientId: string; requestId: string; userAgent?: string;
  }) => {
    const username = normalizeUsername(input.username);
    const usernameHash = store.crypto.hmac(`username:${username}`);
    const ipHash = store.crypto.hmac(`ip:${input.ip}`);
    const context: Partial<AuditInput> = {
      clientId: input.clientId, requestId: input.requestId, userAgent: input.userAgent, ipHash,
    };
    const reservation = await store.write(async (tx) => {
      const now = store.now();
      const buckets = [];
      for (const [bucketType, bucketHash, max] of [
        ['username', usernameHash, 5], ['ip', ipHash, 30],
      ] as const) {
        const [row] = await tx.select().from(loginRateLimits).where(and(
          eq(loginRateLimits.bucketType, bucketType), eq(loginRateLimits.bucketHash, bucketHash),
        ));
        if (row?.blockedUntil && row.blockedUntil > now) {
          await store.audit(tx, { ...context, event: 'login.limited', outcome: 'failure', reason: bucketType });
          return { retryAfter: Math.ceil((row.blockedUntil.getTime() - now.getTime()) / 1000) };
        }
        const fresh = !row || now.getTime() - row.windowStart.getTime() >= WINDOW_MS;
        const count = fresh ? 0 : row.count;
        if (count >= max) {
          const blockedUntil = new Date(now.getTime() + WINDOW_MS);
          await tx.update(loginRateLimits).set({ blockedUntil, expiresAt: blockedUntil })
            .where(and(eq(loginRateLimits.bucketType, bucketType), eq(loginRateLimits.bucketHash, bucketHash)));
          await store.audit(tx, { ...context, event: 'login.limited', outcome: 'failure', reason: bucketType });
          return { retryAfter: WINDOW_MS / 1000 };
        }
        buckets.push({
          bucketType, bucketHash, windowStart: fresh ? now : row.windowStart,
          count: count + 1, blockedUntil: null, expiresAt: new Date(now.getTime() + WINDOW_MS * 2),
        });
      }
      for (const bucket of buckets) {
        await tx.insert(loginRateLimits).values(bucket).onConflictDoUpdate({
          target: [loginRateLimits.bucketType, loginRateLimits.bucketHash], set: bucket,
        });
      }
      return { retryAfter: 0, windowStart: buckets[0]!.windowStart };
    });
    if (reservation.retryAfter) throw new LoginRateError(reservation.retryAfter);
    const [candidate] = await store.db.select().from(users).where(eq(users.usernameNormalized, username));
    let matches: boolean;
    try {
      matches = await verifyPassword(input.password, candidate?.passwordHash);
    } catch (error) {
      if (error instanceof AppError && error.code === 'RATE_LIMITED') throw new LoginRateError(2);
      throw error;
    }
    const user = await store.write(async (tx) => {
      const [current] = candidate ? await tx.select().from(users).where(eq(users.id, candidate.id)) : [];
      const valid = matches && current?.status === 'active' && current.authVersion === candidate?.authVersion;
      if (!valid) {
        await store.audit(tx, {
          ...context, event: 'login.failed', userId: current?.id, outcome: 'failure',
          reason: !current ? 'unknown_account' : current.status !== 'active' ? 'disabled' : 'password',
        });
        // 第五次失败即开始冷却；预留计数使并发请求不能越过上限。
        const [bucket] = await tx.select().from(loginRateLimits).where(and(
          eq(loginRateLimits.bucketType, 'username'), eq(loginRateLimits.bucketHash, usernameHash),
        ));
        if (bucket && bucket.count >= 5 && bucket.windowStart.getTime() === reservation.windowStart?.getTime()) {
          await tx.update(loginRateLimits).set({ blockedUntil: new Date(store.now().getTime() + WINDOW_MS) })
            .where(and(eq(loginRateLimits.bucketType, 'username'), eq(loginRateLimits.bucketHash, usernameHash)));
        }
        return undefined;
      }
      // 只释放本次成功预留，不清零并发失败的计数。
      const [bucket] = await tx.select().from(loginRateLimits).where(and(
        eq(loginRateLimits.bucketType, 'username'), eq(loginRateLimits.bucketHash, usernameHash),
      ));
      if (bucket && bucket.count > 0 && bucket.windowStart.getTime() === reservation.windowStart?.getTime()) {
        await tx.update(loginRateLimits).set({ count: bucket.count - 1 }).where(and(
          eq(loginRateLimits.bucketType, 'username'), eq(loginRateLimits.bucketHash, usernameHash),
        ));
      }
      await tx.update(users).set({ lastLoginAt: store.now() }).where(eq(users.id, current.id));
      await store.audit(tx, { ...context, event: 'login.success', userId: current.id, outcome: 'success', reason: 'password' });
      return current;
    });
    if (!user) throw new AppError(401, 'INVALID_CREDENTIALS', '用户名或密码错误，或账号不可用');
    return user;
  };
}
