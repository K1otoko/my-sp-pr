import { healthOperation, readinessOperation } from './shared.js';

export const adminContract = {
  service: 'pr-admin',
  namespace: '/admin',
  title: 'PR Admin API',
  apiContract: {
    getAdminHealth: healthOperation('getAdminHealth', ['pr-admin']),
    getAdminReadiness: readinessOperation('getAdminReadiness'),
  },
} as const;
