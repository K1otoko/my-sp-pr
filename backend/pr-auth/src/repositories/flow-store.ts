import { and, eq, gt, isNull } from 'drizzle-orm';
import { browserTransactions } from '../db/schema/index.js';
import { FLOW_SECONDS } from '../auth/policy.js';
import { digest, randomToken } from '../auth/storage-crypto.js';
import type { AuthStore } from './auth-store.js';
import { AppError } from '../utils/app-error.js';

export type LoginFlow = { state: string; nonce: string; verifier: string };
export type LogoutFlow = { sessionUid: string; xsrf: string; clientName: string };
export function flowStore(store: AuthStore) {
  return {
    async create(kind: 'login' | 'logout', binding: string, redirectUri: string, payload: LoginFlow | LogoutFlow) {
      const id = randomToken();
      const idHash = digest(id);
      await store.write(async (tx) => {
        await tx.insert(browserTransactions).values({
          idHash, kind, browserBindingHash: digest(binding), redirectUri,
          stateHash: 'state' in payload ? digest(payload.state) : null,
          payload: store.crypto.seal(payload, `flow:${idHash}`),
          expiresAt: new Date(store.now().getTime() + FLOW_SECONDS * 1000),
        });
      });
      return id;
    },
    async read<T extends LoginFlow | LogoutFlow>(kind: 'login' | 'logout', id: string, binding: string, consume: boolean) {
      return store.write(async (tx) => {
        const [row] = await tx.select().from(browserTransactions).where(and(
          kind === 'login' ? eq(browserTransactions.stateHash, digest(id)) : eq(browserTransactions.idHash, digest(id)),
          eq(browserTransactions.kind, kind), eq(browserTransactions.browserBindingHash, digest(binding)),
          isNull(browserTransactions.consumedAt), gt(browserTransactions.expiresAt, store.now()),
        ));
        if (!row) throw new AppError(400, 'AUTH_FLOW_INVALID', '登录流程已失效，请重新开始');
        if (consume) await tx.update(browserTransactions).set({ consumedAt: store.now() }).where(eq(browserTransactions.idHash, row.idHash));
        return { ...row, data: store.crypto.open<T>(row.payload, `flow:${row.idHash}`) };
      });
    },
  };
}
