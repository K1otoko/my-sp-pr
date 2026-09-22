import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import chokidar from 'chokidar';

const root = fileURLToPath(new URL('../', import.meta.url));
const contract = fileURLToPath(new URL('../backend/contracts/src/', import.meta.url));
const generator = fileURLToPath(new URL('./generate-api.ts', import.meta.url));
let child: ChildProcess | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let pending = false;
let closing = false;

const watcher = chokidar.watch(contract, {
  ignoreInitial: true,
  awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
});

function generate() {
  if (closing || child) return;
  pending = false;
  // 每轮独立进程重新导入契约，避免模块缓存导致生成旧内容。
  child = spawn(process.execPath, ['--import', 'tsx', generator], {
    cwd: root,
    stdio: 'inherit',
  });
  child.on('error', (error) => console.error('[api:watch] 无法启动生成进程。', error));
  child.on('close', (code) => {
    child = undefined;
    if (code !== 0 && !closing) console.error('[api:watch] 本轮失败，等待修复后自动重试。');
    if (pending && !closing) schedule();
  });
}

function schedule() {
  if (closing) return;
  pending = true;
  if (timer) clearTimeout(timer);
  timer = setTimeout(generate, 200);
}

watcher.on('all', (event, file) => {
  if (['add', 'change', 'unlink'].includes(event) && file.endsWith('.ts')) schedule();
});
watcher.on('ready', () => {
  console.log('[api:watch] 正在监听 backend/contracts/src/ 下全部 TypeScript 契约');
  if (!process.argv.includes('--skip-initial')) schedule();
});
watcher.on('error', (error) => {
  console.error('[api:watch] 文件监听失败。', error);
  void shutdown(1);
});

async function shutdown(exitCode = 0) {
  if (closing) return;
  closing = true;
  if (timer) clearTimeout(timer);
  await watcher.close();
  if (child) {
    const running = child;
    const force = setTimeout(() => running.kill('SIGKILL'), 5_000);
    force.unref();
    await new Promise<void>((resolve) => {
      running.once('close', () => { clearTimeout(force); resolve(); });
      running.kill('SIGTERM');
    });
  }
  process.exitCode = exitCode;
}

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
