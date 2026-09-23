import { and, eq, gt, isNull, lt, or, sql } from 'drizzle-orm';
import type { db as databaseType } from '../db/index.js';
import { authAuditLogs, authSessions, oidcArtifacts, portalSessions, users } from '../db/schema/index.js';
import { IDLE_SECONDS, SESSION_SECONDS } from '../auth/policy.js';
import { digest, type StorageCrypto } from '../auth/storage-crypto.js';
import { AppError } from '../utils/app-error.js';

export type AuthDatabase = typeof databaseType;
export type AuthTransaction = Parameters<Parameters<AuthDatabase['transaction']>[0]>[0];
export type AuthReader = AuthDatabase | AuthTransaction;
export type AuditInput = Pick<typeof authAuditLogs.$inferInsert, 'event' | 'outcome' | 'reason'>
  & Partial<Pick<typeof authAuditLogs.$inferInsert, 'userId' | 'clientId' | 'requestId' | 'ipHash' | 'userAgent'>>;

export function createAuthStore(db: AuthDatabase, crypto: StorageCrypto, now = () => new Date()) {
  // 小规模身份域统一串行化状态写入。锁仅覆盖数据库事务，不含 KDF 或 HTTP。
  const write = <T>(action: (tx: AuthTransaction) => Promise<T>) => db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(731924, 1)`);
    return action(tx);
  });
  const audit = async (tx: AuthReader, input: AuditInput) => {
    await tx.insert(authAuditLogs).values({
      ...input,
      userAgent: input.userAgent ? Array.from(input.userAgent).filter((char) => char.charCodeAt(0) >= 32).join('').slice(0, 256) : null,
      createdAt: now(),
    });
  };
  async function validSession(reader: AuthReader, uidHash: string) {
    const [row] = await reader.select({ session: authSessions, user: users }).from(authSessions)
      .innerJoin(users, eq(authSessions.userId, users.id))
      .where(and(eq(authSessions.providerUidHash, uidHash), isNull(authSessions.revokedAt),
        gt(authSessions.idleExpiresAt, now()), gt(authSessions.absoluteExpiresAt, now()),
        eq(users.status, 'active'), eq(authSessions.authVersion, users.authVersion)));
    return row;
  }
  async function revokeSession(tx: AuthTransaction, uidHash: string) {
    const revoked = await tx.update(authSessions).set({ revokedAt: now() })
      .where(and(eq(authSessions.providerUidHash, uidHash), isNull(authSessions.revokedAt))).returning();
    await tx.update(oidcArtifacts).set({ revokedAt: now() })
      .where(eq(oidcArtifacts.sessionUidHash, uidHash));
    for (const session of revoked) {
      await tx.delete(portalSessions).where(eq(portalSessions.authSessionId, session.id));
    }
  }
  async function revokeUser(tx: AuthTransaction, userId: string) {
    const sessions = await tx.select().from(authSessions).where(eq(authSessions.userId, userId));
    for (const session of sessions) await revokeSession(tx, session.providerUidHash);
    await tx.update(oidcArtifacts).set({ revokedAt: now() }).where(eq(oidcArtifacts.userId, userId));
  }
  async function revokeGrant(tx: AuthTransaction, grantHash: string) {
    await tx.update(oidcArtifacts).set({ revokedAt: now() }).where(or(
      and(eq(oidcArtifacts.model, 'Grant'), eq(oidcArtifacts.idHash, grantHash)),
      eq(oidcArtifacts.grantIdHash, grantHash),
    ));
  }
  async function ensureSession(tx: AuthTransaction, input: {
    uid: string; accountId: string; loginTs: number; acr: string | undefined;
  }) {
    const [user] = await tx.select().from(users).where(eq(users.id, input.accountId));
    if (!user || user.status !== 'active' || input.acr !== `urn:my-sp-pr:auth-version:${user.authVersion}`) {
      throw new AppError(401, 'UNAUTHENTICATED', '登录状态已失效');
    }
    const uidHash = digest(input.uid);
    const authenticatedAt = new Date(input.loginTs * 1000);
    const [existing] = await tx.select().from(authSessions).where(eq(authSessions.providerUidHash, uidHash));
    if (existing) {
      if (existing.revokedAt || existing.userId !== user.id || existing.authVersion !== user.authVersion
        || existing.absoluteExpiresAt <= now() || existing.idleExpiresAt <= now()
        || authenticatedAt < existing.authenticatedAt) {
        throw new AppError(401, 'UNAUTHENTICATED', '登录状态已失效');
      }
      if (authenticatedAt > existing.authenticatedAt) {
        await revokeSession(tx, uidHash);
        const [renewed] = await tx.update(authSessions).set({
          authenticatedAt, lastActivityAt: now(), revokedAt: null,
          idleExpiresAt: new Date(now().getTime() + IDLE_SECONDS * 1000),
          absoluteExpiresAt: new Date(authenticatedAt.getTime() + SESSION_SECONDS * 1000),
        }).where(eq(authSessions.id, existing.id)).returning();
        return { session: renewed!, user };
      }
      return { session: existing, user };
    }
    const absoluteExpiresAt = new Date(authenticatedAt.getTime() + SESSION_SECONDS * 1000);
    if (absoluteExpiresAt <= now() || authenticatedAt.getTime() > now().getTime() + 5000) {
      throw new AppError(401, 'UNAUTHENTICATED', '登录状态已失效');
    }
    const [session] = await tx.insert(authSessions).values({
      providerUidHash: uidHash, userId: user.id, authVersion: user.authVersion, authenticatedAt,
      lastActivityAt: now(), idleExpiresAt: new Date(now().getTime() + IDLE_SECONDS * 1000), absoluteExpiresAt,
    }).returning();
    return { session: session!, user };
  }
  async function touchSession(tx: AuthTransaction, uidHash: string) {
    const valid = await validSession(tx, uidHash);
    if (!valid) return undefined;
    await tx.update(authSessions).set({
      lastActivityAt: now(),
      idleExpiresAt: new Date(Math.min(now().getTime() + IDLE_SECONDS * 1000, valid.session.absoluteExpiresAt.getTime())),
    }).where(and(eq(authSessions.id, valid.session.id), lt(authSessions.lastActivityAt, new Date(now().getTime() - 300_000))));
    return valid;
  }
  return { db, crypto, now, write, audit, validSession, ensureSession, touchSession, revokeSession, revokeUser, revokeGrant };
}
export type AuthStore = ReturnType<typeof createAuthStore>;
