import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AuthConfig } from '../config/auth.js';
import { constantEqual, randomToken } from './storage-crypto.js';
import { FLOW_SECONDS, SESSION_SECONDS } from './policy.js';
import { AppError } from '../utils/app-error.js';

export function browserSecurity(config: AuthConfig) {
  const prefix = config.secure ? '__Host-' : 'dev_';
  const names = { binding: `${prefix}sso_binding`, portal: `${prefix}sso_portal` };
  function getCookie(request: IncomingMessage, name: string): string | undefined {
    const values = (request.headers.cookie ?? '').split(';').map((part) => part.trim()).filter((part) => part.startsWith(`${name}=`));
    if (values.length !== 1) return undefined;
    const value = values[0]!.slice(name.length + 1);
    return /^[A-Za-z0-9_-]{43}$/u.test(value) ? value : undefined;
  }
  function setCookie(response: ServerResponse, name: string, value: string, maxAge = SESSION_SECONDS) {
    const cookie = `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${config.secure ? '; Secure' : ''}`;
    response.appendHeader('Set-Cookie', cookie);
  }
  function binding(request: IncomingMessage, response?: ServerResponse) {
    const existing = getCookie(request, names.binding);
    if (existing) return existing;
    if (!response) throw new AppError(400, 'AUTH_FLOW_INVALID', '登录流程已失效，请重新开始');
    const value = randomToken();
    setCookie(response, names.binding, value);
    return value;
  }
  function csrf(subject: string, browser: string, expires = Date.now() + FLOW_SECONDS * 1000) {
    return `${expires}.${config.crypto.hmac(`csrf:${subject}:${browser}:${expires}`)}`;
  }
  function verifyCsrf(token: string, subject: string, browser: string) {
    const [expiry] = token.split('.');
    const expires = Number(expiry);
    if (!Number.isSafeInteger(expires) || expires <= Date.now() || !constantEqual(token, csrf(subject, browser, expires))) {
      throw new AppError(403, 'CSRF_INVALID', '页面校验已失效，请刷新重试');
    }
  }
  function requireOrigin(request: IncomingMessage) {
    if (request.headers.origin !== config.origin) throw new AppError(403, 'CSRF_INVALID', '请求来源校验失败');
  }
  return { names, getCookie, setCookie, binding, csrf, verifyCsrf, requireOrigin };
}
export type BrowserSecurity = ReturnType<typeof browserSecurity>;
