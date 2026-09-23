export function resumeAuthentication(value: string, kind: 'login' | 'logout') {
  const url = new URL(value, window.location.origin);
  const allowed = kind === 'login' ? /^\/api\/auth\/oidc\/authorize\/[A-Za-z0-9_-]+$/u.test(url.pathname)
    : url.pathname === '/api/auth/oidc/logout';
  if (url.origin !== window.location.origin || !allowed) throw new Error('登录跳转地址无效，请重新开始');
  window.location.assign(url.href);
}
