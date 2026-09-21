import type { ServiceId } from '../api/index.js';
import { env } from './env.js';

export const upstreams: Record<Exclude<ServiceId, 'gateway'>, string> = {
  'pr-chat': env.targets.chat,
  'pr-auth': env.targets.auth,
  'pr-admin': env.targets.admin,
};
