import { AsyncLocalStorage } from 'node:async_hooks';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { errors, type Adapter, type AdapterPayload } from 'oidc-provider';
import { oidcArtifacts } from '../db/schema/index.js';
import { digest } from '../auth/storage-crypto.js';
import type { AuthStore, AuthTransaction } from '../repositories/auth-store.js';

type SessionContext = { uid: string; accountId?: string; loginTs?: number; acr?: string };
export const oidcContext = new AsyncLocalStorage<{ session: () => SessionContext | undefined }>();
const supported = new Set(['Session', 'Interaction', 'Grant', 'AuthorizationCode', 'AccessToken', 'RefreshToken']);
type Artifact = typeof oidcArtifacts.$inferSelect;

export function createAdapter(store: AuthStore) {
  async function readable(tx: AuthTransaction, row: Artifact) {
    if (row.revokedAt || row.expiresAt <= store.now()) return undefined;
    if (row.sessionUidHash && row.userId && !await store.validSession(tx, row.sessionUidHash)) return undefined;
    if (row.grantIdHash) {
      const [grant] = await tx.select().from(oidcArtifacts).where(and(
        eq(oidcArtifacts.model, 'Grant'), eq(oidcArtifacts.idHash, row.grantIdHash),
        isNull(oidcArtifacts.revokedAt), gt(oidcArtifacts.expiresAt, store.now()),
      ));
      if (!grant) return undefined;
    }
    const payload = store.crypto.open<AdapterPayload>(row.payload, `${row.model}:${row.idHash}`);
    if (row.consumedAt) payload.consumed = Math.floor(row.consumedAt.getTime() / 1000);
    return payload;
  }
  return class PgAdapter implements Adapter {
    constructor(private readonly model: string) {}
    async upsert(id: string, payload: AdapterPayload, expiresIn?: number) {
      if (!supported.has(this.model) || !expiresIn || expiresIn <= 0) throw new errors.InvalidGrant('state is unavailable');
      await store.write(async (tx) => {
        const idHash = digest(id);
        const [existing] = await tx.select().from(oidcArtifacts).where(and(
          eq(oidcArtifacts.model, this.model), eq(oidcArtifacts.idHash, idHash),
        ));
        if (existing && (existing.revokedAt || existing.expiresAt <= store.now())) {
          throw new errors.InvalidGrant('state is no longer active');
        }
        if (this.model === 'Interaction' && existing) {
          const previous = store.crypto.open<AdapterPayload>(existing.payload, `${this.model}:${idHash}`);
          if (previous.result?.login || previous.result?.error) throw new errors.InvalidGrant('interaction already completed');
        }
        let sessionUid = this.model === 'Session' ? payload.uid : payload.sessionUid;
        if (this.model === 'Grant') sessionUid = oidcContext.getStore()?.session()?.uid;
        const sessionUidHash = sessionUid ? digest(sessionUid) : existing?.sessionUidHash;
        let expiresAt = new Date(store.now().getTime() + expiresIn * 1000);
        if (payload.accountId && this.model !== 'Interaction') {
          let valid = sessionUidHash ? await store.validSession(tx, sessionUidHash) : undefined;
          const context = this.model === 'Session' ? {
            uid: payload.uid, accountId: payload.accountId, loginTs: payload.loginTs, acr: payload.acr,
          } : oidcContext.getStore()?.session();
          if (context?.uid && context.accountId && context.loginTs
            && (this.model === 'Session' || this.model === 'Grant')) {
            valid = await store.ensureSession(tx, {
              uid: context.uid, accountId: context.accountId, loginTs: context.loginTs, acr: context.acr,
            });
          }
          if (!valid || valid.user.id !== payload.accountId) throw new errors.InvalidGrant('session is no longer active');
          expiresAt = new Date(Math.min(expiresAt.getTime(), valid.session.absoluteExpiresAt.getTime()));
        }
        const grantIdHash = payload.grantId ? digest(payload.grantId) : existing?.grantIdHash;
        if (grantIdHash) {
          const [grant] = await tx.select().from(oidcArtifacts).where(and(
            eq(oidcArtifacts.model, 'Grant'), eq(oidcArtifacts.idHash, grantIdHash),
          ));
          if (!grant || !await readable(tx, grant)) throw new errors.InvalidGrant('grant is no longer active');
        }
        if (expiresAt <= store.now()) throw new errors.InvalidGrant('state expired');
        const values = {
          payload: store.crypto.seal(payload, `${this.model}:${idHash}`),
          uidHash: payload.uid ? digest(payload.uid) : null,
          sessionUidHash: sessionUidHash ?? null, grantIdHash: grantIdHash ?? null,
          userId: payload.accountId ?? null, clientId: payload.clientId ?? null, expiresAt,
        };
        await tx.insert(oidcArtifacts).values({ model: this.model, idHash, ...values })
          .onConflictDoUpdate({
            target: [oidcArtifacts.model, oidcArtifacts.idHash], set: values,
            // consumed/revoked 标记永远不由 upsert 重置。
          });
      });
    }
    async find(id: string) {
      return this.lookup('idHash', digest(id));
    }
    async findByUid(uid: string) {
      return this.lookup('uidHash', digest(uid));
    }
    async findByUserCode() { return undefined; }
    private async lookup(column: 'idHash' | 'uidHash', value: string) {
      if (!supported.has(this.model)) return undefined;
      return store.write(async (tx) => {
        const [row] = await tx.select().from(oidcArtifacts).where(and(
          eq(oidcArtifacts.model, this.model), eq(oidcArtifacts[column], value),
        ));
        return row ? readable(tx, row) : undefined;
      });
    }
    async consume(id: string) {
      const consumed = await store.write(async (tx) => {
        const [row] = await tx.select().from(oidcArtifacts).where(and(
          eq(oidcArtifacts.model, this.model), eq(oidcArtifacts.idHash, digest(id)),
        ));
        if (!row || row.consumedAt || !await readable(tx, row)) {
          if (row?.grantIdHash) await store.revokeGrant(tx, row.grantIdHash);
          return false;
        }
        const updated = await tx.update(oidcArtifacts).set({ consumedAt: store.now() }).where(and(
          eq(oidcArtifacts.model, this.model), eq(oidcArtifacts.idHash, row.idHash),
          isNull(oidcArtifacts.consumedAt), isNull(oidcArtifacts.revokedAt), gt(oidcArtifacts.expiresAt, store.now()),
        )).returning({ id: oidcArtifacts.idHash });
        return updated.length === 1;
      });
      // 在提交撤销事务后抛出，Provider 不检查 consume 的返回值。
      if (!consumed) throw new errors.InvalidGrant('grant already consumed or expired');
    }
    async destroy(id: string) {
      const destroyed = await store.write(async (tx) => {
        const [row] = await tx.select().from(oidcArtifacts).where(and(
          eq(oidcArtifacts.model, this.model), eq(oidcArtifacts.idHash, digest(id)),
        ));
        if (!row) return false;
        // Session.resetIdentifier() 会先销毁旧 id；撤销旧授权后仍须释放 uid 唯一索引。
        await tx.update(oidcArtifacts).set({ revokedAt: row.revokedAt ?? store.now(), uidHash: null }).where(and(
          eq(oidcArtifacts.model, this.model), eq(oidcArtifacts.idHash, row.idHash),
        ));
        return !row.revokedAt;
      });
      if (this.model === 'Interaction' && !destroyed) throw new errors.InvalidGrant('interaction already used');
    }
    async revokeByGrantId(grantId: string) {
      await store.write((tx) => store.revokeGrant(tx, digest(grantId)));
    }
  };
}
