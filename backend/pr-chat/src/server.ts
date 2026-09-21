import { app } from './app.js';
import { env } from './config/env.js';
import { serviceContract } from './api/index.js';

const label = serviceContract.service;

const server = app.listen(env.port, env.host, () => {
  console.log(`[${label}] 服务已启动：http://${env.host}:${env.port} (${env.nodeEnv})`);
});
server.on('error', (error: NodeJS.ErrnoException) => {
  console.error(error.code === 'EADDRINUSE'
    ? `[${label}] 端口 ${env.port} 已被占用，请停止占用进程或修改 PORT。`
    : `[${label}] 服务启动失败：`, error.message);
  process.exitCode = 1;
});

let closing = false;
function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  console.log(`[${label}] 收到 ${signal}，正在关闭服务。`);
  const timeout = setTimeout(() => {
    console.error(`[${label}] 关闭超时，强制结束剩余连接。`);
    server.closeAllConnections();
    process.exit(1);
  }, 10_000);
  timeout.unref();
  server.close((error) => {
    clearTimeout(timeout);
    if (error) {
      console.error(`[${label}] 关闭失败：`, error);
      process.exitCode = 1;
    }
  });
}
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
