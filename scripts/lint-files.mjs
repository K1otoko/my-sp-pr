import { stat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = process.argv.slice(2).filter((arg) => arg !== '--');

try {
  if (files.length === 0) {
    throw new Error('请显式指定本次变更文件，例如 pnpm lint -- frontend/pr-chat/src/App.tsx');
  }
  for (const file of files) {
    if (file.startsWith('-') || /[*?[\]{}]/u.test(file)) {
      throw new Error(`不支持选项或 glob：${file}`);
    }
    const absolute = await realpath(path.resolve(root, file));
    const relative = path.relative(root, absolute);
    if (relative.startsWith('..') || path.isAbsolute(relative) || !(await stat(absolute)).isFile()) {
      throw new Error(`只允许项目内的具体文件：${file}`);
    }
    if (!/\.(?:[cm]?js|tsx?)$/u.test(file)) {
      throw new Error(`只接受 JS / MJS / TS / TSX 文件：${file}`);
    }
  }
  const eslint = new ESLint({ cwd: root, fix: false });
  const results = await eslint.lintFiles([...new Set(files)]);
  const formatter = await eslint.loadFormatter('stylish');
  const output = formatter.format(results);
  if (output) console.log(output);
  const issues = results.reduce((count, result) => count + result.errorCount + result.warningCount, 0);
  if (issues > 0) process.exitCode = 1;
  else console.log(`Lint 通过：${results.length} 个指定文件。`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
