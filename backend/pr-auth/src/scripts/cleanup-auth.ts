import { sql } from 'drizzle-orm';
import { database, db } from '../db/index.js';

try {
  await database.checkReady();
  let total = 0;
  // 最多 100 批，每批至多 500 行；保留 7 天 tombstone，避免清理使并发操作复活。
  for (let batch = 0; batch < 100; batch += 1) {
    const removed = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(731924, 1)`);
      const results = [
        await tx.execute(sql`delete from auth.portal_sessions where token_hash in
          (select token_hash from auth.portal_sessions where expires_at < now() limit 500) returning token_hash`),
        await tx.execute(sql`delete from auth.browser_transactions where id_hash in
          (select id_hash from auth.browser_transactions where expires_at < now() - interval '7 days' limit 500) returning id_hash`),
        await tx.execute(sql`delete from auth.oidc_artifacts where (model, id_hash) in
          (select model, id_hash from auth.oidc_artifacts where expires_at < now() - interval '7 days' limit 500) returning id_hash`),
        await tx.execute(sql`delete from auth.auth_sessions where id in
          (select id from auth.auth_sessions where absolute_expires_at < now() - interval '7 days'
           and not exists (select 1 from auth.portal_sessions p where p.auth_session_id = auth.auth_sessions.id) limit 500) returning id`),
        await tx.execute(sql`delete from auth.login_rate_limits where (bucket_type, bucket_hash) in
          (select bucket_type, bucket_hash from auth.login_rate_limits where expires_at < now() limit 500) returning bucket_hash`),
        await tx.execute(sql`delete from auth.auth_audit_logs where id in
          (select id from auth.auth_audit_logs where created_at < now() - interval '90 days' limit 500) returning id`),
      ];
      return results.reduce((sum, result) => sum + (result.rowCount ?? 0), 0);
    });
    total += removed;
    if (!removed) break;
  }
  console.log(`[pr-auth] 身份数据清理完成，共 ${total} 行。`);
} catch {
  console.error('[pr-auth] 身份数据清理失败，请检查数据库和迁移状态。');
  process.exitCode = 1;
} finally {
  await database.close();
}
