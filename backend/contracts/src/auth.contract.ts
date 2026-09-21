import { healthOperation } from './shared.js';

export const authContract = {
  service: 'pr-auth',
  namespace: '/auth',
  title: 'PR Auth API',
  apiContract: { getAuthHealth: healthOperation('getAuthHealth', ['pr-sso']) },
} as const;
