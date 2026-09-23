export * from './shared.js';
export * from './auth-oidc.js';

import { gatewayContract } from './gateway.contract.js';
import { chatContract } from './chat.contract.js';
import { authContract } from './auth.contract.js';
import { adminContract } from './admin.contract.js';

// 各服务接口分文件维护，此处仅登记聚合；新增服务在此追加一行。
export const serviceContracts = {
  gateway: gatewayContract,
  'pr-chat': chatContract,
  'pr-auth': authContract,
  'pr-admin': adminContract,
} as const;

export type ServiceId = keyof typeof serviceContracts;
export type ServiceContract = typeof serviceContracts[ServiceId];
