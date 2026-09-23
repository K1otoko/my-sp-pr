import { readFile } from 'node:fs/promises';
import process from 'node:process';

const manifest = JSON.parse(await readFile(process.argv[2] ?? 'deploy.manifest.json', 'utf8'));
if (manifest.version !== 1 || !Array.isArray(manifest.units) || !manifest.units.length) {
  throw new Error('manifest version 或 units 无效');
}
const ids = new Set();
for (const unit of manifest.units) {
  if (!unit || !/^[a-z][a-z0-9-]{1,63}$/u.test(unit.id) || ids.has(unit.id)) {
    throw new Error('unit ID 无效或重复');
  }
  ids.add(unit.id);
  const expectedPreset = unit.kind === 'frontend' ? 'pnpm-vite-static-v1'
    : unit.kind === 'service' ? 'pnpm-node-service-v1' : undefined;
  if (!expectedPreset || unit.preset !== expectedPreset) throw new Error(`${unit.id} 的 preset 无效`);
  for (const value of [unit.packagePath, unit.artifactPath]) {
    if (typeof value !== 'string' || !value || value.startsWith('/') || value.includes('\\')
      || value.split('/').some((segment) => segment === '..' || segment === '.')) {
      throw new Error(`${unit.id} 包含无效路径`);
    }
  }
  if (!Array.isArray(unit.variables)) throw new Error(`${unit.id} 的 variables 无效`);
  const variables = new Set();
  for (const variable of unit.variables) {
    if (!/^[A-Z][A-Z0-9_]{1,127}$/u.test(variable.name) || variables.has(variable.name)
      || !['build', 'runtime', 'migration'].includes(variable.scope)
      || typeof variable.required !== 'boolean' || typeof variable.sensitive !== 'boolean'
      || typeof variable.description !== 'string' || !variable.description) {
      throw new Error(`${unit.id} 包含无效或重复变量`);
    }
    if (variable.scope === 'build' && variable.sensitive) throw new Error(`${unit.id} 的 build variable 不能敏感`);
    variables.add(variable.name);
  }
}
process.stdout.write(`[deploy-manifest] ${ids.size} 个 unit 校验通过。\n`);
