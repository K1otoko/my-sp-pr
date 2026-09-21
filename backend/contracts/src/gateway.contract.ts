import { clientIds, healthOperation } from './shared.js';

export const gatewayContract = {
  service: 'gateway',
  namespace: '',
  title: 'Gateway 公开 API',
  apiContract: { getGatewayHealth: healthOperation('getGatewayHealth', clientIds) },
} as const;
