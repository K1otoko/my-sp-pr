import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cp, lstat, mkdir, readFile, readdir, readlink, realpath, rm, stat, writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`缺少 --${name}`);
  return process.argv[index + 1];
}

function optionalArgument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? fallback : process.argv[index + 1];
}

function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} 执行失败（${signal ?? code}）`));
    });
  });
}

async function files(directory, relative = '') {
  const result = [];
  for (const entry of await readdir(path.join(directory, relative), { withFileTypes: true })) {
    const name = path.join(relative, entry.name);
    if (entry.isDirectory()) result.push(...await files(directory, name));
    else if (entry.isFile()) result.push(name);
    else if (entry.isSymbolicLink()) {
      const target = await realpath(path.join(directory, name));
      if (target !== directory && !target.startsWith(`${directory}${path.sep}`)) {
        throw new Error(`制品符号链接越界：${name}`);
      }
      result.push(name);
    }
    else throw new Error(`制品包含不支持的文件类型：${name}`);
  }
  return result;
}

async function sha256(filename) {
  const details = await lstat(filename);
  const value = details.isSymbolicLink() ? `symlink:${await readlink(filename)}` : await readFile(filename);
  return createHash('sha256').update(value).digest('hex');
}

const unitId = argument('unit');
const sha = argument('sha');
const deploymentId = argument('deployment-id');
const githubDeploymentId = argument('github-deployment-id');
const output = path.resolve(argument('out'));
const sourceRoot = path.resolve(optionalArgument('source', '.'));
const controlRoot = path.resolve(optionalArgument('control', '.'));
if (!/^[0-9a-f]{40}$/u.test(sha) || !/^[0-9a-f-]{36}$/u.test(deploymentId)
  || !/^[0-9]+$/u.test(githubDeploymentId)) throw new Error('发布标识格式无效');

const manifest = JSON.parse(await readFile(path.join(controlRoot, 'deploy.manifest.json'), 'utf8'));
if (manifest.version !== 1 || !Array.isArray(manifest.units)) throw new Error('deploy.manifest.json 版本无效');
const unit = manifest.units.find((candidate) => candidate.id === unitId);
if (!unit || !['pnpm-vite-static-v1', 'pnpm-node-service-v1'].includes(unit.preset)) {
  throw new Error('发布 unit 或 preset 不受支持');
}
for (const value of [unit.packagePath, unit.artifactPath]) {
  if (typeof value !== 'string' || value.startsWith('/') || value.split('/').includes('..')) {
    throw new Error('manifest 路径无效');
  }
}

let buildVariables = {};
try {
  buildVariables = JSON.parse(process.env.DEPLOY_BUILD_VARIABLES_JSON || '{}');
} catch {
  throw new Error('build variables JSON 无效');
}
if (!buildVariables || typeof buildVariables !== 'object' || Array.isArray(buildVariables)) {
  throw new Error('build variables JSON 必须为对象');
}
const allowedBuildVariables = new Set(unit.variables
  .filter((variable) => variable.scope === 'build' && !variable.sensitive)
  .map((variable) => variable.name));
const buildEnv = { ...process.env };
for (const [name, value] of Object.entries(buildVariables)) {
  if (!allowedBuildVariables.has(name) || typeof value !== 'string') throw new Error(`不允许的 build variable：${name}`);
  buildEnv[name] = value;
}
for (const variable of unit.variables) {
  if (variable.scope === 'build' && variable.required && !buildEnv[variable.name]) {
    throw new Error(`缺少 build variable：${variable.name}`);
  }
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
process.chdir(sourceRoot);
await run('pnpm', ['generate:api'], buildEnv);
if (unit.kind === 'service' && unit.id !== 'gateway') await run('pnpm', ['build:database'], buildEnv);
await run('pnpm', ['--filter', unit.packageName, 'typecheck'], buildEnv);
await run('pnpm', ['--filter', unit.packageName, 'build'], buildEnv);

if (unit.kind === 'frontend') {
  const artifact = path.resolve(unit.artifactPath);
  if (!(await stat(artifact)).isDirectory()) throw new Error('前端构建目录不存在');
  await cp(artifact, path.join(output, 'dist'), { recursive: true });
  await writeFile(path.join(output, 'dist', 'release.json'), `${JSON.stringify({
    unitId,
    sha,
    deploymentId,
  })}\n`);
} else {
  await run('pnpm', ['--filter', unit.packageName, 'deploy', '--prod', '--legacy', path.join(output, 'app')], buildEnv);
  const [scope, packageName] = unit.packageName.split('/');
  if (scope?.startsWith('@') && packageName) {
    await rm(path.join(output, 'app', 'node_modules', '.pnpm', 'node_modules', scope, packageName), { force: true });
  }
  if (!(await stat(path.join(output, 'app', 'dist', 'server.js'))).isFile()) {
    throw new Error('后端部署包缺少 dist/server.js');
  }
  if (unit.migration && !(await stat(path.join(output, 'app', 'dist', 'db', 'migrate.js'))).isFile()) {
    throw new Error('后端部署包缺少迁移入口');
  }
}

await writeFile(path.join(output, 'release.json'), `${JSON.stringify({
  schemaVersion: 1,
  unitId,
  kind: unit.kind,
  preset: unit.preset,
  sha,
  deploymentId,
  githubDeploymentId,
  createdAt: new Date().toISOString(),
})}\n`);

const checksums = {};
for (const name of (await files(output)).sort()) {
  if (name !== 'checksums.json') checksums[name] = await sha256(path.join(output, name));
}
await writeFile(path.join(output, 'checksums.json'), `${JSON.stringify(checksums, null, 2)}\n`);
console.log(`[deploy-build] ${unitId} ${sha} 制品已生成：${output}`);
