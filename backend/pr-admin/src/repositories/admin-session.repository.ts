import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import type { AuthRole, AuthUser } from '../api/index.js';
import type { env } from '../config/env.js';
import type { db as databaseType } from '../db/index.js';
import { adminAuthFlows, adminSessions } from '../db/schema/index.js';
import { digest, randomToken } from '../auth/token-crypto.js';

export type AdminDatabase = typeof databaseType;
export type AdminTransaction = Parameters<Parameters<AdminDatabase['transaction']>[0]>[0];
export type AdminSession = typeof adminSessions.$inferSelect;

type FlowInput = {
  state: string;
  nonce: string;
  verifier: string;
  binding: string;
  returnPath: string;
};

type SessionInput = {
  user: AuthUser & { role: Extract<AuthRole, 'super' | 'admin'> };
  binding: string;
  accessToken: string;
  refreshToken: string;
  idToken: string;
  accessTokenExpiresAt: Date;
  absoluteExpiresAt: Date;
};

export function adminSessionRepository(database: AdminDatabase, config: typeof env, now = () => new Date()) {
  return {
    now,
    async createFlow(input: FlowInput) {
      const token = randomToken();
      const tokenHash = digest(token);
      await database.insert(adminAuthFlows).values({
        tokenHash,
        stateHash: digest(input.state),
        browserBindingHash: digest(input.binding),
        nonceCiphertext: config.authCrypto.seal(input.nonce, `admin-flow:${tokenHash}:nonce`),
        verifierCiphertext: config.authCrypto.seal(input.verifier, `admin-flow:${tokenHash}:verifier`),
        returnPath: input.returnPath,
        expiresAt: new Date(now().getTime() + 10 * 60 * 1000),
      });
      return token;
    },
    async consumeFlow(input: { token: string; state: string; binding: string }) {
      const tokenHash = digest(input.token);
      return database.transaction(async (tx) => {
        const [flow] = await tx.update(adminAuthFlows).set({ consumedAt: now() }).where(and(
          eq(adminAuthFlows.tokenHash, tokenHash),
          eq(adminAuthFlows.stateHash, digest(input.state)),
          eq(adminAuthFlows.browserBindingHash, digest(input.binding)),
          isNull(adminAuthFlows.consumedAt),
          gt(adminAuthFlows.expiresAt, now()),
        )).returning();
        if (!flow) return undefined;
        return {
          nonce: config.authCrypto.open(flow.nonceCiphertext, `admin-flow:${tokenHash}:nonce`),
          verifier: config.authCrypto.open(flow.verifierCiphertext, `admin-flow:${tokenHash}:verifier`),
          returnPath: flow.returnPath,
        };
      });
    },
    async createSession(input: SessionInput, previousToken?: string) {
      const token = randomToken();
      const tokenHash = digest(token);
      const createdAt = now();
      await database.transaction(async (tx) => {
        if (previousToken) await tx.delete(adminSessions).where(eq(adminSessions.tokenHash, digest(previousToken)));
        await tx.insert(adminSessions).values({
          tokenHash,
          browserBindingHash: digest(input.binding),
          ssoSubject: input.user.id,
          username: input.user.username,
          displayName: input.user.displayName,
          role: input.user.role,
          accessTokenCiphertext: config.authCrypto.seal(input.accessToken, `admin-session:${tokenHash}:access`),
          refreshTokenCiphertext: config.authCrypto.seal(input.refreshToken, `admin-session:${tokenHash}:refresh`),
          idTokenCiphertext: config.authCrypto.seal(input.idToken, `admin-session:${tokenHash}:id`),
          accessTokenExpiresAt: input.accessTokenExpiresAt,
          csrfSecret: randomToken(),
          createdAt,
          lastActivityAt: createdAt,
          idleExpiresAt: new Date(createdAt.getTime() + 24 * 60 * 60 * 1000),
          absoluteExpiresAt: input.absoluteExpiresAt,
        });
      });
      return token;
    },
    async withSession<T>(
      token: string,
      binding: string,
      action: (tx: AdminTransaction, session: AdminSession) => Promise<T>,
    ): Promise<T | undefined> {
      const tokenHash = digest(token);
      return database.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${tokenHash}))`);
        const [session] = await tx.select().from(adminSessions).where(and(
          eq(adminSessions.tokenHash, tokenHash),
          eq(adminSessions.browserBindingHash, digest(binding)),
          isNull(adminSessions.revokedAt),
          gt(adminSessions.idleExpiresAt, now()),
          gt(adminSessions.absoluteExpiresAt, now()),
        )).for('update');
        if (!session) return undefined;
        return action(tx, session);
      });
    },
    async revoke(token: string) {
      await database.update(adminSessions).set({ revokedAt: now() })
        .where(and(eq(adminSessions.tokenHash, digest(token)), isNull(adminSessions.revokedAt)));
    },
  };
}

export type AdminSessionRepository = ReturnType<typeof adminSessionRepository>;
