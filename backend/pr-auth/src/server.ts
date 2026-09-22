import type { Server } from 'node:http';
import { databaseErrorCode } from '@my-sp-pr/database';
import { app } from './app.js';
import { env } from './config/env.js';
import { serviceContract } from './api/index.js';
import { database } from './db/index.js';
import { markClosing } from './services/readiness.service.js';

const label = serviceContract.service;
let server: Server | undefined;
let closing = false;
let shutdownPromise: Promise<void> | undefined;

function shutdown(signal: string): Promise<void> {
  if (shutdownPromise) return shutdownPromise;
  closing = true;
  markClosing();
  console.log(`[${label}] 收到 ${signal}，正在关闭服务。`);
  const timeout = setTimeout(() => {
    console.error(`[${label}] 关闭超时，强制结束剩余连接。`);
    server?.closeAllConnections();
    process.exit(1);
  }, 10_000);
  shutdownPromise = (async () => {
    try {
      if (server?.listening) {
        await new Promise<void>((resolve, reject) => {
          server!.close((error) => error ? reject(error) : resolve());
        });
      }
    } finally {
      await database.close();
    }
  })().catch((error: unknown) => {
      console.error(`[${label}] 关闭失败：`, databaseErrorCode(error));
      process.exitCode = 1;
  }).finally(() => clearTimeout(timeout));
  return shutdownPromise;
}
// Keep listeners installed so repeated signals share the same cleanup.
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await database.checkReady();
  if (!closing) {
    server = app.listen(env.port, env.host, () => {
      console.log(`[${label}] 服务已启动：http://${env.host}:${env.port} (${env.nodeEnv})`);
    });
    server.on('error', (error: NodeJS.ErrnoException) => {
      console.error(error.code === 'EADDRINUSE'
        ? `[${label}] 端口 ${env.port} 已被占用，请停止占用进程或修改 PORT。`
        : `[${label}] 服务启动失败：`, databaseErrorCode(error));
      process.exitCode = 1;
      void shutdown('listen-error');
    });
  }
} catch (error) {
  if (!closing) {
    console.error(`[${label}] 首次数据库检查失败：${databaseErrorCode(error)}。请检查运行账号并执行数据库迁移。`);
    process.exitCode = 1;
    await shutdown('startup-error');
  }
}
