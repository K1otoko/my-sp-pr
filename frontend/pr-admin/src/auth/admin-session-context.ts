import { createContext } from 'react';
import type { AuthSessionData } from '../api/generated/types.gen';

export type SessionContextValue = {
  session?: AuthSessionData;
  loading: boolean;
  error?: Error;
  refresh: () => void;
  login: (returnTo?: string) => void;
  logout: () => Promise<void>;
  logoutLoading: boolean;
};

export const SessionContext = createContext<SessionContextValue | undefined>(undefined);
