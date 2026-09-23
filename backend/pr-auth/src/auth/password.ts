import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { AppError } from '../utils/app-error.js';

const params = { N: 131072, r: 8, p: 1, maxmem: 160 * 1024 * 1024 };
const dummySalt = Buffer.from('b985a485692d0f23d67972d2abaac818', 'hex');
let active = 0;

async function derive(password: string, salt: Buffer): Promise<Buffer> {
  if (active >= 2) throw new AppError(429, 'RATE_LIMITED', '登录请求较多，请稍后再试');
  active += 1;
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      scrypt(password, salt, 64, params, (error, value) => error ? reject(error) : resolve(value));
    });
  } finally {
    active -= 1;
  }
}

export function validateNewPassword(password: string) {
  if (password.length < 8 || password.length > 128) {
    throw new AppError(400, 'INVALID_INPUT', '密码长度应为 8–128 个字符');
  }
}
export async function hashPassword(password: string): Promise<string> {
  validateNewPassword(password);
  const salt = randomBytes(16);
  const hash = await derive(password, salt);
  return `scrypt$v1$131072$8$1$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}
export async function verifyPassword(password: string, stored?: string): Promise<boolean> {
  const pieces = stored?.split('$');
  const validFormat = pieces?.length === 7 && pieces.slice(0, 5).join('$') === 'scrypt$v1$131072$8$1';
  const salt = validFormat ? Buffer.from(pieces[5]!, 'base64url') : dummySalt;
  const expected = validFormat ? Buffer.from(pieces[6]!, 'base64url') : Buffer.alloc(64);
  const usable = validFormat && salt.length === 16 && expected.length === 64;
  const actual = await derive(password, usable ? salt : dummySalt);
  return Boolean(usable && timingSafeEqual(actual, expected));
}
