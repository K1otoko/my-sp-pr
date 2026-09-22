import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { createClient } from '@hey-api/openapi-ts';
import {
  API_PREFIX, clientIds, corsResponses, proxyResponses, serviceContracts, fullPath, operationPath,
  type ClientId, type Operation,
} from '../backend/contracts/src/contract.js';
import { clientProjects, contractOutput, documentOutputs } from './api-projects.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const managedDirectories = [
  contractOutput,
  ...Object.values(documentOutputs).map((file) => path.dirname(file)),
  ...Object.values(clientProjects).map((project) => project.output),
].map((directory) => path.join(root, directory));
const run = promisify(execFile);

async function readOptional(file: string): Promise<Buffer | undefined> {
  try {
    return await readFile(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

async function collectFiles(directory: string, relative = ''): Promise<Map<string, Buffer>> {
  const result = new Map<string, Buffer>();
  const entries = await readdir(path.join(directory, relative), { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const name = path.join(relative, entry.name);
    if (entry.isDirectory()) {
      for (const [file, content] of await collectFiles(directory, name)) result.set(file, content);
    } else if (entry.isFile()) {
      result.set(name, await readFile(path.join(directory, name)));
    } else {
      throw new Error(`生成目录中不支持特殊文件：${name}`);
    }
  }
  return result;
}

async function replaceFile(target: string, content: Buffer) {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, content);
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function publish(files: Map<string, Buffer>): Promise<number> {
  const previous = new Map<string, Buffer | undefined>();
  for (const directory of managedDirectories) {
    for (const name of (await collectFiles(directory)).keys()) {
      const target = path.join(directory, name);
      if (!files.has(target)) previous.set(target, await readOptional(target));
    }
  }
  for (const [target, content] of files) {
    const existing = await readOptional(target);
    if (!existing?.equals(content)) previous.set(target, existing);
  }
  try {
    for (const target of previous.keys()) {
      const content = files.get(target);
      if (content) {
        await replaceFile(target, content);
      } else {
        await rm(target);
      }
    }
  } catch (error) {
    // 发布中出现 I/O 错误时，恢复上一次成功生成的文件。
    for (const [target, content] of previous) {
      if (content) await replaceFile(target, content);
      else await rm(target, { force: true });
    }
    throw error;
  }
  return previous.size;
}

const entries = Object.values(serviceContracts).flatMap((service) =>
  Object.values(service.apiContract).map((endpoint) => ({ service, endpoint })),
);

function validate() {
  const operations = new Set<string>();
  const routes = new Set<string>();
  const namespaces: string[] = [];
  for (const [key, service] of Object.entries(serviceContracts)) {
    if (key !== service.service || (key === 'gateway' ? service.namespace !== '' : !/^\/[a-z][a-z0-9-]*$/u.test(service.namespace))) {
      throw new Error(`非法服务标识或命名空间：${key}`);
    }
    if (namespaces.includes(service.namespace)) throw new Error(`命名空间重复：${service.namespace}`);
    namespaces.push(service.namespace);
  }
  for (const { service, endpoint } of entries) {
    const operation: Operation = endpoint;
    const route = `${operation.method} ${fullPath(service, operation).replace(/\{[^}]+\}/gu, '{}')}`;
    if (!/^\/(?:[A-Za-z0-9_-]+|\{[A-Za-z_][A-Za-z0-9_]*\})(?:\/(?:[A-Za-z0-9_-]+|\{[A-Za-z_][A-Za-z0-9_]*\}))*$/u.test(operation.path)) {
      throw new Error(`非法接口路径：${operation.path}`);
    }
    if (!['public', 'internal'].includes(operation.exposure)
      || operation.clients.some((client) => !clientIds.includes(client))
      || (operation.exposure === 'internal' && operation.clients.length > 0)) {
      throw new Error(`公开性或消费者配置错误：${operation.operationId}`);
    }
    if (operations.has(endpoint.operationId) || routes.has(route)) {
      throw new Error(`接口 operationId 或路由重复：${endpoint.operationId} (${route})`);
    }
    operations.add(endpoint.operationId);
    routes.add(route);
  }
  for (const [index, directory] of managedDirectories.entries()) {
    if (managedDirectories.some((other, i) => i !== index && (directory === other || directory.startsWith(`${other}${path.sep}`)))) {
      throw new Error(`生成输出目录冲突：${directory}`);
    }
  }
}

function documentFor(selected: typeof entries, title: string, publicView: boolean) {
  const registry = new OpenAPIRegistry();
  for (const { service, endpoint } of selected) {
    const { exposure, clients, ...definition } = endpoint as typeof endpoint & Operation;
    if (publicView && exposure !== 'public') throw new Error('内部接口不能进入公开文档');
    if (clients.some((client) => !clientIds.includes(client))) throw new Error('未知的前端消费者');
    registry.registerPath({
      ...definition,
      path: operationPath(service, endpoint),
      responses: {
        ...endpoint.responses,
        ...(publicView ? corsResponses : {}),
        ...(publicView && service.service !== 'gateway' ? proxyResponses : {}),
      },
    });
  }
  return new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: '3.0.3',
    info: {
      title,
      version: '0.1.0',
      description: '自动生成，请修改 backend/contracts/src/ 下对应服务的 *.contract.ts 或 shared.ts 后运行 pnpm generate:api。',
    },
    servers: [{ url: API_PREFIX }],
  });
}

async function generate() {
  validate();
  const temporaryRoot = path.join(root, '.api-codegen-tmp');
  await mkdir(temporaryRoot, { recursive: true });
  const temporaryDirectory = await mkdtemp(path.join(temporaryRoot, 'run-'));
  try {
    const compiled = path.join(temporaryDirectory, 'contracts');
    await run(process.execPath, [
      path.join(root, 'node_modules/typescript/bin/tsc'),
      '-p', path.join(root, 'backend/contracts/tsconfig.json'), '--outDir', compiled,
    ]).catch((error: { stdout?: string; stderr?: string }) => {
      throw new Error(`契约编译失败：\n${error.stdout ?? ''}${error.stderr ?? ''}`);
    });
    const files = new Map<string, Buffer>();
    const addFiles = async (source: string, destination: string) => {
      for (const [name, content] of await collectFiles(source)) {
        const target = path.join(root, destination, name);
        if (files.has(target)) throw new Error(`输出文件冲突：${target}`);
        files.set(target, content);
      }
    };
    const publicEntries = entries.filter(({ endpoint }) => (endpoint as Operation).exposure === 'public');
    for (const service of Object.values(serviceContracts)) {
      const selected = service.service === 'gateway'
        ? publicEntries : entries.filter((entry) => entry.service.service === service.service);
      const document = documentFor(selected, service.title, service.service === 'gateway');
      files.set(path.join(root, documentOutputs[service.service]), Buffer.from(`${JSON.stringify(document, null, 2)}\n`));
      console.log(`[api] ${service.service}: ${selected.length} 个接口。`);
    }
    for (const [client, project] of Object.entries(clientProjects)) {
      const selected = publicEntries.filter(({ endpoint }) => (endpoint.clients as readonly ClientId[]).includes(client as ClientId));
      const clientDirectory = path.join(temporaryDirectory, client);
      await createClient({
        input: { ...documentFor(selected, `${client} API`, true) },
        output: { path: clientDirectory, tsConfigPath: path.join(root, project.tsconfig), postProcess: [] },
        plugins: ['@hey-api/typescript', '@hey-api/client-fetch', { name: '@hey-api/sdk', operations: 'flat' }],
      });
      const generated = await collectFiles(clientDirectory);
      for (const required of ['types.gen.ts', 'sdk.gen.ts', 'client.gen.ts']) {
        if (!generated.get(required)?.length) throw new Error(`缺少生成文件：${client}/${required}`);
      }
      await addFiles(clientDirectory, project.output);
    }
    // 最后发布契约 JS，使监听服务重启时其余生成产物已经同步。
    await addFiles(compiled, contractOutput);
    const changed = await publish(files);
    console.log(`[api] 生成成功，更新 ${changed} 个文件。`);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

generate().catch((error: unknown) => {
  console.error('[api] 生成失败，保留上次成功产物。', error);
  process.exitCode = 1;
});
