import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmod, cp, lstat, mkdir, readFile, readdir, readlink, realpath, rename, rm, stat, symlink, writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

const execute = promisify(execFile);

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`缺少 --${name}`);
  return process.argv[index + 1];
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} 执行失败（${signal ?? code}）`));
    });
  });
}

async function sha256(filename) {
  const details = await lstat(filename);
  const value = details.isSymbolicLink() ? `symlink:${await readlink(filename)}` : await readFile(filename);
  return createHash('sha256').update(value).digest('hex');
}

async function validateTree(directory, relative = '') {
  const files = [];
  for (const entry of await readdir(path.join(directory, relative), { withFileTypes: true })) {
    const name = path.join(relative, entry.name);
    const details = await lstat(path.join(directory, name));
    if (details.isSymbolicLink()) {
      const target = await realpath(path.join(directory, name));
      if (target !== directory && !target.startsWith(`${directory}${path.sep}`)) {
        throw new Error(`制品符号链接越界：${name}`);
      }
      files.push(name);
    } else if (details.isDirectory()) files.push(...await validateTree(directory, name));
    else if (!details.isFile()) throw new Error(`制品包含不支持的文件类型：${name}`);
    else files.push(name);
  }
  return files;
}

async function atomicLink(target, link) {
  const temporary = `${link}.next-${process.pid}`;
  await rm(temporary, { force: true });
  await symlink(target, temporary);
  await rename(temporary, link);
}

async function currentTarget(link) {
  try {
    return await readlink(link);
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
}

async function healthy(url, expectedSha) {
  let lastError;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (expectedSha) {
        const payload = await response.json();
        if (payload.sha !== expectedSha) throw new Error('release SHA 不匹配');
      }
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  throw lastError ?? new Error('健康检查失败');
}

const archive = path.resolve(argument('archive'));
const artifact = path.resolve(argument('work'));
const control = path.resolve(argument('control'));
const listing = (await execute('tar', ['-tzf', archive], { maxBuffer: 10 * 1024 * 1024 })).stdout;
for (const entry of listing.split('\n').filter(Boolean)) {
  const normalized = entry.replace(/^\.\//u, '');
  if (path.isAbsolute(normalized) || normalized.split('/').includes('..')) {
    throw new Error('制品归档包含越界路径');
  }
}
await rm(artifact, { recursive: true, force: true });
await mkdir(artifact, { recursive: true, mode: 0o750 });
await execute('tar', ['-xzf', archive, '-C', artifact]);
const artifactFiles = await validateTree(artifact);
await validateTree(control);
const release = JSON.parse(await readFile(path.join(artifact, 'release.json'), 'utf8'));
if (release.schemaVersion !== 1 || !/^[a-z][a-z0-9-]{1,63}$/u.test(release.unitId)
  || !/^[0-9a-f]{40}$/u.test(release.sha) || !/^[0-9a-f-]{36}$/u.test(release.deploymentId)
  || !['frontend', 'service'].includes(release.kind)) throw new Error('release.json 无效');
const environment = process.env.DEPLOY_ENVIRONMENT;
if (!environment || !/^[a-z][a-z0-9-]{1,63}$/u.test(environment)) throw new Error('发布环境标识无效');
if (process.env.DEPLOY_UNIT_ID !== release.unitId) throw new Error('制品 unit 与 deployment 不匹配');

const checksums = JSON.parse(await readFile(path.join(artifact, 'checksums.json'), 'utf8'));
const expectedFiles = Object.keys(checksums).sort();
const actualFiles = artifactFiles.filter((name) => name !== 'checksums.json').sort();
if (expectedFiles.length !== actualFiles.length
  || expectedFiles.some((name, index) => name !== actualFiles[index])) {
  throw new Error('制品文件清单与摘要不一致');
}
for (const [name, expected] of Object.entries(checksums)) {
  if (typeof expected !== 'string' || path.isAbsolute(name) || name.split(path.sep).includes('..')
    || await sha256(path.join(artifact, name)) !== expected) throw new Error(`制品摘要校验失败：${name}`);
}

const manifest = JSON.parse(await readFile(path.join(control, 'deploy.manifest.json'), 'utf8'));
const unit = manifest.units?.find((candidate) => candidate.id === release.unitId);
if (!unit || unit.kind !== release.kind) throw new Error('制品 manifest 与 release 不匹配');

const runtime = {};
const migration = {};
for (const variable of unit.variables) {
  if (variable.scope === 'build') continue;
  const prefix = variable.sensitive ? 'DEPLOY_SECRET_' : 'DEPLOY_VAR_';
  const value = process.env[`${prefix}${variable.name}`];
  if (variable.required && !value) throw new Error(`缺少 ${variable.scope} 配置：${variable.name}`);
  if (!value) continue;
  (variable.scope === 'migration' ? migration : runtime)[variable.name] = value;
}

const deployRoot = path.resolve(process.env.DEPLOY_ROOT || '/srv/my-sp-pr');
const configRoot = path.resolve(process.env.DEPLOY_CONFIG_ROOT || '/etc/my-sp-pr');
const processEnvironment = Object.fromEntries(
  ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'PM2_HOME']
    .map((name) => [name, process.env[name]])
    .filter((entry) => entry[1]),
);
const base = path.join(deployRoot, release.unitId, environment);
const releases = path.join(base, 'releases');
const releasePath = path.join(releases, `${release.sha}-${release.deploymentId}`);
const current = path.join(base, 'current');
const previous = path.join(base, 'previous');
await mkdir(releases, { recursive: true, mode: 0o750 });
await rm(releasePath, { recursive: true, force: true });
await mkdir(releasePath, { recursive: true, mode: 0o750 });
await cp(path.join(artifact, release.kind === 'frontend' ? 'dist' : 'app'), releasePath, { recursive: true });
await cp(control, path.join(releasePath, '_deploy'), { recursive: true });

let runtimeFile;
if (release.kind === 'service') {
  const configDirectory = path.join(configRoot, release.unitId, environment);
  runtimeFile = path.join(configDirectory, 'runtime.env');
  await mkdir(configDirectory, { recursive: true, mode: 0o700 });
  const lines = ['NODE_ENV="production"', ...Object.entries(runtime).map(([name, value]) => `${name}=${JSON.stringify(value)}`)];
  await writeFile(runtimeFile, `${lines.join('\n')}\n`, { mode: 0o600 });
  await chmod(runtimeFile, 0o600);
}

if (process.env.DEPLOY_RUN_MIGRATION === 'true') {
  if (!unit.migration || release.kind !== 'service') throw new Error('该 unit 不支持数据库迁移');
  await run(process.execPath, [path.join(releasePath, 'dist', 'db', 'migrate.js')], {
    cwd: releasePath,
    env: { ...processEnvironment, ...runtime, ...migration, NODE_ENV: 'production' },
  });
}

const oldCurrent = await currentTarget(current);
if (oldCurrent) await atomicLink(oldCurrent, previous);
await atomicLink(releasePath, current);

const reload = async () => {
  if (release.kind !== 'service') return;
  await run('pm2', [
    'startOrReload',
    path.join(releasePath, '_deploy', 'ecosystem.config.cjs'),
    '--only',
    release.unitId,
    '--update-env',
  ], {
    cwd: releasePath,
    env: {
      ...processEnvironment,
      DEPLOY_UNIT_ID: release.unitId,
      DEPLOY_RELEASE_PATH: releasePath,
      DEPLOY_RUNTIME_ENV_FILE: runtimeFile,
    },
  });
};

try {
  await reload();
  if (unit.internalReadyPath) {
    await healthy(`http://127.0.0.1:${runtime.PORT}${unit.internalReadyPath}`);
  }
  const healthUrl = process.env.DEPLOY_HEALTH_URL;
  if (!healthUrl) throw new Error('缺少公开健康检查 URL');
  await healthy(healthUrl, release.kind === 'frontend' ? release.sha : undefined);
} catch (error) {
  if (oldCurrent) {
    await atomicLink(oldCurrent, current);
    if (release.kind === 'service') {
      const rollbackEnvironment = {
        ...processEnvironment,
        DEPLOY_UNIT_ID: release.unitId,
        DEPLOY_RELEASE_PATH: oldCurrent,
        DEPLOY_RUNTIME_ENV_FILE: runtimeFile,
      };
      await run('pm2', [
        'startOrReload',
        path.join(oldCurrent, '_deploy', 'ecosystem.config.cjs'),
        '--only',
        release.unitId,
        '--update-env',
      ], { cwd: oldCurrent, env: rollbackEnvironment });
    }
  } else {
    await rm(current, { force: true });
    if (release.kind === 'service') await run('pm2', ['delete', release.unitId], { env: processEnvironment }).catch(() => {});
  }
  throw error;
}

await writeFile(path.join(releasePath, '.success'), `${new Date().toISOString()}\n`);
const protectedPaths = new Set([await currentTarget(current), await currentTarget(previous)].filter(Boolean));
const successful = [];
for (const entry of await readdir(releases, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const directory = path.join(releases, entry.name);
  try {
    const marker = await stat(path.join(directory, '.success'));
    successful.push({ directory, modified: marker.mtimeMs });
  } catch {
    // 未成功的 release 不计入保留窗口。
  }
}
successful.sort((left, right) => right.modified - left.modified);
for (const item of successful.slice(5)) {
  if (!protectedPaths.has(item.directory)) await rm(item.directory, { recursive: true, force: true });
}
console.log(`[deploy-install] ${release.unitId} ${release.sha} 已发布到 ${environment}`);
