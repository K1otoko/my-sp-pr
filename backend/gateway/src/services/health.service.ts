import { serviceContract, type HealthData } from '../api/index.js';

export function getHealthData(): HealthData {
  return {
    status: 'ok',
    service: serviceContract.service,
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
  };
}
