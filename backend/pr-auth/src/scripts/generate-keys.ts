import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportJWK, generateKeyPair } from 'jose';
import { randomToken } from '../auth/storage-crypto.js';

// 独立部署命令，不加载数据库，也不在服务启动时自动生成或更换密钥。
const target = resolve(fileURLToPath(new URL('../../', import.meta.url)), process.env.AUTH_CONFIG_FILE ?? '.deploy/auth.json');
try {
  const { privateKey } = await generateKeyPair('RS256', { modulusLength: 3072, extractable: true });
  const key = { ...await exportJWK(privateKey), kid: randomToken(), alg: 'RS256', use: 'sig' };
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  await writeFile(target, `${JSON.stringify({
    cookieKeys: [randomToken()], encryptionKeys: [{ id: 'v1', key: randomToken() }],
    hmacKey: randomToken(), jwks: { keys: [key] }, portalSecret: randomToken(), clients: [],
  }, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  console.log('[pr-auth] 身份密钥配置已创建（0600）。请妥善备份并让所有身份服务实例使用相同配置。');
} catch (error) {
  console.error('[pr-auth] 密钥文件创建失败，未覆盖已有文件。', { code: (error as NodeJS.ErrnoException).code ?? 'KEY_GENERATION_FAILED' });
  process.exitCode = 1;
}
