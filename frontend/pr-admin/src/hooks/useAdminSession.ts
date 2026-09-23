import { useContext } from 'react';
import { SessionContext } from '../auth/admin-session-context';

export function useAdminSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useAdminSession 必须在 AdminSessionProvider 内使用');
  return value;
}
