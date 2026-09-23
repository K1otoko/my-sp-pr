import { databaseErrorCode } from '@my-sp-pr/database';
import { serviceContract, type ReadinessData } from '../api/index.js';
import { database } from '../db/index.js';
import { checkIdentitySchema } from '../db/check-identity.js';
import { AppError } from '../utils/app-error.js';

let closing = false;
export function markClosing() { closing = true; }

export async function getReadinessData(): Promise<ReadinessData> {
  if (closing) throw new AppError(503, 'DATABASE_NOT_READY', '服务尚未就绪');
  try {
    await database.checkReady();
    await checkIdentitySchema(database.db);
  } catch (error) {
    console.error(`[${serviceContract.service}] 数据库未就绪：${databaseErrorCode(error)}`);
    throw new AppError(503, 'DATABASE_NOT_READY', '服务尚未就绪');
  }
  if (closing) throw new AppError(503, 'DATABASE_NOT_READY', '服务尚未就绪');
  return {
    status: 'ready',
    service: serviceContract.service,
    timestamp: new Date().toISOString(),
    checks: { database: 'ok' },
  };
}
