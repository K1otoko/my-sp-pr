import { stdin, stdout } from 'node:process';
import { AppError } from '../utils/app-error.js';

export async function readPassword(): Promise<string> {
  if (!stdin.isTTY) {
    // 允许受保护输入流；拒绝超限内容，密码不进入进程参数或日志。
    let input = '';
    stdin.setEncoding('utf8');
    for await (const chunk of stdin) {
      input += String(chunk);
      if (input.length > 130) throw new AppError(400, 'INVALID_INPUT', '密码输入过长');
    }
    return input.replace(/\r?\n$/u, '');
  }
  stdout.write('请输入密码（不回显）：');
  stdin.setRawMode(true);
  stdin.setEncoding('utf8');
  stdin.resume();
  return new Promise<string>((resolve, reject) => {
    let value = '';
    const finish = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off('data', onData);
      stdout.write('\n');
    };
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\u0003') {
          finish();
          reject(new AppError(400, 'INVALID_INPUT', '已取消'));
          return;
        }
        if (char === '\r' || char === '\n') {
          finish();
          resolve(value);
          return;
        }
        if (char === '\u007f' || char === '\b') value = Array.from(value).slice(0, -1).join('');
        else if (char.charCodeAt(0) >= 32) value += char;
        if (value.length > 128) {
          finish();
          reject(new AppError(400, 'INVALID_INPUT', '密码输入过长'));
          return;
        }
      }
    };
    stdin.on('data', onData);
  });
}
