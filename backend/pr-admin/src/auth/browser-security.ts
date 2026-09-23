import type { IncomingMessage, ServerResponse } from 'node:http';
import type { env } from '../config/env.js';
import { AppError } from '../utils/app-error.js';
import { constantEqual, randomToken } from './token-crypto.js';

const FLOW_SECONDS = 10 * 60;
const SESSION_SECONDS = 7 * 24 * 60 * 60;

export function browserSecurity(config: typeof env) {
  const prefix = config.secure ? '__Host-' : 'dev_';
  const names = {
    binding: `${prefix}admin_binding`,
    flow: `${prefix}admin_flow`,
    session: `${prefix}admin_session`,
  };
  function getCookie(request: IncomingMessage, name: string): string | undefined {
    const values = (request.headers.cookie ?? '').split(';').map((part) => part.trim())
      .filter((part) => part.startsWith(`${name}=`));
    if (values.length !== 1) return undefined;
    const value = values[0]!.slice(name.length + 1);
    return /^[A-Za-z0-9_-]{43}$/u.test(value) ? value : undefined;
  }
  function setCookie(response: ServerResponse, name: string, value: string, maxAge = SESSION_SECONDS) {
    response.appendHeader('Set-Cookie',
      `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${config.secure ? '; Secure' : ''}`);
  }
  function clearCookie(response: ServerResponse, name: string) {
    setCookie(response, name, '', 0);
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
    return `${expires}.${config.authCrypto.hmac(`csrf:${subject}:${browser}:${expires}`)}`;
  }
  function verifyCsrf(token: string, subject: string, browser: string) {
    const expires = Number(token.split('.')[0]);
    if (!Number.isSafeInteger(expires) || expires <= Date.now()
      || !constantEqual(token, csrf(subject, browser, expires))) {
      throw new AppError(403, 'CSRF_INVALID', '页面校验已失效，请刷新重试');
    }
  }
  function requireOrigin(request: IncomingMessage) {
    if (request.headers.origin !== config.adminOrigin) {
      throw new AppError(403, 'CSRF_INVALID', '请求来源校验失败');
    }
  }
  function returnPath(value: unknown): string {
    if (typeof value !== 'string' || value.length > 1024 || !value.startsWith('/') || value.startsWith('//')) return '/';
    try {
      const target = new URL(value, config.adminOrigin);
      if (target.origin !== config.adminOrigin || target.pathname.startsWith('/api/')) return '/';
      return `${target.pathname}${target.search}${target.hash}`;
    } catch {
      return '/';
    }
  }
  return {
    names, getCookie, setCookie, clearCookie, binding, csrf, verifyCsrf, requireOrigin, returnPath,
    flowSeconds: FLOW_SECONDS, sessionSeconds: SESSION_SECONDS,
  };
}

export type BrowserSecurity = ReturnType<typeof browserSecurity>;
