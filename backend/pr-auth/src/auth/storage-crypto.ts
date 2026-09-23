import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export type EncryptionKey = { id: string; key: string };
export const randomToken = () => randomBytes(32).toString('base64url');
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export function constantEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function storageCrypto(keys: readonly EncryptionKey[], hmacKey: string) {
  if (!keys.length || new Set(keys.map((key) => key.id)).size !== keys.length
    || keys.some(({ id, key }) => !/^[A-Za-z0-9_-]{1,32}$/u.test(id) || Buffer.from(key, 'base64url').length !== 32)
    || Buffer.from(hmacKey, 'base64url').length !== 32) {
    throw new Error('身份存储密钥配置无效');
  }
  return {
    seal(value: unknown, aad: string): string {
      const current = keys[0]!;
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', Buffer.from(current.key, 'base64url'), iv);
      cipher.setAAD(Buffer.from(aad));
      const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
      return [current.id, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), body.toString('base64url')].join('.');
    },
    open<T>(value: string, aad: string): T {
      const [id, iv, tag, body, excess] = value.split('.');
      const key = keys.find((candidate) => candidate.id === id);
      if (!key || !iv || !tag || !body || excess !== undefined) throw new Error('身份存储数据无效');
      const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key.key, 'base64url'), Buffer.from(iv, 'base64url'));
      decipher.setAAD(Buffer.from(aad));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return JSON.parse(Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8')) as T;
    },
    hmac(value: string): string {
      return createHmac('sha256', Buffer.from(hmacKey, 'base64url')).update(value).digest('base64url');
    },
  };
}
export type StorageCrypto = ReturnType<typeof storageCrypto>;
