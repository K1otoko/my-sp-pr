import { healthOperation } from './shared.js';

export const chatContract = {
  service: 'pr-chat',
  namespace: '/chat',
  title: 'PR Chat API',
  apiContract: { getChatHealth: healthOperation('getChatHealth', ['pr-chat']) },
} as const;
