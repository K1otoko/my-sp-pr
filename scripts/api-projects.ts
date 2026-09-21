import type { ClientId, ServiceId } from '../backend/contracts/src/contract.js';

// 这里只维护文件系统映射；服务路径、接口公开性和消费者来自集中契约。
export const contractOutput = 'backend/contracts/dist';
export const documentOutputs: Record<ServiceId, string> = {
  gateway: 'backend/gateway/generated/openapi.json',
  'pr-chat': 'backend/pr-chat/generated/openapi.json',
  'pr-admin': 'backend/pr-admin/generated/openapi.json',
  'pr-auth': 'backend/pr-auth/generated/openapi.json',
};
export const clientProjects: Record<ClientId, { output: string; tsconfig: string }> = {
  'pr-chat': { output: 'frontend/pr-chat/src/api/generated', tsconfig: 'frontend/pr-chat/tsconfig.app.json' },
  'pr-admin': { output: 'frontend/pr-admin/src/api/generated', tsconfig: 'frontend/pr-admin/tsconfig.app.json' },
  'pr-sso': { output: 'frontend/pr-sso/src/api/generated', tsconfig: 'frontend/pr-sso/tsconfig.app.json' },
};
