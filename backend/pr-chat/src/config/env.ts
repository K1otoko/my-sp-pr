import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// 开发 src/config 与生产 dist/config 的相对层级一致，不依赖启动目录。
try {
  loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().trim().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`环境变量配置错误：${z.prettifyError(parsed.error)}`);
}
export const env = {
  nodeEnv: parsed.data.NODE_ENV,
  host: parsed.data.HOST,
  port: parsed.data.PORT,
};
