import type { AuthRole, AuthUser } from '../api/index.js';
import type { users } from '../db/schema/index.js';
import { AppError } from '../utils/app-error.js';

export const SESSION_SECONDS = 7 * 24 * 60 * 60;
export const IDLE_SECONDS = 24 * 60 * 60;
export const FLOW_SECONDS = 10 * 60;
export const TOKEN_SECONDS = 5 * 60;
export type User = typeof users.$inferSelect;
export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}
export function requireUsername(value: string): string {
  const normalized = normalizeUsername(value);
  if (!/^[a-z][a-z0-9._-]{2,31}$/u.test(normalized)) {
    throw new AppError(400, 'INVALID_INPUT', '用户名需为 3–32 位，以字母开头，只含字母、数字、点、下划线或连字符');
  }
  return normalized;
}
export function publicUser(user: User): AuthUser {
  return { id: user.id, username: user.usernameNormalized, displayName: user.displayName, role: user.role };
}
export function roleAllowed(user: User, allowedRoles: readonly AuthRole[]): boolean {
  return user.status === 'active' && allowedRoles.includes(user.role);
}
